import type { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import {
  verifyToken,
  AccessTokenPayload,
  GuestTokenPayload,
} from "../utils/jwtUtils";
import { UserRole } from "../config/tenantContext";
import { basePrisma } from "../config/db";
// import TYPE-only: se borra en compilación → NO crea ciclo en runtime
// (chatService importa los helpers de emisión de este módulo, nunca al revés).
import type { MessageDTO } from "../services/chatService";
// markRead vive en su propio módulo (services/chatReads) que NO importa realtime,
// así el socket lo usa sin formar ciclo. Ver services/chatReads.ts.
import { markRead } from "../services/chatReads";

/**
 * Infra de tiempo real (socket.io). Emite SEÑALES livianas (sin datos de
 * negocio) para que los clientes del mismo comercio invaliden sus queries y
 * refetcheen. Diseñado para ser reusable: la auth por JWT y el aislamiento por
 * rooms (`org:<id>`) son la base para un futuro chat cliente↔operador.
 *
 * IMPORTANTE (dependencias circulares): este módulo NO importa controllers ni
 * services. Los controllers/services importan el helper `emitOrdersChanged`.
 * Así el grafo de imports queda unidireccional (controllers → realtime).
 */

// Datos que colgamos de cada socket autenticado (análogo al TenantContext HTTP).
// Discriminados por `kind`: un operador (usuario con cuenta) escucha eventos de
// TODA su org (room `org:`); un guest (visitante de la tienda, sin cuenta) SOLO
// de SU conversación (room `conv:`). El role "GUEST" no pertenece a UserRole.
export interface OperatorSocketData {
  kind: "operator";
  userId: string;
  role: UserRole;
  organizationId: string;
}

export interface GuestSocketData {
  kind: "guest";
  role: "GUEST";
  organizationId: string;
  conversationId: string;
  guestEmail: string;
}

export type SocketData = OperatorSocketData | GuestSocketData;

// Instancia singleton a nivel módulo: permite emitir desde cualquier parte del
// backend sin arrastrar el http server ni caer en imports circulares.
let io: Server | undefined;

// Nombres de rooms — un único lugar para cada formato.
// `org:<id>`  → todos los operadores de una organización.
// `conv:<id>` → participantes de UNA conversación (guest + operador que la abrió).
const orgRoom = (organizationId: string): string => `org:${organizationId}`;
const CONV_PREFIX = "conv:";
const convRoom = (conversationId: string): string =>
  `${CONV_PREFIX}${conversationId}`;

// ===========================================================================
// FASE D — eventos efímeros: typing, presencia y read receipts.
// Ver el CONTRATO de eventos en el resumen de la feature. Nada de esto persiste
// (salvo el marcado de "visto", que reusa markRead → solo toca Message.readAt).
// ===========================================================================

// El "lado" de la conversación al que pertenece un socket. Coincide 1:1 con los
// valores de MessageSender ("GUEST" | "OPERATOR"), así markRead recibe el rol tal
// cual sin traducción.
type Party = "GUEST" | "OPERATOR";
const partyOf = (data: SocketData): Party =>
  data.kind === "guest" ? "GUEST" : "OPERATOR";

/**
 * Cuenta cuántos sockets de un `party` están presentes en la room de una
 * conversación (base de la presencia con múltiples pestañas). `excludeSocketId`
 * permite descontar al propio socket cuando todavía figura en la room (p.ej. en
 * `disconnecting`, antes de que socket.io lo saque, o justo antes de un leave).
 */
const countPartyInRoom = async (
  conversationId: string,
  party: Party,
  excludeSocketId?: string,
): Promise<number> => {
  if (!io) return 0;
  const sockets = await io.in(convRoom(conversationId)).fetchSockets();
  return sockets.filter(
    (s) =>
      s.id !== excludeSocketId && partyOf(s.data as SocketData) === party,
  ).length;
};

/**
 * Pertenencia LIVIANA para eventos efímeros de alta frecuencia (typing): el
 * guest solo puede hablar de SU conversación (la del token); el operador, de una
 * conv en cuya room ya está (haber entrado con chat:join ya validó que es de su
 * org → sin query extra por cada tecla).
 */
const socketBelongsToConv = (
  socket: Socket,
  conversationId: string,
): boolean => {
  const data = socket.data as SocketData;
  if (data.kind === "guest") return data.conversationId === conversationId;
  return socket.rooms.has(convRoom(conversationId));
};

/**
 * Pertenencia AUTORITATIVA para escritura (read receipts, que tocan DB): guest =
 * su conv; operador = si ya está en la room vale (join ya validó la org), y si no
 * se verifica contra la DB con scope de org a mano (basePrisma, igual que
 * chat:join) para no confiar en el conversationId crudo.
 */
const socketOwnsConvForWrite = async (
  socket: Socket,
  conversationId: string,
): Promise<boolean> => {
  const data = socket.data as SocketData;
  if (data.kind === "guest") return data.conversationId === conversationId;
  if (socket.rooms.has(convRoom(conversationId))) return true;
  const conv = await basePrisma.conversation.findFirst({
    where: { id: conversationId, organizationId: data.organizationId },
    select: { id: true },
  });
  return Boolean(conv);
};

/**
 * Presencia al ENTRAR a la room de una conversación (guest al conectar; operador
 * en chat:join). Debe llamarse DESPUÉS del socket.join. Hace dos cosas:
 *  1. Si soy el PRIMER socket de mi party → aviso a la contraparte que este lado
 *     pasó a `online: true` (transición; segundas pestañas no re-emiten).
 *  2. SNAPSHOT: le informo al que entra el `online` REAL de la contraparte, para
 *     que sepa si el otro ya estaba conectado (calculado mirando la room).
 */
const announcePresenceOnJoin = async (
  socket: Socket,
  conversationId: string,
): Promise<void> => {
  if (!io) return;
  const party = partyOf(socket.data as SocketData);
  const counterparty: Party = party === "GUEST" ? "OPERATOR" : "GUEST";

  const mineBefore = await countPartyInRoom(conversationId, party, socket.id);
  if (mineBefore === 0) {
    socket
      .to(convRoom(conversationId))
      .emit("chat:presence", { conversationId, party, online: true });
  }

  const counterCount = await countPartyInRoom(conversationId, counterparty);
  socket.emit("chat:presence", {
    conversationId,
    party: counterparty,
    online: counterCount > 0,
  });
};

/**
 * Presencia al SALIR de la room (operador en chat:leave o desconexión de
 * cualquiera). Debe llamarse mientras el socket TODAVÍA figura en la room (se lo
 * descuenta por id). Emite `online: false` a la contraparte SOLO si no queda
 * ningún otro socket de mi party → maneja bien el caso multi-pestaña.
 */
const announcePresenceOnLeave = async (
  socket: Socket,
  conversationId: string,
): Promise<void> => {
  const party = partyOf(socket.data as SocketData);
  const remaining = await countPartyInRoom(conversationId, party, socket.id);
  if (remaining === 0) {
    socket
      .to(convRoom(conversationId))
      .emit("chat:presence", { conversationId, party, online: false });
  }
};

/**
 * Registra los handlers efímeros comunes a guest y operador: `chat:typing`
 * (relay puro, sin DB) y `chat:read` (marca "visto" y avisa al emisor original).
 * Todo envuelto en try/catch: un error de un evento efímero JAMÁS debe tirar la
 * conexión.
 */
const registerEphemeralHandlers = (socket: Socket): void => {
  const party = partyOf(socket.data as SocketData);

  // typing — efímero, NO toca DB. Se valida solo pertenencia a la room y se
  // relaya al resto (nunca al emisor).
  socket.on(
    "chat:typing",
    (payload: { conversationId?: string; isTyping?: boolean }) => {
      try {
        const conversationId = payload?.conversationId;
        if (!conversationId || typeof payload?.isTyping !== "boolean") return;
        if (!socketBelongsToConv(socket, conversationId)) return;
        socket.to(convRoom(conversationId)).emit("chat:typing", {
          conversationId,
          from: party,
          isTyping: payload.isTyping,
        });
      } catch (err) {
        console.error("[socket] chat:typing failed", err);
      }
    },
  );

  // read receipts — marca como leídos los mensajes de la CONTRAPARTE y avisa a la
  // room (excepto al emisor) para que el emisor original vea el "visto" en vivo.
  socket.on("chat:read", async (payload: { conversationId?: string }) => {
    try {
      const conversationId = payload?.conversationId;
      if (!conversationId) return;
      if (!(await socketOwnsConvForWrite(socket, conversationId))) return;
      const readAt = await markRead(conversationId, party);
      socket.to(convRoom(conversationId)).emit("chat:read", {
        conversationId,
        reader: party,
        readAt: readAt.toISOString(),
      });
    } catch (err) {
      console.error("[socket] chat:read failed", err);
    }
  });

  // Presencia OFFLINE al desconectar: en `disconnecting` el socket todavía figura
  // en sus rooms, así que podemos calcular quién queda. Recorremos SUS rooms de
  // conversación (un operador puede tener varias abiertas; un guest, una).
  socket.on("disconnecting", async () => {
    try {
      const convRooms = [...socket.rooms].filter((r) =>
        r.startsWith(CONV_PREFIX),
      );
      for (const room of convRooms) {
        const conversationId = room.slice(CONV_PREFIX.length);
        await announcePresenceOnLeave(socket, conversationId);
      }
    } catch (err) {
      console.error("[socket] presence on disconnecting failed", err);
    }
  });
};

/**
 * Inicializa socket.io sobre el http server dado. Reusa el MISMO allowlist de
 * CORS que el express app (env CORS_ORIGINS) para no divergir configuraciones.
 */
export const initSocket = (httpServer: HttpServer): Server => {
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Los stores de la tienda son multi-tenant por subdominio (`*.pullstok.com`),
  // así que una lista fija no alcanza para el widget de chat (socket directo
  // browser→API desde `<slug>.pullstok.com`). CORS_ORIGIN_SUFFIXES permite
  // habilitar un sufijo comodín (ej. ".pullstok.com") sin enumerar cada comercio.
  // El HTTP de la tienda va server-to-server (proxy Astro), no toca este CORS.
  const wildcardSuffixes = (process.env.CORS_ORIGIN_SUFFIXES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const isAllowedOrigin = (origin?: string): boolean => {
    if (!origin) return true; // clientes no-browser (server-to-server, tests)
    if (allowedOrigins.includes(origin)) return true;
    try {
      const { hostname, protocol } = new URL(origin);
      if (protocol !== "https:" && protocol !== "http:") return false;
      return wildcardSuffixes.some(
        (suf) => hostname === suf.replace(/^\./, "") || hostname.endsWith(suf),
      );
    } catch {
      return false;
    }
  };

  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    },
  });

  // Auth middleware: valida el JWT en el handshake con el MISMO secreto que el
  // authMiddleware HTTP. Sin token válido no hay conexión (y por lo tanto no
  // hay forma de espiar eventos de otra org). Acepta DOS tipos de token:
  //  - Operador: AccessTokenPayload (role ADMIN/EMPLOYEE/SUPERADMIN, sin
  //    conversationId) → escucha su org entera.
  //  - Guest: GuestTokenPayload (role "GUEST" + conversationId) → escucha SOLO
  //    su conversación.
  // Ambos se firman con el mismo secreto, así que un único verifyToken sirve; el
  // `role` del payload discrimina cuál es (nunca se aceptan cruzados).
  io.use((socket: Socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.query?.token as string | undefined);

    if (!token) {
      return next(new Error("unauthorized"));
    }

    try {
      const payload = verifyToken<AccessTokenPayload | GuestTokenPayload>(token);

      // --- GUEST ---
      if (payload.role === "GUEST") {
        const guest = payload as GuestTokenPayload;
        // Un guest SIN conversación no tiene a qué room unirse → se rechaza.
        if (!guest.organizationId || !guest.conversationId) {
          return next(new Error("unauthorized"));
        }
        const data: GuestSocketData = {
          kind: "guest",
          role: "GUEST",
          organizationId: guest.organizationId,
          conversationId: guest.conversationId,
          guestEmail: guest.guestEmail,
        };
        socket.data = data;
        return next();
      }

      // --- OPERADOR ---
      const op = payload as AccessTokenPayload;
      // Sin organización no se puede unir a ninguna room de tenant (el
      // SUPERADMIN de plataforma no tiene org → no participa de este canal).
      if (!op.organizationId) {
        return next(new Error("unauthorized"));
      }
      const data: OperatorSocketData = {
        kind: "operator",
        userId: op.id,
        role: op.role,
        organizationId: op.organizationId,
      };
      socket.data = data;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const data = socket.data as SocketData;

    // FASE D: handlers efímeros comunes (typing, read, presencia-offline). Se
    // registran para AMBOS tipos de socket antes de bifurcar.
    registerEphemeralHandlers(socket);

    // --- GUEST ---
    // Un visitante vive SOLO en la room de su conversación (nunca en `org:`):
    // no puede recibir mensajes de otras conversaciones ni de otros comercios.
    // No usa chat:join/leave (ya está en su room desde el connect).
    if (data.kind === "guest") {
      socket.join(convRoom(data.conversationId));
      console.log(
        `[socket] connected guest=${data.guestEmail} conv=${data.conversationId} org=${data.organizationId} id=${socket.id}`,
      );
      // Presencia: aviso "GUEST online" a la room + snapshot del estado del
      // operador para el guest que recién entra.
      void announcePresenceOnJoin(socket, data.conversationId);

      socket.on("disconnect", (reason) => {
        console.log(
          `[socket] disconnected guest=${data.guestEmail} conv=${data.conversationId} id=${socket.id} reason=${reason}`,
        );
      });
      return;
    }

    // --- OPERADOR ---
    // Aislamiento multi-tenant: cada operador vive en la room de su organización.
    // Mismo principio que la extensión anti-fuga de Prisma — un comercio nunca
    // recibe eventos de otro.
    const { userId, organizationId } = data;
    socket.join(orgRoom(organizationId));
    console.log(
      `[socket] connected user=${userId} org=${organizationId} id=${socket.id}`,
    );

    // Suscripción a una conversación concreta: mientras el operador la tiene
    // abierta se une a `conv:<id>` y recibe sus `chat:message` en vivo. Se
    // valida SIEMPRE que la conversación sea de SU org antes de unir (anti-fuga:
    // no se confía en el conversationId crudo del cliente).
    socket.on("chat:join", async (payload: { conversationId?: string }) => {
      const conversationId = payload?.conversationId;
      if (!conversationId) return;
      try {
        // basePrisma (sin extensión de tenant): acá NO hay runWithTenant, así
        // que el scope de org se aplica a mano en el where. Es la vía segura.
        const conv = await basePrisma.conversation.findFirst({
          where: { id: conversationId, organizationId },
          select: { id: true },
        });
        if (!conv) {
          socket.emit("chat:error", {
            event: "chat:join",
            conversationId,
            message: "conversation not found in your organization",
          });
          return;
        }
        socket.join(convRoom(conversationId));
        // Presencia: aviso "OPERATOR online" a la room + snapshot del estado del
        // guest para el operador que abre la conversación.
        await announcePresenceOnJoin(socket, conversationId);
      } catch (err) {
        console.error("[socket] chat:join failed", err);
        socket.emit("chat:error", {
          event: "chat:join",
          conversationId,
          message: "join failed",
        });
      }
    });

    socket.on("chat:leave", async (payload: { conversationId?: string }) => {
      const conversationId = payload?.conversationId;
      if (!conversationId) return;
      try {
        // Presencia: se calcula ANTES del leave (el socket aún figura en la room
        // y se descuenta por id). Si no queda otra pestaña del operador → offline.
        await announcePresenceOnLeave(socket, conversationId);
      } catch (err) {
        console.error("[socket] presence on chat:leave failed", err);
      }
      socket.leave(convRoom(conversationId));
    });

    socket.on("disconnect", (reason) => {
      // socket.io saca al socket de sus rooms automáticamente al desconectar;
      // no hay estado propio que limpiar acá.
      console.log(
        `[socket] disconnected user=${userId} org=${organizationId} id=${socket.id} reason=${reason}`,
      );
    });
  });

  return io;
};

/**
 * Señal "los pedidos de esta org cambiaron". El front que escucha invalida su
 * query `['orders']` y refetchea (NO mandamos datos por el socket). No-op
 * seguro si socket.io todavía no se inicializó (p.ej. en tests o scripts).
 */
export const emitOrdersChanged = (organizationId: string): void => {
  if (!io) return;
  io.to(orgRoom(organizationId)).emit("orders:changed");
};

/**
 * Entrega un mensaje nuevo, EN VIVO y con datos, a la room de su conversación:
 * lo reciben el guest (siempre en su room) y el operador que la tenga abierta
 * (se unió con chat:join). No-op seguro si socket.io aún no se inicializó.
 */
export const emitChatMessage = (
  conversationId: string,
  message: MessageDTO,
): void => {
  if (!io) return;
  io.to(convRoom(conversationId)).emit("chat:message", message);
};

/**
 * Señal "una conversación de esta org cambió" para TODOS los operadores del
 * comercio (room `org:`): que la lista/badge de no-leídos se refresque aunque
 * no tengan esa conversación abierta. Va sin datos de negocio, solo el id.
 */
export const emitConversationUpdated = (
  organizationId: string,
  conversationId: string,
): void => {
  if (!io) return;
  io.to(orgRoom(organizationId)).emit("chat:conversation-updated", {
    conversationId,
  });
};

/** Acceso a la instancia (por si se necesita en el futuro, p.ej. chat). */
export const getIo = (): Server | undefined => io;
