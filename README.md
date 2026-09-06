# Duck Store vNext

A production-oriented Telegram Mini App + Admin Panel for Duck Store.

## Architecture
- `app/` — Telegram Mini App frontend (static, Cloudflare Pages friendly)
- `admin/` — Admin panel frontend (static, served at `/admin/` on Pages)
- `worker/` — Cloudflare Worker API + Telegram integration
- `db/` — D1 schema and seed data
- `scripts/` — build/import helpers
- `.github/workflows/` — optional GitHub Actions for Worker deployment

## What is included
- Dark glass UI with separate Home / Services / Market / Orders / Account
- Service catalog CRUD from admin
- Market CRUD from admin
- Order management + status timeline
- Users + VIP tiers
- Wallet / cashback ledger
- Coupons
- Referral tracking
- Support tickets
- Notification composer
- Analytics dashboard
- Store settings
- Audit log
- Telegram Mini App initData validation
- Telegram Stars invoice endpoint scaffold
- Cloudflare D1 bindings
- Rate-limit-ready API structure
- CORS configuration
- Safe secret handling via Cloudflare secrets

## Cloudflare deployment
Cloudflare Pages supports GitHub-connected builds and static HTML sites. Connect this repo to Pages with:
- Production branch: `main`
- Build command: `npm run build`
- Build output: `dist`

Then deploy the API Worker using Wrangler or the included GitHub Action.

### 1) Create D1
```bash
npx wrangler d1 create duck-store
```
Copy the returned database ID into `worker/wrangler.toml`.

### 2) Apply schema + seed
```bash
npx wrangler d1 execute duck-store --remote --file=./db/schema.sql
npx wrangler d1 execute duck-store --remote --file=./db/seed.sql
```

### 3) Configure Worker secrets
```bash
npx wrangler secret put BOT_TOKEN -c worker/wrangler.toml
npx wrangler secret put ADMIN_KEY -c worker/wrangler.toml
```
`BOT_TOKEN` is the bot token. `ADMIN_KEY` is only for initial/admin token exchange and should be rotated.

### 4) Deploy API
```bash
npx wrangler deploy -c worker/wrangler.toml
```
Copy the Worker URL into `app/config.js` and `admin/config.js`, or set it from the Cloudflare Pages environment when building.

### 5) Configure Telegram Mini App
In BotFather, set the Mini App URL to your Pages URL. The frontend sends Telegram `initData` to the Worker as `Authorization: tma <initData>`.

**Important:** `initDataUnsafe` is only UI data. Do not trust it server-side. The Worker validates raw `initData` before accepting user identity.

## Admin login
Open `/admin/`. Enter the admin key configured in Cloudflare as `ADMIN_KEY`. The Worker exchanges it for a short-lived admin session. Change the key after the first deployment.

## Free / low-cost deployment model
- GitHub — source control + deployment automation
- Cloudflare Pages — static frontend
- Cloudflare Workers — API
- Cloudflare D1 — SQL database
- Cloudflare R2 — optional product images/files

No VPS is required for this architecture. Some features, especially external fulfillment APIs or third-party payment processors, naturally require those external providers.

## Production checklist
1. Add your D1 database ID.
2. Set Worker secrets.
3. Deploy Worker.
4. Set API URL in frontend config.
.
5. Deploy Pages from GitHub.
6. Create admin session and change secret.
7. Replace seed services with your real catalog.
8. Add your actual fulfillment provider integrations.
9. Add Telegram webhook handling for payment updates if using Stars.
10. Enable Cloudflare logs/analytics and monitor errors.
