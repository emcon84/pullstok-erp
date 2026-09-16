-- Groq discontinuó "llama-3.1-8b-instant" (la API devuelve 404
-- model_not_found para cualquier llamada), dejando el asistente de ventas
-- mudo para todas las organizaciones. Se actualiza el default de la columna
-- y se hace backfill de las filas existentes a un modelo vigente, verificado
-- contra GET https://api.groq.com/openai/v1/models.
ALTER TABLE "bot_configs" ALTER COLUMN "model" SET DEFAULT 'openai/gpt-oss-20b';

UPDATE "bot_configs"
SET "model" = 'openai/gpt-oss-20b'
WHERE "model" = 'llama-3.1-8b-instant';
