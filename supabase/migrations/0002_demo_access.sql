-- Zero-setup demo access: the app server can connect with the public (anon)
-- key, so the app deploys with no environment variables. The catalog is
-- read-only; trips and agent threads are readable/writable by the app.
-- Demo data only, no personal information is stored. For a locked-down setup,
-- drop these policies and set SUPABASE_SERVICE_ROLE_KEY on the server instead.
create policy "catalog readable" on public.cities for select to anon using (true);
create policy "catalog readable" on public.places for select to anon using (true);
create policy "demo trips read" on public.trips for select to anon using (true);
create policy "demo trips insert" on public.trips for insert to anon with check (true);
create policy "demo trips update" on public.trips for update to anon using (true) with check (true);
create policy "demo trips delete" on public.trips for delete to anon using (true);
create policy "demo threads read" on public.threads for select to anon using (true);
create policy "demo threads insert" on public.threads for insert to anon with check (true);
create policy "demo threads update" on public.threads for update to anon using (true) with check (true);
create policy "demo threads delete" on public.threads for delete to anon using (true);
