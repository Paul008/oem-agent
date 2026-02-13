-- Add vehicle specification columns to products table

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS engine_size TEXT,
  ADD COLUMN IF NOT EXISTS cylinders INT,
  ADD COLUMN IF NOT EXISTS transmission TEXT,
  ADD COLUMN IF NOT EXISTS gears INT,
  ADD COLUMN IF NOT EXISTS drive TEXT,
  ADD COLUMN IF NOT EXISTS doors INT,
  ADD COLUMN IF NOT EXISTS seats INT;

-- Update existing record to use new columns
UPDATE products
SET
  engine_size = '1373',
  cylinders = 4,
  transmission = 'Sports Automatic',
  gears = 6,
  drive = 'Front Wheel Drive',
  doors = 5,
  seats = 5,
  variants = NULL,
  updated_at = NOW()
WHERE id = 'aa309874-604e-48ce-af78-bb54198c051f';
