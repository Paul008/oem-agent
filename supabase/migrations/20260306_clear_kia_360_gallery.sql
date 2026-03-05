-- Clear legacy 360 CDN gallery_urls from Kia AU variant_colors.
-- The old import populated gallery_urls with KWCMS CDN frame URLs (360 rotator),
-- but we now use per-trim BYO hero images instead. The kia-colors sync already
-- writes gallery_urls = NULL for new upserts; this migration cleans up existing rows.

UPDATE variant_colors
SET    gallery_urls = NULL,
       source_gallery_urls = NULL
WHERE  product_id IN (
  SELECT id FROM products WHERE oem_id = 'kia-au'
)
AND gallery_urls IS NOT NULL;
