# Cuenta corriente: detalle de venta + comprobante por WhatsApp

## Objetivo
En el diálogo "Cuenta corriente" de un cliente: (A) poder ver el detalle de una
venta (qué se vendió) desde su renglón en la lista de movimientos; (B) poder
enviar por WhatsApp un PDF con el resumen de cuenta (saldo + movimientos), con
el mismo diseño (logo, datos fiscales) que usan las impresiones, para cobrar o
como comprobante.

## Decisiones de diseño (defaults míos, sin confirmar)
- **Detalle de venta (A):** NO necesita cambios de backend — `GET /sales/:id`
  ya devuelve `items` con `product` incluido (`salesService.getSaleById`). El
  front expande el renglón "Venta" y pide esa venta puntual.
- **PDF (B):** se genera en el BACKEND con `pdfkit` (ya es dependencia del
  proyecto), A4, con el logo de `StoreSettings.logoUrl` (si existe) y los
  datos fiscales de `Organization` (name, address, phone, taxId,
  taxCondition) — mismos campos que arma `resolveTicketCompany` en el ticket,
  pero desde el server (el front no participa de la generación).
- **Envío (B):** se sube el PDF a R2 (`uploadToR2`, ya genérico para
  cualquier buffer) y se manda por WhatsApp con una función nueva
  `sendDocument` en `whatsappService.ts` (mismo patrón que `sendImage`, pero
  `type: "document"` — la Graph API de Meta que Kapso proxea ya soporta esto).
  Va al `Customer.phone` (normalizado con `normalizePhone`, mismo criterio que
  el resto de `whatsappService.ts`). Sin teléfono → el front deshabilita el
  botón con un hint, no se llama al backend.
- **Endpoint:** `POST /customers/:id/account/statement/whatsapp` (sin body;
  usa el customer + su cuenta actual). Devuelve `{ sent: true }` o un error de
  dominio claro (sin teléfono, sin datos de WhatsApp configurados en la org,
  fallo de Kapso).
- **Contenido del PDF:** cliente, fecha de emisión, saldo actual, tabla de
  movimientos (fecha, tipo Venta/Cobranza, método, monto, nota) — el mismo
  contenido que ya se ve en el diálogo, no hace falta el detalle de cada venta
  dentro del PDF (eso es la feature A, en pantalla).

## Hechos verificados (2026-09-28)
- `GET /sales/:id` → `salesService.getSaleById` (`api/src/services/salesService.ts:677`)
  incluye `items: { include: { product: true } }`. Ruta ya registrada y
  protegida (`salesRoutes.ts:19`).
- `customerAccountService.getAccount` (`api/src/services/customerAccountService.ts:98`)
  devuelve `movements` con `sale: { select: { id, saleDate } }` — alcanza para
  el link, no hace falta ampliarlo.
- WhatsApp saliente: `api/src/services/whatsappService.ts` — `sendText` (~1172),
  `sendInteractiveButtons` (~1206), `sendImage` (~1265, `type: "image"`, via
  Kapso/Meta Graph API `v24.0/{PHONE_NUMBER_ID}/messages`). Meta soporta
  `type: "document"` con la misma forma (`document: { link, filename,
  caption }`) — no hay `sendDocument` todavía, hay que agregarlo.
- Teléfono: `normalizePhone` (`whatsappService.ts:342`) formatea E.164 sin
  espacios/paréntesis, como pide Kapso.
- Storage: `api/src/config/storage.ts` — `uploadToR2(buffer, filename,
  contentType)` genérico, devuelve URL pública. Ya usado para imágenes; sirve
  tal cual para el PDF (contentType `application/pdf`).
- PDF: `pdfkit` ya es dependencia backend (`api/package.json`); ejemplo de uso
  en `api/scripts/print-blister-barcodes-pdf.ts`. NO hay generador de PDF con
  membrete/logo todavía — es nuevo.
- Branding: `Organization` (name, address, phone, taxId, taxCondition) +
  `StoreSettings.logoUrl` (`schema.prisma:1083-1100`). El ticket arma su
  encabezado con `resolveTicketCompany` (`saleTicket.ts:151`) combinando
  `org` + `branch`, pero es client-side; el PDF backend usa directamente
  `Organization`/`StoreSettings` de Prisma.
- Front: `CustomerAccountDialog.tsx` ya tiene la tabla de movimientos con
  `m.saleId` visible; `useCustomerAccount.ts` trae la cuenta. No hay
  `getSaleById` en `saleServices.ts` todavía (solo `deleteSale`).

## Contexto de checks
- TDD estricto. Backend jest (`api/`, unit sin DB). Front vitest.
- Trabajo directo en `main`, un commit por tarea, sin push hasta que el
  usuario lo pida explícitamente (aprendido: no asumir "ya está todo" sin
  confirmar).
- Estimación: ~500 líneas autorales (el PDF + WhatsApp es infra nueva).

## Tareas
- [x] T1 — Backend: `sendDocument` en `whatsappService.ts` (mismo patrón que
      `sendImage`, `type: "document"`); generador de PDF de resumen de cuenta
      (`api/src/services/accountStatementPdf.ts` o similar, pdfkit, logo +
      datos fiscales + tabla de movimientos); endpoint `POST
      /customers/:id/account/statement/whatsapp` (sube a R2, llama
      `sendDocument`, maneja "sin teléfono" y fallo de Kapso con errores de
      dominio claros). Tests primero. Ruta: delegada (writer backend).
      **Hecho** — commit `7ab88d0`. TDD estricto: cada archivo RED (falla de
      compilación/tipo por símbolo inexistente) antes de implementar, GREEN
      después. Evidencia:
      - `npx jest tests/services/whatsappService.test.ts` → 20/20 (agregado
        `sendDocument`: 4 tests).
      - `npx jest tests/services/accountStatementPdf.test.ts` → 8/8 (nuevo).
      - `npx jest tests/services/customerAccountService.test.ts` → 20/20
        (agregado `sendAccountStatementWhatsapp`: 5 tests).
      - `npx jest tests/controllers/customerAccountController.test.ts` →
        12/12 (agregado `sendAccountStatementWhatsapp`: 4 tests).
      - `npx jest tests/routes/customerRoutes.test.ts` → 3/3 (ruta nueva +
        orden respecto a `/:id`).
      - `npx jest --testPathIgnorePatterns "tests/e2e"` → 1642-1648/1658
        (según corrida) + 2 skipped; el resto son 8-14 fallos intermitentes
        en `vendorChatService.test.ts` / `vendorChatController.test.ts` bajo
        carga (ya documentado como flaky), confirmados pre-existentes
        corriendo cada archivo solo (15/15 y 9/9 en verde). Ningún fallo
        nuevo relacionado a este cambio.
      - `npx tsc --noEmit` → solo los 3 errores pre-existentes conocidos en
        `api/tests/e2e` (business-hours ×2, loose-sale ×1).
      - `normalizePhone` ya estaba exportado (named export +
        `export default { ..., normalizePhone, ... }`) — NO hizo falta
        exportarlo, contrario a lo que decía la nota original del doc.
- [ ] T2 — Front: detalle de venta expandible en cada renglón "Venta" del
      diálogo (`CustomerAccountDialog.tsx`), usando `GET /sales/:id` (nuevo
      método en `saleServices.ts` + hook). Tests primero. Ruta: delegada
      (writer front).
- [ ] T3 — Front: botón "Enviar por WhatsApp" en `CustomerAccountDialog.tsx`
      que llama al endpoint de T1; deshabilitado con hint si el cliente no
      tiene teléfono cargado; toast de éxito/error. Tests primero. Ruta:
      delegada (mismo writer front, después de T1).

## Progreso
- Mapeo hecho (WhatsApp/Kapso, PDF, branding, sale detail ya expuesto).
- T1 (backend) hecho — commit `7ab88d0`, ver detalle arriba.

## Próximo paso
T2 (detalle de venta expandible en el diálogo) y T3 (botón "Enviar por
WhatsApp", depende del endpoint de T1) — front, writer delegado.

### Contrato del endpoint (para T3 / el writer front)
`POST /customers/:id/account/statement/whatsapp` — sin body, mismos
middlewares que el resto de cuenta corriente (`authenticateJWT`,
`checkBusinessHours`).
- 200 `{ sent: true }` — éxito.
- 404 `{ error: "CUSTOMER_NOT_FOUND", message }` — cliente no existe / no es
  de la org.
- 422 `{ error: "CUSTOMER_PHONE_REQUIRED", message: "El cliente no tiene
  teléfono cargado" }` — el front debería deshabilitar el botón antes de
  llamar (mismo criterio que ya prevé T3), pero el backend igual lo valida.
- 502 `{ error: "WHATSAPP_SEND_FAILED", message: "No se pudo enviar el
  comprobante por WhatsApp" }` — falló Kapso.
- 500 `{ message }` — error inesperado.
