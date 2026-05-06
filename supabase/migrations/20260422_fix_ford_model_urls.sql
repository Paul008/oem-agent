-- Fix Ford AU model source URLs.
--
-- The original populate-ford-db.ts stored Ford's internal AEM CMS paths
-- (/content/ecomm-img/au/en_au/home/<cat>/<model>.html) as source_url.
-- A later ad-hoc fix flattened vehicle_models to /showroom/<slug>/, which
-- dropped the category segment and produced 404s / wrong redirects.
--
-- The canonical public pattern is:
--   https://www.ford.com.au/showroom/<category>/<model>/
-- derived by stripping the /content/ecomm-img/au/en_au/home/ prefix and
-- the .html suffix from the CMS path.
--
-- Idempotent by construction: each UPDATE targets a specific slug. Re-running
-- sets the same values. Matches the pattern in 20260305_fix_kia_offers_url.sql.

UPDATE vehicle_models SET source_url = 'https://www.ford.com.au/showroom/suv/everest/'
  WHERE oem_id = 'ford-au' AND slug = 'everest';
UPDATE vehicle_models SET source_url = 'https://www.ford.com.au/showroom/trucks-and-vans/ranger/'
  WHERE oem_id = 'ford-au' AND slug = 'ranger';
UPDATE vehicle_models SET source_url = 'https://www.ford.com.au/showroom/trucks-and-vans/ranger-raptor/'
  WHERE oem_id = 'ford-au' AND slug = 'ranger-raptor';
UPDATE vehicle_models SET source_url = 'https://www.ford.com.au/showroom/trucks-and-vans/f-150/'
  WHERE oem_id = 'ford-au' AND slug = 'f-150';
UPDATE vehicle_models SET source_url = 'https://www.ford.com.au/showroom/cars/mustang/'
  WHERE oem_id = 'ford-au' AND slug = 'mustang';
UPDATE vehicle_models SET source_url = 'https://www.ford.com.au/showroom/electric/mach-e/'
  WHERE oem_id = 'ford-au' AND slug = 'mustang-mach-e';
UPDATE vehicle_models SET source_url = 'https://www.ford.com.au/showroom/suvs-and-cars/tourneo/'
  WHERE oem_id = 'ford-au' AND slug = 'tourneo';
UPDATE vehicle_models SET source_url = 'https://www.ford.com.au/showroom/trucks-and-vans/transit/custom/'
  WHERE oem_id = 'ford-au' AND slug = 'transit-custom';
UPDATE vehicle_models SET source_url = 'https://www.ford.com.au/showroom/trucks-and-vans/transit/electric/'
  WHERE oem_id = 'ford-au' AND slug = 'e-transit';
UPDATE vehicle_models SET source_url = 'https://www.ford.com.au/showroom/trucks-and-vans/transit/custom/electric/'
  WHERE oem_id = 'ford-au' AND slug = 'e-transit-custom';

-- Propagate the corrected URLs to all products linked via model_id.
UPDATE products p
   SET source_url = vm.source_url
  FROM vehicle_models vm
 WHERE p.oem_id = 'ford-au'
   AND p.model_id = vm.id
   AND vm.oem_id = 'ford-au'
   AND vm.slug IN (
     'everest','ranger','ranger-raptor','f-150','mustang','mustang-mach-e',
     'tourneo','transit-custom','e-transit','e-transit-custom'
   );

-- Models not in ford-vehiclesmenu.json are intentionally NOT updated here:
--   puma, tourneo-custom, transit
-- They may be discontinued or hub pages; they need human review to confirm
-- the correct canonical URL before being rewritten.
