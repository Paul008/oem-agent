-- Allow authenticated users (dashboard) to read/write recipe tables

CREATE POLICY brand_recipes_authenticated_policy ON brand_recipes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY default_recipes_authenticated_policy ON default_recipes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
