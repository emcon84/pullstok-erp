// Templates de mails transaccionales de la tienda online. Cada función devuelve
// { subject, html } listo para pasar a mailService.sendMail. HTML con CSS inline
// (los clientes de mail no soportan <style> ni clases confiablemente) y branding
// tomado de StoreSettings (color primario + logo) cuando está disponible.

interface MailOrg {
  name: string;
}

interface MailStoreSettings {
  primaryColor?: string | null;
  logoUrl?: string | null;
  contactEmail?: string | null;
}

interface MailItem {
  name: string;
  quantity: number;
  price: number;
}

interface TemplateArgs {
  org: MailOrg;
  storeSettings?: MailStoreSettings | null;
  customerName: string;
  orderRef: string;
  items: MailItem[];
  total: number;
}

interface RenderedMail {
  subject: string;
  html: string;
}

const DEFAULT_PRIMARY_COLOR = "#111827";

// Escapa caracteres peligrosos para evitar inyección de HTML con datos de
// usuario (nombre del cliente, nombre de producto, nombre del comercio, etc.).
const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Formatea un monto como moneda argentina ($ 1.234,56).
const formatCurrency = (amount: number): string =>
  `$ ${Number(amount ?? 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Bloque de branding: logo si existe, si no el nombre del comercio en el color
// primario. Se comparte entre todos los templates.
const renderHeader = (org: MailOrg, primaryColor: string, logoUrl?: string | null): string => {
  const inner = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(org.name)}" style="max-height:56px;max-width:220px;display:inline-block;" />`
    : `<span style="font-size:22px;font-weight:700;color:${escapeHtml(primaryColor)};">${escapeHtml(org.name)}</span>`;

  return `
    <tr>
      <td style="padding:24px 32px;text-align:center;border-bottom:1px solid #eee;">
        ${inner}
      </td>
    </tr>`;
};

// Tabla de items compartida (nombre x cantidad = subtotal) + fila de total.
const renderItemsTable = (items: MailItem[], total: number, primaryColor: string): string => {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;color:#333;font-size:14px;">
          ${escapeHtml(item.name)} <span style="color:#888;">x ${escapeHtml(item.quantity)}</span>
        </td>
        <td style="padding:8px 0;color:#333;font-size:14px;text-align:right;white-space:nowrap;">
          ${formatCurrency(item.price * item.quantity)}
        </td>
      </tr>`,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">
      ${rows}
      <tr>
        <td colspan="2" style="border-top:1px solid #eee;padding-top:12px;"></td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#111;font-size:16px;font-weight:700;">Total</td>
        <td style="padding:4px 0;font-size:16px;font-weight:700;text-align:right;color:${escapeHtml(primaryColor)};white-space:nowrap;">
          ${formatCurrency(total)}
        </td>
      </tr>
    </table>`;
};

// Envoltorio HTML común (fondo gris claro + tarjeta centrada) para no repetir la
// estructura del documento en cada template.
const renderLayout = (org: MailOrg, primaryColor: string, logoUrl: string | null | undefined, body: string): string => `
  <div style="background:#f4f4f5;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eee;">
      ${renderHeader(org, primaryColor, logoUrl)}
      <tr>
        <td style="padding:28px 32px;">
          ${body}
        </td>
      </tr>
      <tr>
        <td style="padding:20px 32px;text-align:center;border-top:1px solid #eee;color:#999;font-size:12px;">
          Este es un mensaje automático de ${escapeHtml(org.name)}. Por favor no respondas a este correo.
        </td>
      </tr>
    </table>
  </div>`;

// "Recibimos tu pedido" — se manda apenas se crea la Order en el checkout de la
// tienda. Confirma la recepción, todavía sin procesar/confirmar la venta.
export function orderReceivedEmail({
  org,
  storeSettings,
  customerName,
  orderRef,
  items,
  total,
}: TemplateArgs): RenderedMail {
  const primaryColor = storeSettings?.primaryColor || DEFAULT_PRIMARY_COLOR;
  const logoUrl = storeSettings?.logoUrl;

  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#111;">¡Recibimos tu pedido!</h1>
    <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.5;">
      Hola ${escapeHtml(customerName)}, gracias por tu compra en <strong>${escapeHtml(org.name)}</strong>.
      Ya registramos tu pedido <strong>#${escapeHtml(orderRef)}</strong> y lo estamos preparando.
      Te vamos a avisar por este medio en cuanto lo confirmemos.
    </p>
    ${renderItemsTable(items, total, primaryColor)}
    <p style="margin:20px 0 0;color:#444;font-size:14px;line-height:1.5;">
      ¡Gracias por elegirnos!
    </p>`;

  return {
    subject: `Recibimos tu pedido #${orderRef} — ${org.name}`,
    html: renderLayout(org, primaryColor, logoUrl, body),
  };
}

// "Tu compra fue confirmada" — se manda cuando el comercio procesa el pedido
// (crea la Sale desde el ERP, cerrando la Order como COMPLETED).
export function saleConfirmedEmail({
  org,
  storeSettings,
  customerName,
  orderRef,
  items,
  total,
}: TemplateArgs): RenderedMail {
  const primaryColor = storeSettings?.primaryColor || DEFAULT_PRIMARY_COLOR;
  const logoUrl = storeSettings?.logoUrl;

  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#111;">¡Tu compra fue confirmada!</h1>
    <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.5;">
      Hola ${escapeHtml(customerName)}, tenemos buenas noticias: tu pedido
      <strong>#${escapeHtml(orderRef)}</strong> en <strong>${escapeHtml(org.name)}</strong>
      fue procesado y confirmado. ¡Ya está en camino a estar listo para vos!
    </p>
    ${renderItemsTable(items, total, primaryColor)}
    <p style="margin:20px 0 0;color:#444;font-size:14px;line-height:1.5;">
      Gracias por tu compra. ¡Que lo disfrutes!
    </p>`;

  return {
    subject: `Tu compra #${orderRef} fue confirmada — ${org.name}`,
    html: renderLayout(org, primaryColor, logoUrl, body),
  };
}

export default { orderReceivedEmail, saleConfirmedEmail };
