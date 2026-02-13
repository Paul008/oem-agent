-- Fix: Move vehicle specs from key_features to variants
-- key_features is for OEM marketing features (Apple CarPlay, etc.)
-- variants is for vehicle specifications (engine, transmission, etc.)

UPDATE products
SET
  key_features = NULL,
  variants = '{
    "engine_size": "1373",
    "engine_type": "Piston",
    "cylinders": 4,
    "fuel_type": "Petrol",
    "transmission": "Sports Automatic",
    "gears": 6,
    "drive": "Front Wheel Drive",
    "doors": 5,
    "seats": 5
  }'::jsonb,
  updated_at = NOW()
WHERE id = 'aa309874-604e-48ce-af78-bb54198c051f';
