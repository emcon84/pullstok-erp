import "dotenv/config";
import nodemailer, { Transporter } from "nodemailer";

// Envío de mails transaccionales vía SMTP. La configuración se lee de env:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE (bool), SMTP_USER, SMTP_PASS, MAIL_FROM
//
// GUARDA CRÍTICA: el mail NUNCA debe romper el flujo de negocio. Si el SMTP no
// está configurado (faltan vars), se loguea un warn y se retorna sin enviar.
// Los callers además envuelven sendMail en try/catch para que un fallo de red
// del SMTP tampoco propague.

interface SendMailArgs {
  to: string;
  subject: string;
  html: string;
}

// Transporter singleton (lazy): se crea una sola vez, la primera vez que se
// envía un mail con la config completa. Si la config está incompleta, queda
// null y todo sendMail se vuelve un no-op.
let transporter: Transporter | null = null;
let initialized = false;

const isConfigured = (): boolean =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS,
  );

const getTransporter = (): Transporter | null => {
  if (initialized) return transporter;
  initialized = true;

  if (!isConfigured()) {
    transporter = null;
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    // SMTP_SECURE=true → TLS directo (puerto 465). false → STARTTLS (587).
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
};

/**
 * Envía un mail. Si el SMTP no está configurado, loguea un warn y retorna sin
 * hacer nada (no-op). NUNCA tira si falta configuración — el flujo de negocio
 * no debe depender del mail.
 */
export async function sendMail({ to, subject, html }: SendMailArgs): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    console.warn(
      `[mailService] SMTP no configurado — mail no enviado (to="${to}", subject="${subject}"). ` +
        `Definí SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS para habilitar el envío.`,
    );
    return;
  }

  const from = process.env.MAIL_FROM || "Pullstok <no-reply@pullstok.com>";
  await tx.sendMail({ from, to, subject, html });
}

export default { sendMail };
