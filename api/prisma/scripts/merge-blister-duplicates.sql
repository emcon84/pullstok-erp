-- merge-blister-duplicates.sql (sdd/product-presentations): merge every FARMACIA
-- box "X" with its legacy "X (Blister)" product(s) into one product with
-- Caja / Blister / Pastilla presentations (factors 0 = pending, stock untouched).
-- Handles:
--  (a) boxes that have more than one "(Blister)" duplicate: keep the best price,
--      delete all duplicates;
--  (b) orphan "(Blister)" products (no box with the exact name): the product
--      itself becomes the box (suffix removed) with Caja/Blister/Pastilla.
-- Ends WITHOUT committing: review the summary, then COMMIT; or ROLLBACK;

\set ON_ERROR_STOP on
-- Applied in production on 2026-10-05: 330 boxes merged, 335 duplicates deleted,
-- 7 orphan blisters turned into boxes, 1011 presentations created.
BEGIN;

-- All box ↔ duplicate matches (FARMACIA boxes, unique box name per org).
CREATE TEMP TABLE pp_matches ON COMMIT DROP AS
SELECT box.id AS box_id, dup.id AS dup_id, box."organizationId" AS org_id,
       box.price AS box_price, dup.price AS dup_price
FROM products box
JOIN categories c ON c.id = box."categoryId" AND upper(trim(c.name)) = 'FARMACIA'
JOIN products dup
  ON dup."organizationId" = box."organizationId"
 AND lower(regexp_replace(trim(dup.name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(box.name), '\s+', ' ', 'g')) || ' (blister)'
WHERE box."hasPresentations" = false
  AND (SELECT count(*) FROM products b2
        WHERE b2."organizationId" = box."organizationId"
          AND lower(trim(b2.name)) = lower(trim(box.name))) = 1;

-- One row per box: Blister price from the duplicate with the best price.
CREATE TEMP TABLE pp_pairs ON COMMIT DROP AS
SELECT DISTINCT ON (box_id)
       box_id, dup_id AS price_dup_id, org_id, box_price, dup_price AS blister_price,
       gen_random_uuid()::text AS caja_pid,
       gen_random_uuid()::text AS blister_pid,
       gen_random_uuid()::text AS pastilla_pid
FROM pp_matches
ORDER BY box_id, (dup_price > 0) DESC, dup_price DESC;

-- Orphan "(Blister)" products in FARMACIA with no matching box at all.
CREATE TEMP TABLE pp_orphans ON COMMIT DROP AS
SELECT d.id AS prod_id, d."organizationId" AS org_id, d.price AS blister_price,
       trim(regexp_replace(d.name, '\s*\(blister\)\s*$', '', 'i')) AS new_name,
       gen_random_uuid()::text AS caja_pid,
       gen_random_uuid()::text AS blister_pid,
       gen_random_uuid()::text AS pastilla_pid
FROM products d
JOIN categories c ON c.id = d."categoryId" AND upper(trim(c.name)) = 'FARMACIA'
WHERE d.name ~* '\(blister\)\s*$'
  AND d."hasPresentations" = false
  AND NOT EXISTS (SELECT 1 FROM pp_matches m WHERE m.dup_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM products b
                   WHERE b."organizationId" = d."organizationId"
                     AND lower(trim(b.name)) = lower(trim(regexp_replace(d.name, '\s*\(blister\)\s*$', '', 'i'))));

-- Presentations for merged boxes.
INSERT INTO product_presentations
  (id, "organizationId", "productId", name, "sortOrder", factor, price, "wholesalePrice", "isActive", "updatedAt")
SELECT caja_pid,     org_id, box_id, 'Caja',     0, 0, box_price,     NULL::numeric, true, now() FROM pp_pairs
UNION ALL SELECT blister_pid,  org_id, box_id, 'Blister',  1, 0, blister_price, NULL::numeric, true, now() FROM pp_pairs
UNION ALL SELECT pastilla_pid, org_id, box_id, 'Pastilla', 2, 1, 0,             NULL::numeric, true, now() FROM pp_pairs;

-- Presentations for orphans turned into boxes (Caja price unknown -> 0, hidden in POS).
INSERT INTO product_presentations
  (id, "organizationId", "productId", name, "sortOrder", factor, price, "wholesalePrice", "isActive", "updatedAt")
SELECT caja_pid,     org_id, prod_id, 'Caja',     0, 0, 0,             NULL::numeric, true, now() FROM pp_orphans
UNION ALL SELECT blister_pid,  org_id, prod_id, 'Blister',  1, 0, blister_price, NULL::numeric, true, now() FROM pp_orphans
UNION ALL SELECT pastilla_pid, org_id, prod_id, 'Pastilla', 2, 1, 0,             NULL::numeric, true, now() FROM pp_orphans;

UPDATE products pr SET "hasPresentations" = true FROM pp_pairs p WHERE pr.id = p.box_id;
UPDATE products pr SET "hasPresentations" = true, name = o.new_name FROM pp_orphans o WHERE pr.id = o.prod_id;

-- Re-point every duplicate's history to its box.
UPDATE sale_items si
   SET "productId" = p.box_id, "presentationId" = p.blister_pid,
       "presentationName" = 'Blister', "presentationFactor" = 0
  FROM pp_matches m JOIN pp_pairs p ON p.box_id = m.box_id
 WHERE si."productId" = m.dup_id;
UPDATE order_items oi SET "productId" = m.box_id FROM pp_matches m WHERE oi."productId" = m.dup_id;
UPDATE quotation_items qi SET "productId" = m.box_id FROM pp_matches m WHERE qi."productId" = m.dup_id;
DELETE FROM price_list_entries   WHERE "productId" IN (SELECT dup_id FROM pp_matches);
-- review_queue_entries may be missing in some databases (schema drift).
DO $$ BEGIN
  IF to_regclass('review_queue_entries') IS NOT NULL THEN
    EXECUTE 'DELETE FROM review_queue_entries WHERE "productId" IN (SELECT dup_id FROM pp_matches)';
  END IF;
END $$;
DELETE FROM products WHERE id IN (SELECT dup_id FROM pp_matches);

-- Summary.
SELECT
  (SELECT count(*) FROM pp_pairs)   AS cajas_unificadas,
  (SELECT count(*) FROM pp_matches) AS duplicados_borrados,
  (SELECT count(*) FROM pp_orphans) AS blisters_convertidos_en_caja,
  (SELECT count(*) FROM product_presentations
     WHERE "productId" IN (SELECT box_id FROM pp_pairs UNION SELECT prod_id FROM pp_orphans)) AS presentaciones_creadas,
  (SELECT count(*) FROM products WHERE name ~* '\(blister\)\s*$') AS blisters_restantes;
