-- Allow authenticated users (dashboard) to read/write agent tables
-- The dashboard uses service_role key but auth sessions override with 'authenticated' role

CREATE POLICY agent_actions_authenticated_policy ON agent_actions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY workflow_settings_authenticated_policy ON workflow_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
