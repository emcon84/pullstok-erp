# Resumen de saldos de clientes protegido con contraseña

## Objetivo (pedido del usuario, 2026-10-02)
"Para proteger por ahora": los números del panel de resumen de saldos (Clientes) se ven tapados (••••) y solo
se destapan con una contraseña que el usuario le pasa a los dueños. Ojito cerrado/abierto como en los bancos.

## Decisiones (usuario)
- La contraseña se valida en el SERVIDOR, guardada en variable de entorno (sin migración ni pantalla).

## Decisiones de diseño (defaults míos, sin confirmar)
- Env var `BALANCES_VIEW_PASSWORD`. Si no está definida, el servidor falla cerrado (nunca destapa) y lo informa.
- `POST /customers/balances/unlock {password}` -> token firmado de vida corta (~15 min) ligado a usuario + org;
  comparación en tiempo constante; límite de intentos fallidos por usuario (anti fuerza bruta).
- `GET /customers/balances/summary` exige el token (header `X-Balances-Token`) y devuelve los totales y el top 5
  (mismos cálculos que hoy en el front). Solo roles ADMIN/MANAGEMENT.
- Front: el panel deja de calcular con `useCustomerBalances`; muestra ••••• + ojo cerrado; el ojo pide la
  contraseña (diálogo), con éxito muestra los números + ojo abierto; clic en ojo abierto vuelve a ocultar.
  Token solo en memoria (no localStorage); al vencer vuelve a ocultarse.
- Alcance: SOLO el panel de resumen. `GET /customers/balances` y el "Debe $X" por tarjeta NO se tocan
  (siguen visibles); el usuario decidirá si se protegen después.

## Contexto de checks
- TDD estricto. Back jest (`api/`), front vitest (`pullstok-front/`). Cliente Prisma multi-tenant: nada de
  update/delete/findUnique singulares. Baseline: front 8 fallos (priceKgUpdate, productDrawer); api tsc con
  errores preexistentes (uiMode/Prisma viejo, e2e).
- Despliegue: el usuario debe definir `BALANCES_VIEW_PASSWORD` en el .env del VPS y reiniciar el backend.

## Tareas
- [x] T1 — API: unlock + summary protegidos, rate limit, tests. Ruta: delegada.
      Evidencia: RED (TS2307 módulos inexistentes + 2 tests) -> GREEN (7 suites / 99 passed, re-corrida mía).
      tsc: solo errores preexistentes. Revisé balancesLockService/jwtUtils/rutas: clave del token derivada de
      JWT_SECRET con etiqueta, timingSafeEqual sobre sha256, requireRole ADMIN/MANAGEMENT, límite 5 fallos/15 min
      por usuario en memoria. Commit: af2e806
- [x] T2 — Front: panel enmascarado con ojo + diálogo de contraseña; quitar cálculo local. Ruta: delegada (mismo writer).
      Evidencia: GREEN 6 files / 51 passed (re-corrida mía); full vitest solo 8 fallos baseline; tsc limpio.
      Token solo en memoria; se re-bloquea al vencer o ante 403. Commit: 23bc18a
- Pendientes/limitaciones: limitador en memoria (se resetea al reiniciar, por proceso); por usuario, no por IP; sin
  largo mínimo de contraseña; rotar la clave no invalida tokens vigentes (hasta 15 min); `GET /customers/balances` y
  "Debe $X" por tarjeta siguen abiertos. Sin e2e ni verificación visual.

## Progreso
Rama `feat/balances-summary-lock` desde main (5ea5a0b).

## Próximo paso
T1.
