# Pullstok ERP — notas de trabajo

## Ruteo de modelos (ahorro de tokens — IMPORTANTE)
- **Haiku** → exploración, análisis, lecturas masivas de archivos. Delegar a subagente (`Agent` con `model: "haiku"`) para no ensuciar el contexto principal.
- **Sonnet** (default) → código normal, specs, tasks, edits.
- **Opus** → SOLO arquitectura compleja, debugging difícil o decisiones de diseño grandes. AVISAR antes ("esto amerita Opus"); el usuario sube con `/model opus` y vuelve a Sonnet.

## Hábitos siempre activos
- **Engram religioso**: `mem_save` proactivo tras cada decisión/fix/milestone + `mem_session_summary` antes de cerrar. Nada se pierde si se cuelga la sesión.
- **Cerrar sesiones** tras bloques lógicos (no dejarlas abiertas días → contexto gigante = caro).
- **Screenshots con moderación**: leer imágenes es caro en tokens; verificar visualmente solo en hitos.

## Stack / contexto
Detalle completo en Engram (project `nexo-erp`).
- **Backend** (`api/`): Express + Prisma 7 + PostgreSQL, multi-tenant (orgId + extension anti-fuga), auth 3 roles + JWT, Zod, pnpm.
- **Front** (`pullstok-front/`): React + Vite + Tailwind v4 + shadcn/ui (design system migrado completo).
- **Dev**: NO hay Docker ni BD en local. Todo lo que exige Postgres (DB, e2e backend, deploy) corre en el VPS `root@72.61.25.48` (`/var/www/pullstok`, clave `C:\Users\Emiliano\.ssh\id_ed25519`). Los unit tests de backend corren local sin DB; los e2e (`api/tests/e2e/`) SOLO en el VPS. El frontend (vitest) corre local sin DB. Demo: `admin@demo.com` / `admin123`.
- **PWA**: fuera de alcance por ahora (decisión del usuario).
