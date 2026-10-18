# Job Search Tracker

A small web app to track job applications. Each account sees only its own data: editable status, follow-up reminders, status history, a funnel by channel, message templates and search-keyword alerts.

The interface is in Spanish. There is no build step: plain HTML, CSS and JavaScript ES modules, hosted on GitHub Pages, with [Supabase](https://supabase.com) as the database and login.

## Features

- **Postulaciones**: table with inline editing (status, channel, CV, dates, notes), search and filters, add dialog, status history, CSV import and export.
- **Embudo**: applied, with response, interviews and offers, plus a breakdown by status and by channel. It uses the status history, so an application that was interviewed and later discarded still counts as interviewed.
- **Recordatorios**: follow-ups that are overdue, due today, due in the next 7 days, and active applications without a date. One click moves the next follow-up 5 days ahead.
- **Plantillas**: message templates that fill `[puesto]`, `[empresa]` and `[fecha]` from a chosen application. `[Nombre]` is left for you to fill in.
- **Alertas**: checklist of keywords to search and keywords to double-check in each posting.
- **Ajustes**: editable channels, CV types and follow-up interval, password change, **export** of all your data (JSON), **import** from a JSON file, and **account deletion** (erases the account and all its data).
- **Accounts**: sign-up with email and password, password recovery by email, and a privacy notice ([`privacy.html`](privacy.html)) that must be accepted. Acceptances are stored in an append-only `consents` table with the notice version.

Automatic rules:

- Setting the status to *Postulada* fills the application date (if empty) and schedules a follow-up in 5 days (if empty).
- *Oferta*, *Descartada* and *Aviso cerrado* clear the follow-up date.
- The app never sends messages. Everything is copied by hand.

## Stack

| Piece | Choice |
| --- | --- |
| Frontend | Static HTML, CSS and ES modules (no build step; `supabase-js` is vendored in `js/vendor`) |
| Backend | Supabase (Postgres + Auth) |
| Login | Email and password (Supabase Auth), sign-up, recovery by email |
| Hosting | GitHub Pages |

## Setup

### 1. Create the Supabase project

1. Create a free project at <https://supabase.com>. If you will open it to other people, pick a region deliberately (see the checklist at the end; the choice matters for data-protection law).
2. Open **SQL Editor** and run the files in [`supabase/migrations`](supabase/migrations) **in order**: `001_initial.sql`, `002_user_settings.sql`, `003_privacy_and_limits.sql`, `004_ingest_tokens.sql`, `005_application_area.sql`, `006_area_autodetect.sql`. Run each one once (003 adds constraints that cannot be added twice). They create the tables, triggers, Row Level Security policies, the consent log, the account-deletion function and per-account size limits.
3. Open **Project Settings > API Keys** and copy the **Project URL** and the **publishable key** (`sb_publishable_...`). Never use or share a secret or `service_role` key. Supabase documents that the legacy `anon` key still works but is planned to be deprecated by the end of 2026, so prefer the publishable key; if sign-in fails with it, the legacy `anon` key is a fallback for now.

### 2. Configure authentication

In the Supabase dashboard, under **Authentication** (menu names change between versions; look for the equivalent):

1. Sign-ups must be **allowed** (*Allow new users to sign up* on). The app has a registration form.
2. **URL Configuration**: set *Site URL* to your published address (`https://<user>.github.io/<repo>/`) and add the same address, plus `http://localhost:8000/` for local tests, to *Redirect URLs*. Confirmation and recovery links go there.
3. **Email confirmation**: keep *Confirm Email* on for anything public. The built-in email service is documented at 2 emails per hour per project, so for real use configure a custom SMTP provider. For a quick private test you can temporarily turn confirmation off; the app then signs the user in right after registration.
4. Password rules: the app asks for at least 10 characters. You can also raise the minimum in the Supabase password settings.

### 3. Configure the app

Edit [`js/config.js`](js/config.js) and paste the Project URL and the publishable key. That key is meant to be public: Row Level Security makes every table readable and writable only by its owner.

### 4. Publish with GitHub Pages

1. Push the repository to GitHub (public, required by free GitHub Pages).
2. In **Settings > Pages**, choose *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Wait a minute. The site will be at `https://<user>.github.io/<repo>/`.

### 5. Complete the privacy notice

Open [`privacy.html`](privacy.html) and fill every `[COMPLETAR]` placeholder (responsible party, address, contact email, hosting region, transfer basis, email provider, backup retention), then remove the draft banner. It is a draft, not legal advice. When the text changes in substance, change the version in **both** `privacy.html` (`#policy-version`) and `PRIVACY_VERSION` in `js/constants.js`: every user is asked to accept the new version at their next sign-in.

### 6. Create your account and load your data

1. Open the site, choose **Crear una cuenta**, accept the privacy notice, and confirm the email.
2. To load existing applications, templates and keywords, use **Ajustes > Importar archivo JSON** with a file in the export format (see `examples/sample.json`). Items that already exist are not duplicated and invalid rows are skipped with a warning list. CSV import is also available on the Postulaciones tab. Personal data files must stay out of the repository (`data/*.csv` is git-ignored).

## Customizing

The **Ajustes** tab lets each user edit the channels, the CV types and the days until a follow-up, change the password, download or import their data and delete their account. Statuses are fixed on purpose: the funnel and the reminders depend on them. Settings live in the `user_settings` table (one row per user).

## Database changes

Schema changes go in a new numbered file under `supabase/migrations` (`004_...sql`, and so on), written to be safe to run once on top of the previous ones.

## Automation tokens (optional)

An automated job (for example a daily search run) can add applications and read statuses without your password:

1. Run `004_ingest_tokens.sql`, then open **Ajustes > Tokens de automatización** and create a token. It is shown once; only its SHA-256 hash is stored.
2. The job calls two public RPCs with the publishable key plus the token:
   - `POST {SUPABASE_URL}/rest/v1/rpc/ingest_applications` with `{"p_token": "...", "p_rows": [{"company", "role", "channel", "url", "notes", "area"}]}` (`area` is optional: `Tech`, `Farmacia` or `A confirmar`; if omitted it is guessed from the text by `guess_area`; max 50 rows per call; rows always enter as *Pendiente*; duplicates by company+role or URL are skipped and reported).
   - `POST {SUPABASE_URL}/rest/v1/rpc/list_applications_for_sync` with `{"p_token": "..."}` returns `company, role, url, status, area, updated_at` so the job can respect the statuses you set in the app.
3. A token cannot edit or delete anything. Revoke it from the same screen if it leaks. Never commit it to the repository.

## CSV format

Header: `company,role,channel,url,cv,area,status,applied_on,next_follow_up,notes`. `area` is `Tech`, `Farmacia` or `A confirmar` (if missing it is guessed from `cv` and the posting text; unclear cases become `A confirmar`). `applied_on` is shown as *Movimiento* in the app: the date of the last relevant event (application sent, interview, ...).

- `company` and `role` are required.
- `status` must be one of the app statuses; otherwise it becomes *Pendiente*.
- Dates use `yyyy-mm-dd`.
- Cells that start with `=`, `+`, `-` or `@` are prefixed with `'` on export so spreadsheet apps do not run them as formulas. The prefix is removed on import.

## Run locally

```bash
python -m http.server 8000
# open http://localhost:8000
```

## Security notes

- All data is protected by Row Level Security (`auth.uid() = user_id`), including the settings table.
- Per-account limits (rows and text length) are enforced in the database by `003_privacy_and_limits.sql`.
- `delete_my_account()` is a `security definer` function that only deletes the calling user; foreign keys cascade to all their rows.
- Passwords are handled by Supabase Auth only; the app and the repository never store them.
- Data is always rendered as text, never as HTML.
- Only `http` and `https` links from the data are clickable.
- GitHub Pages on the free plan only serves public repositories. The repository contains no secrets: only the public publishable key.
- `supabase-js` is committed under `js/vendor` (pinned version), so the app does not load code from third-party CDNs.

## Before opening sign-ups to the public

Implemented: registration, password recovery, consent with versioned log, export, import, deletion, size limits. Still your responsibility (a checklist, not legal advice):

1. Configure custom SMTP and keep email confirmation on (built-in email: 2 per hour per project, as documented by Supabase).
2. **CAPTCHA is not implemented.** Supabase supports hCaptcha and Cloudflare Turnstile; add it before a public launch so bots cannot mass-register.
3. Fill in and have `privacy.html` reviewed by someone with legal knowledge.
4. Check where the database is hosted and what your local law requires for international transfers and for registering a database that other people use (in Argentina: Ley 25.326 and AAIP rules, including whether a registration is needed). Consider an EU region; verify the current list of countries considered adequate rather than trusting this file.
5. Do not add features that read job portals automatically without checking their terms of use first. The app does not do this.
6. Decide how you will answer access, correction and deletion requests that arrive by email (the app already lets users self-serve).

## Project layout

```
index.html
privacy.html     draft privacy notice (placeholders to complete)
css/styles.css
js/
  app.js          tabs, session, startup
  api.js          Supabase calls
  logic.js        statuses, reminders, funnel, template filling
  csv.js          CSV parse and write
  constants.js    statuses, channels, default templates and keywords
  config.js       Supabase URL and publishable key
  vendor/         pinned supabase-js bundle
  portability.js  JSON export and validated import
  ui.js           DOM and date helpers
  views/          one module per tab, plus auth.js (login, sign-up, recovery, consent)
supabase/migrations/  numbered SQL files, run in order
examples/sample.json  generic import example
```
