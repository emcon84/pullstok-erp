// Widget de chat flotante del VISITANTE (Fase C2). Único island interactivo de
// la tienda; se monta en BaseLayout con client:idle → aparece en todas las
// páginas. Arquitectura híbrida:
//   - HTTP (iniciar chat + enviar mensaje) → proxy same-origin de Astro
//     (/api/chat/start, /api/chat/message) porque la API pública no tiene CORS
//     para el origin de la tienda.
//   - Socket (recibir en vivo) → DIRECTO browser→API vía PUBLIC_SOCKET_ORIGIN.
//     El guest token lleva el conversationId → el server lo une a su room y le
//     emite chat:message.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  chatSession,
  setChatSession,
  type ChatMessage,
  type ChatSession,
} from "@/lib/chat";

// Origin de la API para el browser (socket directo). PUBLIC_* lo expone Vite al
// cliente. Dev: localhost:5000. En prod hay que setearlo al origin real de la
// API (ej. https://app.pullstok.com) — ver .env.example de la tienda.
const SOCKET_ORIGIN = import.meta.env.PUBLIC_SOCKET_ORIGIN ?? "http://localhost:5000";

interface Props {
  primaryColor: string;
  storeName: string;
  // Número de contacto del negocio (StoreSettings.contactPhone). Si es null/vacío
  // no se muestra el botón "Seguir por WhatsApp".
  whatsappPhone?: string | null;
}

const timeFmt = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });

// Deja solo dígitos: saca +, espacios, guiones, paréntesis, etc. wa.me espera el
// número en formato internacional sin símbolos (código de país incluido).
function toWaDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export default function ChatWidget({ primaryColor, storeName, whatsappPhone }: Props) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [input, setInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [operatorOnline, setOperatorOnline] = useState(false);
  const [operatorTyping, setOperatorTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Handoff a humano: se prende al hacer POST /api/chat/escalate con éxito. El
  // mensaje puente ("Te conecto con una persona 🙌") llega solo por socket.
  const [escalated, setEscalated] = useState(false);
  const [escalating, setEscalating] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Refs para leer estado "vivo" dentro de handlers del socket / timers sin
  // recrear el socket (que dispararía reconexión). Se sincronizan por efecto.
  const openRef = useRef(open);
  const sessionRef = useRef(session);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { sessionRef.current = session; }, [session]);

  // Typing (emisión): typingSentRef = si ya emitimos isTyping:true; idleTimer =
  // corta con isTyping:false tras la inactividad. Así no emitimos por tecla.
  const typingSentRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timeout de seguridad para ocultar "escribiendo…" del operador si nunca
  // llega el isTyping:false.
  const operatorTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Emite chat:read para la conversación actual (visto de mensajes del operador).
  const emitRead = useCallback(() => {
    const socket = socketRef.current;
    const convId = sessionRef.current?.conversationId;
    if (socket?.connected && convId) socket.emit("chat:read", { conversationId: convId });
  }, []);

  // Emite chat:typing con el estado dado.
  const emitTyping = useCallback((isTyping: boolean) => {
    const socket = socketRef.current;
    const convId = sessionRef.current?.conversationId;
    if (socket?.connected && convId) socket.emit("chat:typing", { conversationId: convId, isTyping });
  }, []);

  // Corta el "escribiendo…" propio: limpia el timer y emite false si estaba activo.
  const stopTyping = useCallback(() => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (typingSentRef.current) { typingSentRef.current = false; emitTyping(false); }
  }, [emitTyping]);

  // onChange del input: emite true una sola vez y reprograma el corte a 2s de
  // inactividad (throttle real: nunca emitimos en cada tecla).
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    if (!value.trim()) { stopTyping(); return; }
    if (!typingSentRef.current) { typingSentRef.current = true; emitTyping(true); }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      typingSentRef.current = false;
      emitTyping(false);
      idleTimerRef.current = null;
    }, 2000);
  }, [emitTyping, stopTyping]);

  // Append con dedup por id: el socket nos re-emite NUESTRO propio mensaje (el
  // emisor está en su room), y además appendeamos la respuesta del POST → sin
  // este dedup habría doble render. Con functional update la fn es estable.
  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }, []);

  // Re-hidratar el hilo llamando /start con el email guardado: el backend reusa
  // la conversación OPEN, refresca el token (expira a 7d) y devuelve el
  // historial. Si falla la red, se conserva la sesión guardada (el token viejo
  // sigue sirviendo para el socket).
  const resume = useCallback(async (saved: ChatSession) => {
    try {
      const res = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saved.name, email: saved.email }),
      });
      const data = await res.json();
      if (!res.ok) return;
      const refreshed: ChatSession = {
        conversationId: data.conversationId,
        token: data.token,
        email: saved.email,
        name: saved.name,
      };
      setChatSession(refreshed);
      setSession(refreshed);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      /* offline: mantenemos la sesión guardada, el socket reintenta solo */
    }
  }, []);

  // Al montar: si hay sesión persistida, mostrar el hilo y re-hidratarlo.
  useEffect(() => {
    const saved = chatSession.get();
    if (saved) {
      setSession(saved);
      void resume(saved);
    }
  }, [resume]);

  // Ciclo de vida del socket: se (re)crea cuando cambia el token. socket.io
  // maneja la reconexión solo; re-adjuntamos listeners en cada montaje del
  // efecto. Limpieza en unmount o cambio de token.
  useEffect(() => {
    const token = session?.token;
    if (!token) return;

    const socket = io(SOCKET_ORIGIN, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // Si el panel ya estaba abierto al (re)conectar, marcamos visto.
      if (openRef.current) emitRead();
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setOperatorTyping(false);
    });

    socket.on("chat:message", (msg: ChatMessage) => {
      appendMessage(msg);
      // El operador ya dejó de escribir cuando manda el mensaje.
      if (msg.sender === "OPERATOR") {
        setOperatorTyping(false);
        if (operatorTypingTimerRef.current) clearTimeout(operatorTypingTimerRef.current);
        // Si el visitante lo está viendo, marcamos visto al instante.
        if (openRef.current) emitRead();
      }
    });

    // "Escribiendo…" del operador. Ocultamos con isTyping:false o, por las
    // dudas, con un timeout de seguridad de 4s si nunca llega el false.
    socket.on("chat:typing", (p: { from: "GUEST" | "OPERATOR"; isTyping: boolean }) => {
      if (p.from !== "OPERATOR") return;
      setOperatorTyping(p.isTyping);
      if (operatorTypingTimerRef.current) clearTimeout(operatorTypingTimerRef.current);
      if (p.isTyping) {
        operatorTypingTimerRef.current = setTimeout(() => setOperatorTyping(false), 4000);
      }
    });

    // Presencia del operador (snapshot al conectar + updates en vivo).
    socket.on("chat:presence", (p: { party: "GUEST" | "OPERATOR"; online: boolean }) => {
      if (p.party === "OPERATOR") setOperatorOnline(p.online);
    });

    // Visto/leído: el operador leyó mis mensajes → marco como leídos los GUEST
    // con createdAt <= readAt (sin pisar los que ya tenían readAt).
    socket.on("chat:read", (p: { reader: "GUEST" | "OPERATOR"; readAt: string }) => {
      if (p.reader !== "OPERATOR") return;
      const readTime = new Date(p.readAt).getTime();
      setMessages((prev) =>
        prev.map((m) =>
          m.sender === "GUEST" && !m.readAt && new Date(m.createdAt).getTime() <= readTime
            ? { ...m, readAt: p.readAt }
            : m,
        ),
      );
    });

    return () => {
      socket.off();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setOperatorOnline(false);
      setOperatorTyping(false);
      if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
      if (operatorTypingTimerRef.current) { clearTimeout(operatorTypingTimerRef.current); operatorTypingTimerRef.current = null; }
      typingSentRef.current = false;
    };
  }, [session?.token, appendMessage, emitRead]);

  // Al abrir el panel (o cambiar de sesión con panel abierto): marcar visto.
  useEffect(() => {
    if (open && session) emitRead();
  }, [open, session, emitRead]);

  // Autoscroll al último mensaje (y al abrir el panel).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, operatorTyping]);

  async function startChat(e: React.FormEvent) {
    e.preventDefault();
    if (starting) return;
    setError(null);
    setStarting(true);
    try {
      const res = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "No pudimos iniciar el chat. Intentá de nuevo.");
        return;
      }
      const newSession: ChatSession = {
        conversationId: data.conversationId,
        token: data.token,
        email: email.trim(),
        name: name.trim(),
      };
      setChatSession(newSession);
      setSession(newSession);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    } finally {
      setStarting(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !session || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "No se pudo enviar el mensaje.");
        return;
      }
      setInput("");
      stopTyping(); // dejo de "escribir" al enviar
      appendMessage(data); // dedup con el eco del socket
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  // Handoff a humano: marca la conversación para atención humana. El bot deja de
  // responder y el mensaje puente llega solo por socket (chat:message) → acá solo
  // marcamos escalated para ocultar el botón.
  async function escalateToHuman() {
    if (!session || escalating || escalated) return;
    setEscalating(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/escalate", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) {
        setError("No pudimos conectarte con una persona. Intentá de nuevo.");
        return;
      }
      setEscalated(true);
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    } finally {
      setEscalating(false);
    }
  }

  // Abre WhatsApp en pestaña nueva con un mensaje pre-cargado. El número se
  // sanitiza a solo dígitos (wa.me no acepta símbolos).
  function openWhatsApp() {
    if (!whatsappPhone) return;
    const digits = toWaDigits(whatsappPhone);
    if (!digits) return;
    const text = encodeURIComponent(
      `¡Hola! Vengo del chat de ${storeName} y quería hacer una consulta.`,
    );
    window.open(`https://wa.me/${digits}?text=${text}`, "_blank", "noopener,noreferrer");
  }

  const waDigits = whatsappPhone ? toWaDigits(whatsappPhone) : "";
  const showWhatsApp = waDigits.length > 0;

  return (
    <>
      {/* Panel */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] flex h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-4 sm:h-[600px] sm:max-h-[calc(100vh-8rem)] sm:w-96 sm:rounded-2xl"
          role="dialog"
          aria-label={`Chat con ${storeName}`}
        >
          {/* Header */}
          <div
            className="flex shrink-0 items-center justify-between gap-2 px-4 py-3 text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{storeName}</p>
              <p className="flex items-center gap-1.5 text-xs opacity-90">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: !connected ? "#e5e7eb" : operatorOnline ? "#4ade80" : "#fbbf24",
                  }}
                />
                {!connected ? "Conectando…" : operatorOnline ? "En línea" : "Te responderemos pronto"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar chat"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/20"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* Barra de acciones: handoff a humano + seguir por WhatsApp. Solo con
              conversación activa; sutil, no compite con el hilo. */}
          {session && (!escalated || showWhatsApp) && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
              {!escalated && (
                <button
                  type="button"
                  onClick={escalateToHuman}
                  disabled={escalating}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  {escalating ? "Conectando…" : "Hablar con una persona"}
                </button>
              )}

              {showWhatsApp && (
                <button
                  type="button"
                  onClick={openWhatsApp}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-95"
                  style={{ backgroundColor: "#25D366" }}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.2 0 4.28.86 5.84 2.42a8.22 8.22 0 0 1 2.42 5.83c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24Zm4.52 9.83c-.25-.12-1.46-.72-1.69-.8-.23-.09-.39-.13-.56.12-.16.25-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.04-.38-1.99-1.22-.73-.66-1.23-1.47-1.37-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42l-.48-.01c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.06 0 1.21.88 2.38 1 2.55.13.16 1.74 2.66 4.22 3.73.59.26 1.05.41 1.41.52.59.19 1.13.16 1.55.1.47-.07 1.46-.6 1.66-1.17.21-.58.21-1.07.14-1.17-.06-.11-.22-.17-.47-.29Z" />
                  </svg>
                  Seguir por WhatsApp
                </button>
              )}
            </div>
          )}

          {/* Cuerpo */}
          {!session ? (
            // Formulario de inicio
            <form onSubmit={startChat} className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
              <p className="text-sm text-muted-foreground">
                Dejanos tus datos y empezá a chatear con nosotros.
              </p>
              <div>
                <label htmlFor="chat-name" className="text-xs font-medium text-foreground">Nombre</label>
                <input
                  id="chat-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                />
              </div>
              <div>
                <label htmlFor="chat-email" className="text-xs font-medium text-foreground">Email</label>
                <input
                  id="chat-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                />
              </div>
              {error && (
                <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p>
              )}
              <button
                type="submit"
                disabled={starting}
                className="mt-auto inline-flex h-11 items-center justify-center rounded-md text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {starting ? "Iniciando…" : "Iniciar chat"}
              </button>
            </form>
          ) : (
            // Hilo + input
            <>
              <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto bg-muted/40 p-4">
                {messages.length === 0 && (
                  <p className="m-auto max-w-[80%] text-center text-xs text-muted-foreground">
                    Escribinos tu consulta. Te respondemos en cuanto podamos.
                  </p>
                )}
                {messages.map((m) => {
                  const own = m.sender === "GUEST";
                  return (
                    <div key={m.id} className={own ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={
                          "max-w-[80%] rounded-2xl px-3 py-2 text-sm " +
                          (own ? "rounded-br-sm text-white" : "rounded-bl-sm bg-card text-foreground border border-border")
                        }
                        style={own ? { backgroundColor: primaryColor } : undefined}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={"mt-1 flex items-center justify-end gap-1 text-[10px] " + (own ? "text-white/70" : "text-muted-foreground")}>
                          {timeFmt.format(new Date(m.createdAt))}
                          {own && (
                            <span className="inline-flex items-center gap-0.5" aria-label={m.readAt ? "Visto" : "Enviado"}>
                              {m.readAt ? (
                                <>
                                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M1 13l4 4L15 7" />
                                    <path d="M9 13l4 4L23 7" />
                                  </svg>
                                  <span className="text-[9px]">Visto</span>
                                </>
                              ) : (
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M4 12l5 5L20 6" />
                                </svg>
                              )}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* "Escribiendo…" del operador */}
                {operatorTyping && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2.5" aria-label="El operador está escribiendo">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <p className="shrink-0 bg-red-500/10 px-4 py-1.5 text-xs text-red-600">{error}</p>
              )}

              <form onSubmit={sendMessage} className="flex shrink-0 items-center gap-2 border-t border-border bg-card p-3">
                <input
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  placeholder="Escribí un mensaje…"
                  aria-label="Mensaje"
                  className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-[var(--brand)]"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  aria-label="Enviar mensaje"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-40"
                  style={{ backgroundColor: primaryColor }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* Burbuja flotante */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Cerrar chat" : "Abrir chat"}
        aria-expanded={open}
        className="fixed bottom-4 right-4 z-[70] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition hover:scale-105 active:scale-95"
        style={{ backgroundColor: primaryColor }}
      >
        {open ? (
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        )}
      </button>
    </>
  );
}
