# Deploying to production

Two paths, pick one:

- **A. Managed hosting** (recommended — least ops work): Postgres +
  backend on Render or Railway, frontend as a static site on Vercel or
  Netlify. Free/cheap tiers exist on all of these.
- **B. Self-hosted Docker** on your own VPS (DigitalOcean, Hetzner,
  Linode, etc.) using the included `docker-compose.yml` — more control,
  more setup, you manage updates/backups yourself.

Either way, **do this first**:

## 0. Switch the database to Postgres

SQLite is fine for local dev but not for production (ephemeral
filesystems on PaaS wipe it, and it doesn't handle concurrent writes
from multiple server instances). In `backend/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

Commit that change. You'll point `DATABASE_URL` at a real Postgres
instance in both paths below.

## 0.5. Set up Stripe (paid Request Access flow)

The public "Request Access" page collects payment before a school lands
in your approval queue. To wire that up:

1. In the [Stripe Dashboard](https://dashboard.stripe.com), create a
   **Product** (e.g. "School Timetable — Monthly") with a recurring
   **Price**. Copy its Price ID (`price_...`).
2. Copy your **Secret key** from
   [API keys](https://dashboard.stripe.com/apikeys) (`sk_test_...` for
   testing, `sk_live_...` once you're ready to charge real cards).
3. Once your backend is deployed and has a public URL, go to
   [Webhooks](https://dashboard.stripe.com/webhooks) → **Add endpoint**:
   - URL: `https://<your-backend-domain>/api/stripe/webhook`
   - Events to send: `checkout.session.completed`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `invoice.payment_failed`
   - Copy the **Signing secret** (`whsec_...`) it gives you.
4. Set these on your backend (Render/Railway/Docker — wherever it runs):
   ```
   STRIPE_SECRET_KEY   = sk_test_... (or sk_live_...)
   STRIPE_WEBHOOK_SECRET = whsec_...
   STRIPE_PRICE_ID      = price_...
   APP_URL               = https://<your-frontend-domain>
   ```
5. Test it end-to-end with Stripe's test card `4242 4242 4242 4242`, any
   future expiry, any CVC — go through `/apply` on your deployed
   frontend, confirm the application shows up under **Applications →
   Awaiting review** in the admin UI, then **Approve** it and confirm a
   school + login were created.

Note: `APP_URL` must be set *before* you redeploy the backend, since
it's used to build the Stripe Checkout success/cancel redirect URLs.

---

## Path A — Managed hosting (Render + Vercel example)

### A1. Database + backend on Render

1. Push this repo to GitHub/GitLab.
2. In Render: **New → PostgreSQL** — create a database, copy its
   **Internal Database URL**.
3. **New → Web Service** → connect the repo → set **Root Directory** to
   `backend`.
   - Build command: `npm install`
   - Start command: `npm run start:prod` (this runs `prisma migrate
     deploy` automatically before booting — see `backend/package.json`)
4. Add environment variables on the service:
   ```
   DATABASE_URL          = <the Internal Database URL from step 2>
   JWT_SECRET             = <generate a long random string>
   JWT_EXPIRES_IN          = 7d
   CORS_ORIGIN              = https://<your-frontend-domain>
   SUPER_ADMIN_EMAIL        = admin@yourdomain.com
   SUPER_ADMIN_PASSWORD     = <strong password>
   STRIPE_SECRET_KEY         = sk_live_... (see step 0.5)
   STRIPE_WEBHOOK_SECRET      = whsec_...
   STRIPE_PRICE_ID             = price_...
   APP_URL                      = https://<your-frontend-domain>
   ```
5. Deploy. Check `https://<your-backend>.onrender.com/api/health`
   returns `{"ok":true}`.
6. Optional demo data: open a Render shell on the service and run
   `npm run seed`.

(Railway or Fly.io work the same way — Postgres add-on + a Node web
service with the same env vars and start command.)

### A2. Frontend on Vercel

1. Import the repo in Vercel, set **Root Directory** to `frontend`.
2. Framework preset: Vite. Build command `npm run build`, output dir
   `dist` (Vercel usually detects this automatically).
3. Environment variable:
   ```
   VITE_API_URL = https://<your-backend>.onrender.com/api
   ```
4. Deploy. Then go back to Render and update `CORS_ORIGIN` on the
   backend to match the exact Vercel URL (or your custom domain) —
   otherwise the browser will block API requests.

(Netlify/Cloudflare Pages work identically: static build of `frontend`,
one env var, done.)

That's it — you now have HTTPS on both sides, managed backups on the
Postgres add-on, and zero servers to patch yourself.

---

## Path B — Self-hosted with Docker Compose

Use this if you want everything (Postgres, API, frontend) on one VPS
you control.

1. On the VPS, install Docker + Docker Compose, then clone/copy this
   repo there.
2. `cp .env.example .env` at the repo root and fill in real values
   (strong `POSTGRES_PASSWORD`, `JWT_SECRET`, your real domain(s) for
   `CORS_ORIGIN` and `VITE_API_URL`).
3. Build and start everything:
   ```bash
   docker compose up -d --build
   ```
   This starts Postgres, runs `prisma migrate deploy` automatically as
   part of the backend's startup, and serves the frontend build via
   nginx on port 80.
4. Optional demo data:
   ```bash
   docker compose exec backend npm run seed
   ```
5. Put a reverse proxy in front for HTTPS — the simplest option is
   [Caddy](https://caddyserver.com/) (auto-HTTPS with zero config) or
   [nginx + certbot](https://certbot.eff.org/). Point it at:
   - `:4000` → `api.yourdomain.com`
   - `:80` (the frontend container) → `timetable.yourdomain.com`

   Example minimal `Caddyfile` if you go that route:
   ```
   timetable.yourdomain.com {
     reverse_proxy localhost:80
   }
   api.yourdomain.com {
     reverse_proxy localhost:4000
   }
   ```
6. Update `VITE_API_URL` in `.env` to `https://api.yourdomain.com/api`
   and rebuild the frontend image (`docker compose up -d --build
   frontend`) since Vite bakes that value in at build time, not runtime.

To update after a `git pull`:
```bash
docker compose up -d --build
```
Migrations run automatically on backend restart via `start:prod`.

---

## Production checklist either way

- [ ] `datasource` in `schema.prisma` set to `postgresql`
- [ ] `JWT_SECRET` is a long random value, not the placeholder
- [ ] `SUPER_ADMIN_PASSWORD` changed immediately after first login
      (`POST /api/auth/change-password`)
- [ ] `CORS_ORIGIN` matches your real frontend domain exactly (incl.
      `https://`, no trailing slash)
- [ ] HTTPS is active on both frontend and backend (Vercel/Render give
      you this for free; on a VPS use Caddy or certbot)
- [ ] Database has backups enabled (managed Postgres add-ons do this
      automatically; on a VPS, cron a `pg_dump` somewhere off-box)
- [ ] `.env` files are never committed (already covered by `.gitignore`)
