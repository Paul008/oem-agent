-- Enable Supabase Realtime on accessories table
ALTER PUBLICATION supabase_realtime ADD TABLE accessories;

-- SELECT RLS for authenticated role (required for Realtime to deliver events)
CREATE POLICY accessories_authenticated_select ON accessories
  FOR SELECT TO authenticated USING (true);
