-- Enable Supabase Realtime on high-value dashboard tables
ALTER PUBLICATION supabase_realtime ADD TABLE import_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE change_events;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE offers;
ALTER PUBLICATION supabase_realtime ADD TABLE banners;

-- SELECT RLS for authenticated role (required for Realtime to deliver events)
-- agent_actions already has an authenticated policy (20260224_agent_rls_authenticated.sql)
CREATE POLICY import_runs_authenticated_select ON import_runs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY change_events_authenticated_select ON change_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY offers_authenticated_select ON offers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY banners_authenticated_select ON banners
  FOR SELECT TO authenticated USING (true);
