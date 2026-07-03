import type { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyToken, AccessTokenPayload } from "../utils/jwtUtils";
import { UserRole } from "../config/tenantContext";

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
export interface SocketData {
  userId: string;
  role: UserRole;
  organizationId: string;
}

// Instancia singleton a nivel módulo: permite emitir desde cualquier parte del
// backend sin arrastrar el http server ni caer en imports circulares.
let io: Server | undefined;

// Nombre de la room por organización — un único lugar para el formato.
const orgRoom = (organizationId: string): string => `org:${organizationId}`;

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

  // Auth middleware: valida el JWT en el handshake con el MISMO util que el
  // authMiddleware HTTP. Sin token válido no hay conexión (y por lo tanto no
  // hay forma de espiar eventos de otra org).
  io.use((socket: Socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.query?.token as string | undefined);

    if (!token) {
      return next(new Error("unauthorized"));
    }

    try {
      const payload = verifyToken<AccessTokenPayload>(token);
      // Sin organización no se puede unir a ninguna room de tenant (el
      // SUPERADMIN de plataforma no tiene org → no participa de este canal).
      if (!payload.organizationId) {
        return next(new Error("unauthorized"));
      }
      const data: SocketData = {
        userId: payload.id,
        role: payload.role,
        organizationId: payload.organizationId,
      };
      socket.data = data;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const { userId, organizationId } = socket.data as SocketData;

    // Aislamiento multi-tenant: cada socket vive en la room de su organización.
    // Mismo principio que la extensión anti-fuga de Prisma — un comercio nunca
    // recibe eventos de otro.
    socket.join(orgRoom(organizationId));
    console.log(
      `[socket] connected user=${userId} org=${organizationId} id=${socket.id}`,
    );

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

/** Acceso a la instancia (por si se necesita en el futuro, p.ej. chat). */
export const getIo = (): Server | undefined => io;
