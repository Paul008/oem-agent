-- Remove seller field from meta_json

UPDATE products
SET
  meta_json = meta_json - 'seller',
  updated_at = NOW()
WHERE id = 'aa309874-604e-48ce-af78-bb54198c051f';
