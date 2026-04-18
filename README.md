# URBSCAN — B2B Lead Intelligence Engine

> Find, score, track, and follow up on B2B leads near any location in Malaysia using Google Places + Hunter.io + website email scraping.

---

## What It Does

URBSCAN is a B2B prospecting tool built for field sales teams in Malaysia. Enter any address, pick an industry vertical, and it returns a scored list of nearby companies — complete with phone numbers, websites, email contacts, and LinkedIn links. Log outreach, set follow-up reminders, and manage your daily tasks all in one place.

**Core workflow:**
1. Enter a location (or multiple locations)
2. Select an industry vertical
3. Get a ranked list of nearby B2B leads
4. Enrich with emails via website scraping or Hunter.io
5. Log outreach, set follow-up reminders
6. Review your daily task list in the Today tab

---

## Features

### Today Tab — Daily Dashboard
- **My Tasks** — add standalone to-do items with a title and date
- **Task groups** — overdue / today / done, each with a count
- **Progress bar** — see X/Y tasks completed for the day
- **Inline task editing** — click any task title to rename it
- **Follow-ups Due** — auto-pulls overdue follow-up contacts; mark done directly without leaving the tab
- **Greeting + date header** — good morning / afternoon / evening
- **Midnight auto-refresh** — task list updates at midnight without a page reload
- **Badge count** on tab — total pending tasks + overdue follow-ups

### Lead Discovery
- **Google Places API (New)** — parallel keyword search across 10 industry verticals
- **Lead scoring** — ranked by activity (review count), rating, and proximity
- **Adjustable score weights** — drag sliders to reprioritise by what matters to you
- **Multi-location search** — scan up to 5 locations simultaneously
- **Last scan restored on refresh** — results persist in localStorage, no re-scan needed
- **Filter chips** — filter results by has-phone / has-website / has-email in one click
- **Pipeline stats bar** — count per stage (New / Contacted / Following / Won / Lost) above the list

### Industry Verticals
`All` `Tech/IT` `Finance` `Telco` `Consulting` `Legal` `Healthcare` `Logistics` `Manufacturing` `Trading`

### Contact Enrichment
- **Phone + website** from Google Places
- **Website email scraping** — free, no API key required; scans main page + `/contact`, `/about`, `/team` and more for public email addresses
- **Batch email scraping** — one click scrapes all leads with websites simultaneously
- **Hunter.io** — email contacts with names, job titles, and confidence scores
- **Bulk Hunter lookup** — one click finds contacts for all leads with websites
- **Apollo.io** — company size, industry, LinkedIn, annual revenue, founding year

### Outreach Tools
- **WhatsApp Composer** — 4 customisable message templates, variable substitution (`{name}`, `{company}`, `{lead}`), one-click send
- **Unfilled variable warning** — alerts you if any `{variable}` placeholders remain before sending
- **WhatsApp direct link** — `wa.me` deep link from any phone number
- **LinkedIn company search** — pre-built search URL per lead
- **Google Maps link** — open directions instantly

### Pipeline & CRM
- **5-stage pipeline** — New → Contacted → Following Up → Won → Lost
- **Notes per lead** — saved to localStorage automatically
- **Contact log** — record every outreach with method, notes, and timestamp
- **Follow-up reminders** — set a date; overdue contacts surface in Today tab and Contacts tab
- **Bulk mark done** — mark all overdue follow-ups done in one click

### Contacts Tab
- View all logged contacts in one place
- **Search** — filter by company name, address, or notes
- **Sort** — by name, date contacted, follow-up date, or method
- Filter: **All / Overdue / Upcoming / Done**
- Red badge on tab when follow-ups are overdue
- **📅 Add to Google Calendar** — one click creates a pre-filled calendar event (no OAuth required)
- Mark follow-ups done or reopen them

### Data & Export
- **CSV export** — score, rating, phone, website, pipeline status, notes, and Hunter.io contacts (one row per contact person)
- **Backup / Restore** — export all app data to a JSON file and restore it on any device

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Maps | `@react-google-maps/api` |
| Fonts | Syne + JetBrains Mono |
| Lead Discovery | Google Places API (New) — Text Search |
| Email Scraping | Server-side fetch + regex (no API key needed) |
| Email Enrichment | Hunter.io Domain Search API |
| Company Enrichment | Apollo.io Organization Enrich API |
| Storage | localStorage (pipeline, notes, contacts, tasks, history) |

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/darksm10-dotcom/urbscan.git
cd urbscan
npm install
```

### 2. Configure environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_key
HUNTER_API_KEY=your_hunter_io_key
APOLLO_API_KEY=your_apollo_io_key   # optional
```

| Key | Where to get | Free tier |
|-----|-------------|-----------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) — enable **Places API (New)**, **Maps JavaScript API**, **Geocoding API** | $200/month credit |
| `HUNTER_API_KEY` | [hunter.io](https://hunter.io) | 25 searches/month |
| `APOLLO_API_KEY` | [apollo.io](https://app.apollo.io) | 50 credits/month (optional) |

> **Note:** Website email scraping works without any API key — it's built into the app and scrapes company websites directly.

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## How the Lead Score Works

Each lead is scored 0–100 across three dimensions:

| Dimension | Max | Formula |
|-----------|-----|---------|
| Activity (review count) | 40 pts | `min(40, reviewCount / 200 × 40)` |
| Google Rating | 40 pts | `(rating − 1) / 4 × 40` |
| Proximity | 20 pts | `(1 − distance / radius) × 20` |

Use the **Weight** sliders in the toolbar to redistribute these points in real time.

| Score | Label |
|-------|-------|
| ≥ 70 | HIGH |
| 40–69 | MED |
| < 40 | LOW |

---

## Project Structure

```
app/
├── api/
│   ├── nearby/           # Google Places proxy
│   ├── hunter/           # Hunter.io proxy
│   ├── enrich/           # Apollo.io proxy
│   └── scrape-emails/    # Website email scraper
├── page.tsx              # Main page (Today + Scan + Contacts + Notes tabs)
components/
├── SearchPanel.tsx       # Left sidebar — search controls
├── ResultsList.tsx       # Right panel — leads, pipeline, filter chips, stats
├── WhatsAppComposer.tsx  # WhatsApp message composer with templates
├── BuildingMap.tsx       # Google Maps with custom markers
├── TodayPanel.tsx        # Daily task list + follow-up dashboard
└── ContactsPanel.tsx     # Follow-up tracker with search and sort
lib/
├── places.ts             # Geocoding + search with cache
├── cache.ts              # sessionStorage cache (10 min TTL)
├── pipeline.ts           # Lead status (localStorage)
├── contacts.ts           # Contact log + Google Calendar links
├── tasks.ts              # Daily task CRUD (localStorage)
├── wa-templates.ts       # WhatsApp template helpers
├── backup.ts             # Data export/import (JSON)
├── scan-cache.ts         # Last scan persistence
├── route.ts              # Nearest-neighbour route optimisation
└── history.ts            # Search address history
types/
└── index.ts              # Shared TypeScript types
```

---

## License

MIT
