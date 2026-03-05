-- Fix Kia offers source page URL
-- The old URL (/au/offers.html) works but the canonical offers page is at
-- /au/shopping-tools/offers/car-offers.html which is linked from the main nav.
-- Add the correct URL and keep the old one active (both return offer content).

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('kia-au', 'https://www.kia.com/au/shopping-tools/offers/car-offers.html', 'offers', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;
