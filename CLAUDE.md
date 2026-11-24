# CleverDining — notes for Claude Code

Multi-tenant restaurant platform. Guests scan a table QR code and order from their phone;
staff run the restaurant from a web dashboard; Super Admin manages every restaurant.

## Golden rules

- **The branch `Cleverdining---.2` is production.** Every push to it auto-deploys the backend
  (Render) and both frontends (Netlify). Work on a feature branch, let CI pass, and only
  merge when the user says so.
- **Do not change UI, styling or animations** unless asked. Logic changes only; keep class
  names, layout and motion identical. New controls reuse existing classes.
- Database changes are **additive only** (new columns get defaults/blank, nothing dropped or
  renamed). Add a schema-guard entry for new columns (`<app>/schema_guard.py`).
- Every change ships with tests (Django test + Node unit test for frontend logic).
- Never commit secrets or write security findings into this repo (it is public).

## Layout (live code only)

| Part | Path | Stack | Hosting |
|---|---|---|---|
| Backend API | `backend_source_code/Restaurants` | Django 5.2, DRF, Channels/Daphne, Postgres, Redis | Render (`cleverdining-2.onrender.com`) |
| Staff dashboard | `frontend-sorce-code/dashboard_appllication_source_code/clever-biz-web-main` | React, Vite, TS, Redux, React Query | Netlify (own `netlify.toml`) |
| Guest phone app (PWA) | `frontend-sorce-code/device_application_source_code/clever-biz-mobile-main` | React, Vite, TS, Tailwind | Netlify (root `netlify.toml`) |

`frontend/web` and `backend/` are **stale copies** (untouched since Nov 2025) — ignore them.
Folder names are misspelled (`sorce`, `appllication`); keep them, deploy configs depend on them.

Key backend apps: `order` (orders + AI upsell `upsell*.py`), `payment` (provider adapters in
`payment/adapters.py`), `device` (tables, guest sessions, reservations), `message` (chat +
WebSockets, `message/routing.py`), `restaurant` (region config, branding, exchange rates),
`customer` (CRM, loyalty), `adminapi` (Super Admin), `integrations` (WhatsApp), `vapi`.

## Commands

Backend (from `backend_source_code/Restaurants`, local SQLite):
```bash
USE_SQLITE=1 SECRET_KEY=dev DEBUG=1 python manage.py migrate
USE_SQLITE=1 SECRET_KEY=dev DEBUG=1 python manage.py test            # every app (232 tests)
USE_SQLITE=1 SECRET_KEY=dev DEBUG=1 daphne -b 127.0.0.1 -p 8000 RESTAURANTS.asgi:application
```
CI only runs `manage.py test accounts device payment restaurant` — also run `order` and
`message` yourself when you touch them.

Frontends (each app folder):
```bash
npm ci && npm run build                       # what CI checks (tsc -b && vite build)
node tests/unit/<name>.node.ts                # unit tests; needs Node 22+
```
Both apps call `http://127.0.0.1:8000` when run locally.

E2E: `tests/bugs-1-58.spec.ts` in the dashboard (Playwright). It needs a running backend with
a seeded super admin in a **disposable** DB (see `tests/helpers/seed.ts`; never point it at
production), and Playwright's browsers need Ubuntu 24.04 (not 26.04). Many of these tests are weak (they pass without doing
the action they name) — do not treat a pass as proof.

## Regions and currency

Single source of truth: `restaurant/region_config.py` (backend) mirrored in each app's
`src/config/regionConfig.ts`. Regions: UAE (AED), UK (GBP), IE (EUR), GH (GHS).
- A restaurant's currency/timezone/phone code come from the country chosen at setup.
- Unknown countries are rejected on create/edit; read paths fall back to UAE for legacy rows.
- Use `normalizeRegionCode()` — never write `region === "UK" ? "UK" : "UAE"`.
- Adding a region = backend config + model choices migration + both `regionConfig.ts` + pickers.
- Money display style is `CODE amount` (e.g. `EUR 1,234.56`).
- Super Admin has a display-currency dropdown (`/api/exchange-rates/`, ExchangeRate-API, cached,
  fallback rates). Plan fees are AED; CRM spend converts per customer's restaurant currency.
- Payment gateways for Ireland/Ghana: Stripe + cash (Ireland also Checkout.com). Ghana mobile
  money is not integrated yet. VAT is intentionally untouched.

## Known issues

Open findings from the 24 Nov 2026 full-app check (security and functional) are tracked in
the private CleverBIZ project on claude.ai, not in this public repo. Ask the user for that
list before starting work. Security fixes come first, on a branch, with tests. Never call
admin or "fix" endpoints against production to test them.

Functional issues that are safe to note here:
- Staff list (`/owners/chef-staff/`) is paginated at 10 with no ordering and the Management
  screen has no paging, so members beyond 10 never appear.
- Multi-location portal (`src/pages/multilocation/*`, `store.ts`) is simulated in browser
  localStorage with seeded data; nothing reaches the server.
- Super Admin dashboard falls back to `SEEDED_RESTAURANTS` when the API fails.
- Hover-only action menus (chef order "more", chat menu, Integrations) — verify on tablets.
- The repo's manual E2E CI job never starts the backend and uses `ubuntu-latest` (26.04).

## Table Service (separate codebase)

The "Table Service" handoff (staff tablet ordering, Food/Bar stations, Azure House demo) is
built on Express/Drizzle/Wouter in a different repo ("FoodOrderMobile"), not here. Ask the
user for that repo before working on it.

## Commit style

Short imperative title, body explaining what and why, one focused change per commit.
