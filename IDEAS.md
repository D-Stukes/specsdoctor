# SpecsDoctor — ideas for next session

Lady D's UX notes from testing SpecsDoctor on its own repo (Nov 23, 2026).

1. **Re-analyze button** on the report page: starts a fresh run of the same repo at its latest commit (e.g. after code changes). Small: the page already knows the repo.
2. **Recent repos dropdown** on the repo box: each person's browser remembers its own last repos (show 5, scroll to 10). Works after closing the app; nobody sees anyone else's list; no database change.
3. **Side-by-side preview:** open a generated page next to the report instead of replacing it.
4. **Results screenshot** in the README (API endpoints page from a real run).
5. **Deploy** using DEPLOY.md (Supabase + a Node host), then add the live link and tester access code to the README.
6. **Map view clarity:** add a one-line intro to each map tab (what "Follow the data" shows vs. the diagram tabs), consider opening on the Architecture diagram by default, and make the map's oversized toolbar buttons match the quieter report styling.
7. **Admin cost view (for pricing later):** each run's AI cost is still saved in the database (`runs.cost_usd`) but no longer shown to visitors. Add a private admin page with cost per run and totals, to help set a price when SpecsDoctor is monetized. Until then, check costs in Supabase's SQL editor: `select created_at, cost_usd from runs order by created_at desc;`. The cost also still travels in the app's behind-the-scenes data (visible to someone using browser developer tools); the admin page would be the moment to remove it from public responses.
