-- ============================================================================
-- Seed Data: Source Pages for All OEMs
-- 
-- Creates initial source_pages records for all 13 Australian OEMs
-- based on the crawl-config-v1.2 specification.
-- ============================================================================

-- Add unique constraint for ON CONFLICT to work
ALTER TABLE source_pages ADD CONSTRAINT source_pages_oem_url_unique UNIQUE (oem_id, url);

-- Helper function to get page type from URL
CREATE OR REPLACE FUNCTION get_page_type(url TEXT) 
RETURNS TEXT AS $$
BEGIN
  IF url LIKE '%/offers%' OR url LIKE '%/special-offers%' OR url LIKE '%/latest-offers%' THEN
    RETURN 'offers';
  ELSIF url LIKE '%/cars%' OR url LIKE '%/vehicles%' OR url LIKE '%/models%' THEN
    RETURN 'vehicle';
  ELSIF url LIKE '%/news%' OR url LIKE '%/blog%' OR url LIKE '%/stories%' THEN
    RETURN 'news';
  ELSIF url = '/' OR url LIKE '%/main.html' OR url LIKE '%/en.html' OR url LIKE '%/home%' THEN
    RETURN 'homepage';
  ELSE
    RETURN 'other';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Kia Australia
-- ============================================================================

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('kia-au', 'https://www.kia.com/au/main.html', 'homepage', 'active', now(), now()),
('kia-au', 'https://www.kia.com/au/cars.html', 'vehicle', 'active', now(), now()),
('kia-au', 'https://www.kia.com/au/offers.html', 'offers', 'active', now(), now()),
('kia-au', 'https://www.kia.com/au/discover/news.html', 'news', 'active', now(), now()),
('kia-au', 'https://www.kia.com/au/cars/seltos.html', 'vehicle', 'active', now(), now()),
('kia-au', 'https://www.kia.com/au/cars/sportage.html', 'vehicle', 'active', now(), now()),
('kia-au', 'https://www.kia.com/au/cars/sorento.html', 'vehicle', 'active', now(), now()),
('kia-au', 'https://www.kia.com/au/cars/carnival.html', 'vehicle', 'active', now(), now()),
('kia-au', 'https://www.kia.com/au/cars/ev6.html', 'vehicle', 'active', now(), now()),
('kia-au', 'https://www.kia.com/au/cars/ev9.html', 'vehicle', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;

-- ============================================================================
-- Nissan Australia
-- ============================================================================

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('nissan-au', 'https://www.nissan.com.au/', 'homepage', 'active', now(), now()),
('nissan-au', 'https://www.nissan.com.au/vehicles/browse-range.html', 'vehicle', 'active', now(), now()),
('nissan-au', 'https://www.nissan.com.au/offers.html', 'offers', 'active', now(), now()),
('nissan-au', 'https://www.nissan.com.au/about-nissan/news-and-events.html', 'news', 'active', now(), now()),
('nissan-au', 'https://www.nissan.com.au/vehicles/browse-range/juke.html', 'vehicle', 'active', now(), now()),
('nissan-au', 'https://www.nissan.com.au/vehicles/browse-range/qashqai.html', 'vehicle', 'active', now(), now()),
('nissan-au', 'https://www.nissan.com.au/vehicles/browse-range/x-trail.html', 'vehicle', 'active', now(), now()),
('nissan-au', 'https://www.nissan.com.au/vehicles/browse-range/navara.html', 'vehicle', 'active', now(), now()),
('nissan-au', 'https://www.nissan.com.au/vehicles/browse-range/ariya.html', 'vehicle', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;

-- ============================================================================
-- Ford Australia
-- ============================================================================

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('ford-au', 'https://www.ford.com.au/', 'homepage', 'active', now(), now()),
('ford-au', 'https://www.ford.com.au/latest-offers.html', 'offers', 'active', now(), now()),
('ford-au', 'https://www.ford.com.au/news.html', 'news', 'active', now(), now()),
('ford-au', 'https://www.ford.com.au/showroom/trucks-and-vans/ranger.html', 'vehicle', 'active', now(), now()),
('ford-au', 'https://www.ford.com.au/showroom/suv/everest.html', 'vehicle', 'active', now(), now()),
('ford-au', 'https://www.ford.com.au/showroom/performance/mustang.html', 'vehicle', 'active', now(), now()),
('ford-au', 'https://www.ford.com.au/showroom/electric/mach-e.html', 'vehicle', 'active', now(), now()),
('ford-au', 'https://www.ford.com.au/showroom/trucks-and-vans/f-150.html', 'vehicle', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;

-- ============================================================================
-- Volkswagen Australia
-- ============================================================================

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('volkswagen-au', 'https://www.volkswagen.com.au/en.html', 'homepage', 'active', now(), now()),
('volkswagen-au', 'https://www.volkswagen.com.au/en/models.html', 'vehicle', 'active', now(), now()),
('volkswagen-au', 'https://www.volkswagen.com.au/app/locals/offers-pricing', 'offers', 'active', now(), now()),
('volkswagen-au', 'https://www.volkswagen.com.au/en/brand-experience/volkswagen-newsroom/latest-news.html', 'news', 'active', now(), now()),
('volkswagen-au', 'https://www.volkswagen.com.au/en/models/golf.html', 'vehicle', 'active', now(), now()),
('volkswagen-au', 'https://www.volkswagen.com.au/en/models/tiguan.html', 'vehicle', 'active', now(), now()),
('volkswagen-au', 'https://www.volkswagen.com.au/en/models/amarok.html', 'vehicle', 'active', now(), now()),
('volkswagen-au', 'https://www.volkswagen.com.au/en/models/id4.html', 'vehicle', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;

-- ============================================================================
-- Mitsubishi Australia
-- ============================================================================

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('mitsubishi-au', 'https://www.mitsubishi-motors.com.au/?group=private', 'homepage', 'active', now(), now()),
('mitsubishi-au', 'https://www.mitsubishi-motors.com.au/offers.html', 'offers', 'active', now(), now()),
('mitsubishi-au', 'https://www.mitsubishi-motors.com.au/company/news.html', 'news', 'active', now(), now()),
('mitsubishi-au', 'https://www.mitsubishi-motors.com.au/blog.html', 'news', 'active', now(), now()),
('mitsubishi-au', 'https://www.mitsubishi-motors.com.au/vehicles/triton.html', 'vehicle', 'active', now(), now()),
('mitsubishi-au', 'https://www.mitsubishi-motors.com.au/vehicles/outlander.html', 'vehicle', 'active', now(), now()),
('mitsubishi-au', 'https://www.mitsubishi-motors.com.au/vehicles/pajero-sport.html', 'vehicle', 'active', now(), now()),
('mitsubishi-au', 'https://www.mitsubishi-motors.com.au/vehicles/asx.html', 'vehicle', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;

-- ============================================================================
-- LDV Australia
-- ============================================================================

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('ldv-au', 'https://www.ldvautomotive.com.au/', 'homepage', 'active', now(), now()),
('ldv-au', 'https://www.ldvautomotive.com.au/vehicles/', 'vehicle', 'active', now(), now()),
('ldv-au', 'https://www.ldvautomotive.com.au/special-offers/', 'offers', 'active', now(), now()),
('ldv-au', 'https://www.ldvautomotive.com.au/ldv-stories/', 'news', 'active', now(), now()),
('ldv-au', 'https://www.ldvautomotive.com.au/price/', 'price_guide', 'active', now(), now()),
('ldv-au', 'https://www.ldvautomotive.com.au/vehicles/ldv-t60-max/', 'vehicle', 'active', now(), now()),
('ldv-au', 'https://www.ldvautomotive.com.au/vehicles/ldv-d90/', 'vehicle', 'active', now(), now()),
('ldv-au', 'https://www.ldvautomotive.com.au/vehicles/ldv-mifa-9/', 'vehicle', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;

-- ============================================================================
-- Isuzu UTE Australia
-- ============================================================================

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('isuzu-au', 'https://www.isuzuute.com.au/', 'homepage', 'active', now(), now()),
('isuzu-au', 'https://www.isuzuute.com.au/offers/current-offers', 'offers', 'active', now(), now()),
('isuzu-au', 'https://www.isuzuute.com.au/discover/news', 'news', 'active', now(), now()),
('isuzu-au', 'https://www.isuzuute.com.au/d-max/overview', 'vehicle', 'active', now(), now()),
('isuzu-au', 'https://www.isuzuute.com.au/d-max/range', 'vehicle', 'active', now(), now()),
('isuzu-au', 'https://www.isuzuute.com.au/mu-x/overview', 'vehicle', 'active', now(), now()),
('isuzu-au', 'https://www.isuzuute.com.au/mu-x/range', 'vehicle', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;

-- ============================================================================
-- Mazda Australia
-- ============================================================================

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('mazda-au', 'https://www.mazda.com.au/', 'homepage', 'active', now(), now()),
('mazda-au', 'https://www.mazda.com.au/offers/', 'offers', 'active', now(), now()),
('mazda-au', 'https://www.mazda.com.au/offers/driveaway/', 'offers', 'active', now(), now()),
('mazda-au', 'https://www.mazda.com.au/mazda-news/', 'news', 'active', now(), now()),
('mazda-au', 'https://www.mazda.com.au/cars/cx-5/', 'vehicle', 'active', now(), now()),
('mazda-au', 'https://www.mazda.com.au/cars/cx-60/', 'vehicle', 'active', now(), now()),
('mazda-au', 'https://www.mazda.com.au/cars/bt-50/', 'vehicle', 'active', now(), now()),
('mazda-au', 'https://www.mazda.com.au/cars/mazda3/', 'vehicle', 'active', now(), now()),
('mazda-au', 'https://www.mazda.com.au/cars/mx-5/', 'vehicle', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;

-- ============================================================================
-- KGM (SsangYong) Australia
-- ============================================================================

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('kgm-au', 'https://kgm.com.au/', 'homepage', 'active', now(), now()),
('kgm-au', 'https://kgm.com.au/models', 'vehicle', 'active', now(), now()),
('kgm-au', 'https://kgm.com.au/offers', 'offers', 'active', now(), now()),
('kgm-au', 'https://kgm.com.au/discover-kgm', 'news', 'active', now(), now()),
('kgm-au', 'https://kgm.com.au/models/musso', 'vehicle', 'active', now(), now()),
('kgm-au', 'https://kgm.com.au/models/rexton', 'vehicle', 'active', now(), now()),
('kgm-au', 'https://kgm.com.au/models/actyon', 'vehicle', 'active', now(), now()),
('kgm-au', 'https://kgm.com.au/models/torres-evx', 'vehicle', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;

-- ============================================================================
-- GWM Australia
-- ============================================================================

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('gwm-au', 'https://www.gwmanz.com/au/', 'homepage', 'active', now(), now()),
('gwm-au', 'https://www.gwmanz.com/au/models/', 'vehicle', 'active', now(), now()),
('gwm-au', 'https://www.gwmanz.com/au/offers/', 'offers', 'active', now(), now()),
('gwm-au', 'https://www.gwmanz.com/au/news/', 'news', 'active', now(), now()),
('gwm-au', 'https://www.gwmanz.com/au/models/suv/', 'category', 'active', now(), now()),
('gwm-au', 'https://www.gwmanz.com/au/models/ute/', 'category', 'active', now(), now()),
('gwm-au', 'https://www.gwmanz.com/au/models/suv/haval-h6/', 'vehicle', 'active', now(), now()),
('gwm-au', 'https://www.gwmanz.com/au/models/ute/cannon/', 'vehicle', 'active', now(), now()),
('gwm-au', 'https://www.gwmanz.com/au/models/suv/tank-300/', 'vehicle', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;

-- ============================================================================
-- Suzuki Australia
-- ============================================================================

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('suzuki-au', 'https://www.suzuki.com.au/home/', 'homepage', 'active', now(), now()),
('suzuki-au', 'https://www.suzuki.com.au/vehicles/', 'vehicle', 'active', now(), now()),
('suzuki-au', 'https://www.suzuki.com.au/offers/', 'offers', 'active', now(), now()),
('suzuki-au', 'https://www.suzuki.com.au/vehicles/future/', 'vehicle', 'active', now(), now()),
('suzuki-au', 'https://www.suzuki.com.au/vehicles/suv/jimny/', 'vehicle', 'active', now(), now()),
('suzuki-au', 'https://www.suzuki.com.au/vehicles/small-suv/fronx/', 'vehicle', 'active', now(), now()),
('suzuki-au', 'https://www.suzuki.com.au/vehicles/small-car/swift/', 'vehicle', 'active', now(), now()),
('suzuki-au', 'https://www.suzuki.com.au/vehicles/suv/vitara/', 'vehicle', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;

-- ============================================================================
-- Hyundai Australia
-- ============================================================================

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('hyundai-au', 'https://www.hyundai.com/au/en', 'homepage', 'active', now(), now()),
('hyundai-au', 'https://www.hyundai.com/au/en/cars', 'vehicle', 'active', now(), now()),
('hyundai-au', 'https://www.hyundai.com/au/en/offers', 'offers', 'active', now(), now()),
('hyundai-au', 'https://www.hyundai.com/au/en/news', 'news', 'active', now(), now()),
('hyundai-au', 'https://www.hyundai.com/au/en/cars/suvs/tucson', 'vehicle', 'active', now(), now()),
('hyundai-au', 'https://www.hyundai.com/au/en/cars/suvs/santa-fe', 'vehicle', 'active', now(), now()),
('hyundai-au', 'https://www.hyundai.com/au/en/cars/eco/ioniq-5', 'vehicle', 'active', now(), now()),
('hyundai-au', 'https://www.hyundai.com/au/en/cars/small-cars/i30', 'vehicle', 'active', now(), now()),
('hyundai-au', 'https://www.hyundai.com/au/en/cars/sports-cars/i30-n', 'vehicle', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;

-- ============================================================================
-- Toyota Australia
-- ============================================================================

INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
('toyota-au', 'https://www.toyota.com.au/', 'homepage', 'active', now(), now()),
('toyota-au', 'https://www.toyota.com.au/all-vehicles', 'vehicle', 'active', now(), now()),
('toyota-au', 'https://www.toyota.com.au/offers', 'offers', 'active', now(), now()),
('toyota-au', 'https://www.toyota.com.au/news', 'news', 'active', now(), now()),
('toyota-au', 'https://www.toyota.com.au/hilux', 'vehicle', 'active', now(), now()),
('toyota-au', 'https://www.toyota.com.au/corolla', 'vehicle', 'active', now(), now()),
('toyota-au', 'https://www.toyota.com.au/rav4', 'vehicle', 'active', now(), now()),
('toyota-au', 'https://www.toyota.com.au/landcruiser-300', 'vehicle', 'active', now(), now()),
('toyota-au', 'https://www.toyota.com.au/bz4x', 'vehicle', 'active', now(), now()),
('toyota-au', 'https://www.toyota.com.au/gr-yaris', 'vehicle', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;

-- ============================================================================
-- Create indexes for better query performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_source_pages_active_oem 
ON source_pages(oem_id, status) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_source_pages_due 
ON source_pages(last_checked_at, status) 
WHERE status = 'active';

-- Drop the helper function
DROP FUNCTION IF EXISTS get_page_type(TEXT);
