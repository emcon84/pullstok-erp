-- Modo de interfaz por organización (OPERATIVO | ADMINISTRATIVO)
CREATE TYPE "UiMode" AS ENUM ('OPERATIVO', 'ADMINISTRATIVO');

-- Default OPERATIVO: las organizaciones existentes no cambian de comportamiento
ALTER TABLE "organizations" ADD COLUMN "uiMode" "UiMode" NOT NULL DEFAULT 'OPERATIVO';
