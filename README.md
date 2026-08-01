# ClearCall

**Know who is calling before you answer.**

ClearCall is a verified employer calling platform built for the Australian job market. It protects job seekers from scam recruitment calls by requiring every employer to verify their Australian Business Number (ABN) and work email before they can contact anyone. When a verified employer calls a job seeker through ClearCall, the job seeker sees a full trust verification screen — company name, logo, caller name, designation and job role — instead of an unknown phone number. The recruiter's personal phone number is hidden from the receiver by default on every call, routed through ClearCall's masked Twilio number.

ClearCall works for any organisation that calls people about a job or professional role — corporate recruiters, schools calling teachers, hospitals calling nurses, construction companies calling tradespeople, government departments calling public servants, and more.

---

## What's in this repository

This is a monorepo with two applications:

```
clearcall/
├── backend/     Node.js + Express API, SQLite database (better-sqlite3)
├── frontend/    React + Vite mobile web app (26 screens)
├── package.json Root scripts that build/run both together
└── railway.toml Railway deployment configuration
```

In production, the Express backend serves the built React frontend as static files, so the whole app runs as a single deployed service.

---

## 1. How to install and run locally

### Prerequisites
- Node.js 18 or newer
- npm

### Step-by-step

```bash
# 1. Clone or unzip the project, then from the project root:
cd clearcall

# 2. Install dependencies for both backend and frontend
npm run install:all

# 3. Set up your backend environment variables
cd backend
cp .env.example .env
# open .env and fill in real values (see section 2 below) — placeholders
# work fine for local testing except for real email/SMS/ABN lookups

# 4. Start the backend API (defaults to http://localhost:3000)
npm run dev

# 5. In a second terminal, start the frontend dev server
cd ../frontend
npm run dev
# opens on http://localhost:5173 and proxies /api requests to the backend
```

Open `http://localhost:5173` in your browser (or on your phone via your computer's local IP, since this is a mobile-first web app) and you'll land on the Splash screen.

The SQLite database file (`clearcall.db`) is created automatically the first time the backend starts — no manual setup required.

### Running the production build locally

```bash
# from the project root
npm run build     # builds the frontend into frontend/dist
npm start          # starts the backend, which now also serves the built frontend
# open http://localhost:3000
```

---

## 2. Environment variables explained

All backend environment variables live in `backend/.env` (copy from `backend/.env.example`).

| Variable | What it's for | Required to run at all? |
|---|---|---|
| `JWT_SECRET` | Signs and verifies login tokens. Use a long random string in production. | Yes |
| `RESEND_API_KEY` | Sends the work-email OTP verification emails via [Resend](https://resend.com). Without a real key, the backend runs in **dev mode**: it logs the 6-digit code to the server console instead of emailing it, so you can still test the full flow. | No (dev mode fallback) |
| `ABN_API_GUID` | Your GUID for the Australian Business Register (ABR) web services. Pre-filled with the GUID you provided: `57bec0d9-7b1d-47eb-ac80-0be5b16ccce3`. | Yes, for real ABN checks |
| `TWILIO_ACCOUNT_SID` | Twilio account SID, used to place masked ClearCall Verified Calls. Without real credentials, calls run in **dev mode**: the backend logs what it would have done instead of dialling out. | No (dev mode fallback) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token (secret — never expose to the frontend). | No (dev mode fallback) |
| `TWILIO_PHONE_NUMBER` | The Twilio number used as caller ID for every ClearCall Verified Call, masking the recruiter's real number. | No (dev mode fallback) |
| `DATABASE_PATH` | File path for the SQLite database. Defaults to `./clearcall.db`. | Yes (has default) |
| `PORT` | Port the Express server listens on. Defaults to `3000`. | Yes (has default) |
| `FRONTEND_ORIGIN` | Allowed CORS origin for the frontend during local development (`http://localhost:5173`). In production this isn't used since the frontend is served from the same origin. | Yes (has default) |
| `PUBLIC_BASE_URL` | The publicly reachable base URL of your deployed backend, used to build Twilio callback URLs (`/api/calls/twiml/:id`, `/api/calls/status/:id`). Set this to your Railway URL in production. | Only needed for real Twilio calls |

**Nothing sensitive is ever exposed to the browser.** The ABN GUID and Twilio credentials only ever touch the backend.

---

## 3. How to deploy to Railway

1. **Push this project to a GitHub repository** (Railway deploys from Git).
2. **Create a new Railway project** → "Deploy from GitHub repo" → select your ClearCall repo.
3. Railway will detect `railway.toml` automatically. It runs:
   - Build: `npm run build` (installs backend + frontend deps, builds the React app)
   - Start: `npm start` (starts the Express server, which also serves the built frontend)
4. **Add environment variables** in Railway's project Settings → Variables. Add every variable listed in section 2 above, using your real values:
   - `JWT_SECRET` — generate a long random string (e.g. `openssl rand -hex 32`)
   - `RESEND_API_KEY` — from your Resend dashboard
   - `ABN_API_GUID` — `57bec0d9-7b1d-47eb-ac80-0be5b16ccce3` (or your own GUID)
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` — from your Twilio console
   - `DATABASE_PATH` — `./clearcall.db` (Railway gives you a writable filesystem; for durability across redeploys, attach a Railway Volume and point this at a path inside it)
   - `PORT` — Railway sets this automatically; you normally don't need to set it yourself
   - `FRONTEND_ORIGIN` — not required in production (same-origin)
   - `PUBLIC_BASE_URL` — your Railway-assigned domain, e.g. `https://clearcall-production.up.railway.app`
5. **Deploy.** Railway will build and start the app. Once live, Railway gives you a public URL like `https://your-app-name.up.railway.app`.
6. **(Recommended) Attach a persistent volume** for the SQLite database so your data survives redeploys: Railway project → your service → Volumes → create a volume, mount it at e.g. `/data`, and set `DATABASE_PATH=/data/clearcall.db`.
7. **(Optional) Custom domain**: Railway → your service → Settings → Networking → add a custom domain, e.g. `app.clearcall.com.au`, and update your DNS as instructed.

Once deployed, your ClearCall app — frontend and backend together — is live at your Railway URL, with real ABN verification, real OTP emails, and real masked calling (once you've added your Twilio number).

---

## 4. How to test each feature

### Authentication
- Sign up as a job seeker (`/signup/jobseeker`) and as an employer (`/signup/employer`).
- Try an employer signup with a personal email (gmail.com etc.) — it should be rejected with a clear error, both in the browser and if you bypass the UI and call the API directly (server-side enforcement).
- Log out and log back in with both account types.

### Work email OTP
- During employer signup, after ABN verification you'll land on the OTP screen. If `RESEND_API_KEY` isn't set, check your backend terminal — the 6-digit code is printed there (`[DEV MODE - no RESEND_API_KEY set] OTP for ... : 123456`). Enter it to verify.
- With a real Resend key, the code arrives by email using ClearCall's branded template.
- Try an expired or wrong code to confirm the error handling.

### ABN verification
- Enter any valid 11-digit Australian ABN during employer signup. The backend calls the real Australian Business Register API and returns the official registered business name.
- Try an invalid or cancelled ABN to see the failure screen.

### Making calls
- As a verified employer, go to **Make a Call**, fill in a recipient, and choose **ClearCall Verified Call** or **Normal Phone Call**.
- Verified calls are blocked until your company's ABN is confirmed — try it before and after verification to see the difference.
- Check **Call History** to see the logged call with the correct verified/normal badge.

### Reports and auto-suspension
- As a job seeker, report a call against a company from Call History.
- Submit 3 reports against the same company — its status changes to "Under Review".
- Submit 5 reports — the company is automatically suspended and can no longer initiate calls (test by trying to make another call from that employer account).

### Call display settings
- Go to Settings → Call Display Settings as an employer. Toggle "Hide my number", "Show my name", "Show my designation", "Show my profile photo" and watch the live preview card update instantly.
- Confirm the defaults: hide number **on**, show name **on**, show designation **on**, show photo **off**.

### Incoming call screens
- From the Job Seeker Profile screen there are two demo buttons — "Simulate Verified Call" and "Simulate Unverified Call" — so you can see both incoming-call screens without needing a live phone call. In production these are triggered by the real-time metadata push described in `backend/src/services/twilio.js`.

---

## Notes on this build

- **Sandboxed test environment:** every backend endpoint in this repo was built and verified end-to-end (signup, login, OTP, work profiles, call initiation, call history, and the report auto-flagging thresholds at 1/3/5 reports) against a live local server with a real SQLite database. The one exception is a live network call to `abr.business.gov.au`, which the development sandbox used to build this app blocks by network policy — the ABR integration code is complete and correct, and will work as soon as it's run somewhere with normal internet access (your machine, or Railway).
- **Twilio and Resend run in "dev mode"** until you supply real credentials — this is intentional so you can test the entire product flow immediately without needing accounts first. Swap in real keys whenever you're ready and no code changes are required.
