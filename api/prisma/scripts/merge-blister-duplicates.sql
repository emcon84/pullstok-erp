-- merge-blister-duplicates.sql (sdd/product-presentations)
--
-- One-off data merge: every FARMACIA box product "X" that has a legacy
-- duplicate "X (Blister)" in the same organization becomes a single product
-- with presentations:
--   Caja     -> price of "X",            factor 0 (pending, admin sets it later)
--   Blister  -> price of "X (Blister)",  factor 0 (pending)
--   Pastilla -> price 0 (hidden in POS until priced), factor 1 (base unit)
-- History of the duplicate (sale/order/quotation items) is re-pointed to "X";
-- sale items are tagged as the Blister presentation with factor 0 so deleting
-- an old sale never moves stock. Then the duplicates are deleted.
-- Stock is intentionally NOT converted (deferred by product decision).
--
-- Requirements: migrations product_presentations + factor >= 0 applied
-- (deploy pipeline runs `prisma migrate deploy`). PostgreSQL 13+ (gen_random_uuid).
--
-- Usage (psql): run the whole file. It ends WITHOUT committing: review the
-- preview and the summary, then type COMMIT; (or ROLLBACK; to discard).

BEGIN;

-- 1) Candidate pairs. Ambiguous names (more than one box or duplicate with the
--    same name in the org) and boxes already using presentations are skipped.
CREATE TEMP TABLE pp_pairs ON COMMIT DROP AS
SELECT
  box.id                  AS box_id,
  dup.id                  AS dup_id,
  box."organizationId"    AS org_id,
  box.name                AS box_name,
  dup.name                AS dup_name,
  box.price               AS box_price,
  dup.price               AS blister_price,
  gen_random_uuid()::text AS caja_pid,
  gen_random_uuid()::text AS blister_pid,
  gen_random_uuid()::text AS pastilla_pid
FROM products box
JOIN categories c
  ON c.id = box."categoryId"
 AND upper(trim(c.name)) = 'FARMACIA'
JOIN products dup
  ON dup."organizationId" = box."organizationId"
 AND lower(trim(dup.name)) = lower(trim(box.name)) || ' (blister)'
WHERE box."hasPresentations" = false
  AND (SELECT count(*) FROM products b2
        WHERE b2."organizationId" = box."organizationId"
          AND lower(trim(b2.name)) = lower(trim(box.name))) = 1
  AND (SELECT count(*) FROM products d2
        WHERE d2."organizationId" = box."organizationId"
          AND lower(trim(d2.name)) = lower(trim(dup.name))) = 1;

-- 2) Preview: what is going to be merged.
SELECT box_name, dup_name, box_price, blister_price,
       (SELECT count(*) FROM sale_items si WHERE si."productId" = p.dup_id) AS dup_sale_items
FROM pp_pairs p
ORDER BY box_name;

-- 3) Presentations on the box product.
INSERT INTO product_presentations
  (id, "organizationId", "productId", name, "sortOrder", factor, price, "wholesalePrice", "isActive", "updatedAt")
SELECT caja_pid,     org_id, box_id, 'Caja',     0, 0, box_price,     NULL, true, now() FROM pp_pairs
UNION ALL
SELECT blister_pid,  org_id, box_id, 'Blister',  1, 0, blister_price, NULL, true, now() FROM pp_pairs
UNION ALL
SELECT pastilla_pid, org_id, box_id, 'Pastilla', 2, 1, 0,             NULL, true, now() FROM pp_pairs;

UPDATE products pr
   SET "hasPresentations" = true
  FROM pp_pairs p
 WHERE pr.id = p.box_id;

-- 4) Re-point the duplicate's history to the box product.
UPDATE sale_items si
   SET "productId"          = p.box_id,
       "presentationId"     = p.blister_pid,
       "presentationName"   = 'Blister',
       "presentationFactor" = 0
  FROM pp_pairs p
 WHERE si."productId" = p.dup_id;

UPDATE order_items oi
   SET "productId" = p.box_id
  FROM pp_pairs p
 WHERE oi."productId" = p.dup_id;

UPDATE quotation_items qi
   SET "productId" = p.box_id
  FROM pp_pairs p
 WHERE qi."productId" = p.dup_id;

-- Rows that only make sense for the duplicate itself.
DELETE FROM price_list_entries  WHERE "productId" IN (SELECT dup_id FROM pp_pairs);
DELETE FROM review_queue_entries WHERE "productId" IN (SELECT dup_id FROM pp_pairs);

-- 5) Delete the duplicates (product_stocks / product_variants cascade).
DELETE FROM products WHERE id IN (SELECT dup_id FROM pp_pairs);

-- 6) Summary. Expect: merged_pairs = presentations_created / 3 and remaining_duplicates = 0.
SELECT
  (SELECT count(*) FROM pp_pairs) AS merged_pairs,
  (SELECT count(*) FROM product_presentations pp
     WHERE pp."productId" IN (SELECT box_id FROM pp_pairs)) AS presentations_created,
  (SELECT count(*) FROM products WHERE id IN (SELECT dup_id FROM pp_pairs)) AS remaining_duplicates;

-- Review the output above, then:
--   COMMIT;    -- apply
--   ROLLBACK;  -- discard
