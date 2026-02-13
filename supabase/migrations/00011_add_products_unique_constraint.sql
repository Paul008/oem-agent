-- Add unique constraint for upsert operations
-- This enables ON CONFLICT (oem_id, title) to work properly

ALTER TABLE products 
  ADD CONSTRAINT products_oem_title_unique 
  UNIQUE (oem_id, title);

-- Also add an index for faster lookups
CREATE INDEX idx_products_oem_title ON products(oem_id, title);
