# Universal School Timetable Generator

A full-stack, multi-school timetable system: enter teachers, subjects,
classes/divisions, a fully custom 6-day bell schedule, and weekly-hour
requirements — the engine works out a conflict-free schedule (no teacher
or division double-booked), which you can then fine-tune by hand.

- **Backend**: Node.js + Express + Prisma (SQLite by default, swap to
  Postgres for production with one line) + JWT auth.
- **Frontend**: React + Vite, plain CSS (no framework lock-in).
- **Scheduling engine**: constraint-satisfaction backtracking solver
  (`backend/src/services/timetableGenerator.js`) with a greedy fallback
  that reports any lessons it couldn't place, so nothing fails silently.

## Roles

- **Platform admin (`SUPER_ADMIN`)** — sees and controls every school:
  reviews and approves paid signup applications (see below), creates
  schools directly if needed, creates/resets school-admin logins,
  disables schools, and can drop into any school's data to manage it.
- **School admin (`SCHOOL_ADMIN`)** — manages exactly one school:
  teachers, subjects, classes/divisions, bell schedule, curriculum, and
  the generated timetable.

## Signup flow

Schools don't get created directly by anyone but you — they register:

1. A school fills out the public **Register** page (`/register`), linked
   from the login screen.
2. **Without Stripe configured** (the default — see `DEPLOYMENT.md`
   section 0.5 to turn payment on later), their registration goes
   straight into your approval queue with status `PENDING_APPROVAL`.
   **With Stripe configured**, they're sent to Checkout first and only
   reach the queue once payment is confirmed.
3. Log in as the platform admin → **Applications** → **Awaiting
   review** — you'll see every registration that's ready for a
   decision, regardless of whether it went through payment.
4. **Approve** creates the school + a school-admin login in one step,
   and shows you a one-time temporary password to relay to them (no
   email sending is wired up — relay it however you currently talk to
   customers). **Reject** declines it (and cancels their Stripe
   subscription too, if one exists).
5. You can also disable any school at any time from **All Schools** —
   this immediately blocks that school's login (both new logins and
   any session already in progress get cut off).
6. If Stripe is later enabled and a paying school's subscription lapses
   or gets cancelled, their account is disabled automatically the same
   way — no manual step needed.

## 1. Backend setup

```bash
cd backend
cp .env.example .env        # edit JWT_SECRET and the bootstrap admin login
npm install
npx prisma migrate dev --name init   # creates prisma/dev.db (SQLite)
npm run seed                          # optional: loads one demo school
npm run dev                           # http://localhost:4000
```

On first boot the server automatically creates a `SUPER_ADMIN` account
using `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from `.env` — change
that password immediately after your first login (there's a
"change password" endpoint at `POST /api/auth/change-password`).

If you ran `npm run seed`, you also get a demo school:
`admin@greenvalley.edu` / `SchoolAdmin123!`.

To test the paid Request Access flow locally, fill in the `STRIPE_*`
variables in `.env` with **test-mode** keys from your Stripe dashboard
(see `DEPLOYMENT.md` section 0.5) — you can use
[Stripe CLI](https://docs.stripe.com/stripe-cli) (`stripe listen
--forward-to localhost:4000/api/stripe/webhook`) to receive webhooks
locally without deploying anything.

### Switching to Postgres for production

In `backend/prisma/schema.prisma`, change:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

and set `DATABASE_URL` in `.env` to your Postgres connection string, then
re-run `npx prisma migrate dev`.

## 2. Frontend setup

```bash
cd frontend
cp .env.example .env        # point VITE_API_URL at your backend if not localhost:4000
npm install
npm run dev                 # http://localhost:5173
```

## 3. Using it

1. Log in as the platform admin → **All Schools** → **New School** (this
   also creates that school's first admin login).
2. Log in as that school admin (or click **Manage** as the platform
   admin) and, in order:
   - **Bell Schedule** — define exact start/end times per period, per
     day, for all 6 days (or set one day and use "copy to all days").
   - **Subjects** — add subjects, mark labs etc. as double-period.
   - **Teachers** — add teachers, tick which subjects each can teach,
     set max periods/day and /week.
   - **Classes & Divisions** — add classes (e.g. "Grade 6") and their
     divisions/sections (e.g. "A", "B") — fully editable any time.
   - **Curriculum** — for each division, assign subject + teacher +
     hours/week.
3. Go to **Timetable** → **Generate fresh timetable**. The engine tries
   every teacher/slot combination needed to avoid conflicts; if a
   perfect solution isn't possible given the constraints, it places as
   much as it can and lists exactly which lessons couldn't be placed
   (and why) so you can adjust hours/availability and regenerate.
4. Click any cell to manually reassign it — the server rejects any edit
   that would double-book a teacher or division. Lock cells you want to
   keep fixed, then use **Regenerate (keep locked cells)** to rebuild
   everything else around them.
5. Switch **View by** to **Teacher** to see one teacher's schedule
   across every division they teach.

## 4. Deploying to production

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for two full deployment paths —
managed hosting (Render + Vercel) and a self-hosted Docker Compose setup
(`docker-compose.yml` is included at the repo root).

## Project structure

```
backend/
  prisma/schema.prisma       # data model
  prisma/seed.js             # demo data
  src/
    services/timetableGenerator.js   # the CSP scheduling engine
    controllers/, routes/            # REST API
    middleware/auth.js               # JWT + role + school-scoping
frontend/
  src/pages/                 # one page per admin screen
  src/components/Layout.jsx  # sidebar shell
  src/context/AuthContext.jsx
```

## Notes & things you may want to extend

- Rooms/labs aren't modeled yet — everything assumes a division and a
  teacher are the only two resources that need to avoid clashing. Adding
  a `Room` model and a third busy-set in `timetableGenerator.js` would
  extend this cleanly.
- The generator is a practical heuristic solver (randomized backtracking
  with restarts + greedy fallback), not a guaranteed-optimal ILP solver.
  For very tightly constrained inputs it may leave a few lessons
  unplaced — the UI surfaces exactly which ones so you can adjust hours,
  teacher availability, or add another qualified teacher and regenerate.
- Password reset emails, audit logs, and CSV import/export for bulk data
  entry are natural next additions.
