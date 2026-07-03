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
const convRoom = (conversationId: string): string => `conv:${conversationId}`;

/**
 * Inicializa socket.io sobre el http server dado. Reusa el MISMO allowlist de
 * CORS que el express app (env CORS_ORIGINS) para no divergir configuraciones.
 */
export const initSocket = (httpServer: HttpServer): Server => {
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
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

    // --- GUEST ---
    // Un visitante vive SOLO en la room de su conversación (nunca en `org:`):
    // no puede recibir mensajes de otras conversaciones ni de otros comercios.
    // No usa chat:join/leave (ya está en su room desde el connect).
    if (data.kind === "guest") {
      socket.join(convRoom(data.conversationId));
      console.log(
        `[socket] connected guest=${data.guestEmail} conv=${data.conversationId} org=${data.organizationId} id=${socket.id}`,
      );

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
      } catch (err) {
        console.error("[socket] chat:join failed", err);
        socket.emit("chat:error", {
          event: "chat:join",
          conversationId,
          message: "join failed",
        });
      }
    });

    socket.on("chat:leave", (payload: { conversationId?: string }) => {
      const conversationId = payload?.conversationId;
      if (!conversationId) return;
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
