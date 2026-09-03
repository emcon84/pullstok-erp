import { Request, Response } from "express";

// ===========================================================================
// Landing chat — asistente de IA de la landing (público, SIN auth).
// ---------------------------------------------------------------------------
// El front (pullstok-landing) llama a POST /api/landing-chat y acá se resuelve
// la consulta con Groq. La key de Groq NUNCA sale del backend (solo existe en el
// env DEL SERVIDOR, via process.env.GROQ_API_KEY). Este endpoint es público, por
// eso el rate-limit protege la key de abuso.
// ===========================================================================

// Endpoint compatible con OpenAI que expone Groq. Plain fetch (Node 20 trae
// fetch + AbortSignal.timeout globales) para no sumar una dependencia.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// Límites de la consulta.
const MAX_MESSAGE_LENGTH = 2000; // máx. de caracteres del mensaje del usuario
const HISTORY_LIMIT = 10; // últimos N mensajes que se mandan como historial
const MAX_TOKENS = 600; // tope de tokens de la respuesta
const TIMEOUT_MS = 15000; // timeout del fetch a Groq

// Rate-limit en memoria (sin dependencias): IP → timestamps de requests. Como el
// endpoint es público, esto protege la key de Groq de abuso. Se resetea solo al
// reiniciar el proceso, lo cual es aceptable para este caso de uso.
const WINDOW_MS = 60_000; // ventana de 60 segundos
const MAX_REQUESTS = 6; // máx. de requests por IP dentro de la ventana
const rateLimit = new Map<string, number[]>();

// warn-once (mismo espíritu que botService/mailService): si falta GROQ_API_KEY,
// avisamos una sola vez y devolvemos 503 (no rompe el flujo).
let warnedNoKey = false;

type ChatRole = "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface LandingChatBody {
  message?: string;
  history?: Array<{ role: string; content: string }>;
}

const SYSTEM_PROMPT = `Sos el asistente virtual de Pullstok (https://pullstok.com), el sistema de gestión para comercios y pymes. Respondés en español, con tono cordial y profesional, de forma breve y clara (2 a 5 frases), sin relleno.

QUÉ ES PULLSTOK:
Sistema de gestión integral (ERP) para comercios y pymes de Argentina y LatAm. Reúne en un solo lugar el inventario, las ventas, los clientes, la facturación y la tienda online, sin planillas ni cuadernos. Es multi-rubro: sirve para ferreterías, kioscos, almacenes/minimercados, indumentaria, gastronomía, pet shops/mascotas y comercios en general.

PRINCIPALES CAPACIDADES:
- Stock e inventario en tiempo real: cada venta descuenta stock solo. Carga de productos a mano o importando Excel/CSV. Código de barras (EAN-13/UPC escaneado) y código de proveedor (SKU) por producto. Variantes (tamaños, presentaciones) y categorías en árbol. Marcador "lo trabajo" para filtrar lo que el negocio realmente vende y publicación selectiva a la tienda online.
- Multi-sucursal: stock por sucursal, asignación de sucursales por usuario y resumen de stock de toda la organización. Según plan.
- Ventas y operación diaria: ventas en segundos que actualizan stock; presupuestos, pedidos y remitos; clientes con cuenta corriente e historial de compras; caja (apertura/cierre) y pagos.
- Venta de alimento suelto por kg (pet shops / mascotas): precio por kilo, stock en kilos, trabajo con balanza (etiquetas/códigos de balanza Systel Cuora / Qendra) y lookup por código al escanear.
- Facturación electrónica ARCA/AFIP: comprobantes Factura A y B con tus datos fiscales (CUIT, condición de IVA), CAE, código QR de AFIP y PDF homologado; exportables y con integración electrónica.
- Tienda online propia: cada negocio puede tener su tienda en su subdominio (negocio.pullstok.com) con catálogo y carrito, que se nutre del mismo stock del sistema. Sin programar.
- Asistente de IA + chat: un bot con IA que responde 24/7 a tus clientes con la información del negocio (productos, horarios, envíos), y chat en vivo con aviso cuando alguien pide hablar con una persona. Notificaciones por email automáticas.
- Import de listas de precios de proveedores: cargás la planilla del proveedor (p. ej. PDF/planilla) y el sistema matchea los productos, sugiere precios mayoristas y actualiza en masa.
- Seguridad y multiusuario: cada negocio tiene sus datos completamente aislados (multi-tenant), roles y permisos (dueño/admin, vendedor, cajero) y acceso por usuario.
- Reportes y dashboard: ventas, presupuestos, pedidos y stock con números reales para decidir con datos.
- Onboarding guiado: al crear la cuenta elegís tu rubro y se configuran las categorías sugeridas para arrancar rápido.
- Escáner y offline: lectura de códigos de barras con la cámara y catálogo offline para el punto de venta.

PLANES (precios en pesos argentinos, IVA incluido; anual -20%):
- Básico $35.000/mes: 2 usuarios, hasta 500 productos, control de stock, ventas y clientes. Sin tienda online.
- Pro $70.000/mes: 10 usuarios, productos ilimitados, tienda online (hasta 100 productos), presupuestos, pedidos y remitos, facturación y comprobantes, reportes y emails automáticos.
- Premium $130.000/mes: usuarios ilimitados, productos ilimitados, tienda online ilimitada, chat en vivo, asistente IA, soporte prioritario y multi-sucursal (próximamente).

CÓMO PROBAR: no hace falta tarjeta. Demo: https://app.pullstok.com/?demo=1 · Ingreso: https://app.pullstok.com

REGLA CLAVE:
- Respondé SOLO sobre Pullstok y consultas de gestión/comercio que puedas responder con esta info.
- Para precios y fechas exactas, remití a la sección de precios de pullstok.com o al formulario de contacto.
- Si te preguntan algo fuera de Pullstok, respondé amablemente que sos el asistente de Pullstok y ofrecé ayudar con el producto.`;

/**
 * Resuelve la IP del cliente. Detrás de un proxy (Nginx/Cloudflare) la IP real
 * viene en x-forwarded-for (el primer valor es el cliente). Fallback al socket.
 */
const resolveIp = (req: Request): string =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  "desconocido";

/**
 * Rate-limit: limpia timestamps fuera de la ventana, cuenta los de la ventana y,
 * si excede el máximo, no permite la request. A cada request el timestamp se
 * agrega al Map a nivel módulo (no bloquea a otras IPs).
 */
const isRateLimited = (ip: string): boolean => {
  const now = Date.now();
  const timestamps = (rateLimit.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS) {
    rateLimit.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  rateLimit.set(ip, timestamps);
  return false;
};

// Normaliza el historial: SOLO los últimos HISTORY_LIMIT, solo roles válidos,
// cada content truncado a MAX_MESSAGE_LENGTH.
const sanitizeHistory = (history?: Array<{ role: string; content: string }>): ChatMessage[] =>
  (history ?? [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: m.role as ChatRole,
      content: String(m.content ?? "").slice(0, MAX_MESSAGE_LENGTH),
    }))
    .slice(-HISTORY_LIMIT);

export const landingChat = async (req: Request, res: Response): Promise<void> => {
  const ip = resolveIp(req);

  // Rate-limit: antes de validar nada ni tocar Groq (protege la key).
  if (isRateLimited(ip)) {
    res
      .status(429)
      .json({ error: "Muy seguido. Esperá un momento y probá de nuevo." });
    return;
  }

  const { message, history } = (req.body ?? {}) as LandingChatBody;

  // Validación del mensaje.
  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "Mensaje inválido" });
    return;
  }
  if (message.trim().length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: "Mensaje inválido" });
    return;
  }

  // Si falta la key, 503 y avisamos una sola vez (no rompe nada más).
  if (!process.env.GROQ_API_KEY) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn(
        "[landingChat] GROQ_API_KEY no configurada — el asistente de la landing no responde.",
      );
    }
    res
      .status(503)
      .json({ error: "El asistente no está disponible en este momento." });
    return;
  }

  const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...sanitizeHistory(history),
    { role: "user", content: message.trim() },
  ];

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        messages: chatMessages,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!groqRes.ok) {
      const detail = await groqRes.text().catch(() => "");
      console.error(
        `[landingChat] Groq respondió ${groqRes.status}: ${detail.slice(0, 300)}`,
      );
      res
        .status(502)
        .json({ error: "No pude procesar la consulta. Probá de nuevo." });
      return;
    }

    const data = (await groqRes.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = data.choices?.[0]?.message?.content;

    if (!content || content.trim().length === 0) {
      res
        .status(502)
        .json({ error: "No pude procesar la consulta. Probá de nuevo." });
      return;
    }

    res.json({ reply: content.trim() });
  } catch (err) {
    console.error("[landingChat] fallo llamando a Groq", err);
    res
      .status(503)
      .json({ error: "El asistente no está disponible en este momento." });
  }
};

export default { landingChat };
