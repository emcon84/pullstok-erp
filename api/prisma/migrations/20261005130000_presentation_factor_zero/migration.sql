-- Factor 0 means "pending": the admin has not defined the content yet.
-- A factor-0 presentation never moves stock and is skipped in stock levels.
ALTER TABLE "product_presentations" DROP CONSTRAINT "product_presentations_factor_check";
ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_factor_check" CHECK ("factor" >= 0);
