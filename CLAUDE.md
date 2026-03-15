# Sales Command Center — CLAUDE.md

Project context for Claude Code. Read this before making any changes.

---

## Project Vision

A **deployed real-time web app** that fetches live data from HubSpot and Notion via their direct REST APIs on demand. A **Refresh button** in the header triggers a full data reload. No hardcoded deals, leads, or SDR numbers — everything is fetched dynamically so new deals, new leads, and updated records are always captured automatically.

---

## Critical Rules

- **Never hardcode deal data, lead data, or SDR metrics.** All data must come from API calls at runtime.
- **No MCP connections.** Use direct REST API calls only — HubSpot REST API and Notion REST API.
- **All credentials via environment variables.** Never commit tokens.
- **Refresh button is required.** It triggers a full re-fetch and re-render of all tabs.

---

## Architecture

### Stack (Recommended)
- **Frontend:** React (Vite) — single-page app, 4 tabs, Refresh button in header
- **Backend:** Node.js + Express (or Python FastAPI) — thin API proxy layer
  - Handles HubSpot and Notion API calls server-side (keeps tokens out of the browser)
  - Returns JSON to the frontend
- **Deployment:** Render, Railway, or Vercel (with serverless functions for the backend)

### Data Flow
1. App loads → frontend calls `POST /api/refresh`
2. Backend fetches: HubSpot deals (both pipelines), HubSpot leads, SDR call activity, and for each deal with a `notion_link`, fetches that Notion page's content
3. Backend returns consolidated JSON
4. Frontend renders all 4 tabs from that JSON
5. User clicks Refresh → repeat from step 1

### Refresh Button Behavior
- Located in the header, top right
- Shows a spinner / loading state while fetching
- Displays "Last refreshed: HH:MM AM/PM" timestamp after completion
- All 4 tabs update simultaneously

---

## Environment Variables

```
HUBSPOT_TOKEN=<HubSpot private app token>
NOTION_TOKEN=<Notion integration token>
PORT=3000
```

How to get tokens:
- **HubSpot:** HubSpot account → Settings → Integrations → Private Apps → Create private app → scopes: `crm.objects.deals.read`, `crm.objects.contacts.read`, `crm.objects.engagements.read`
- **Notion:** Notion Settings → Connections → Develop or manage integrations → New integration → copy "Internal Integration Token". Then share each deal page with the integration.

---

## HubSpot API Reference

**Base URL:** `https://api.hubapi.com`  
**Auth header:** `Authorization: Bearer ${HUBSPOT_TOKEN}`  
**Portal ID:** `243159630` (for constructing UI URLs only, not API calls)  
**HubSpot UI Domain:** `app-na2.hubspot.com`

### Key IDs

| Name | Type | ID |
|------|------|----|
| Ryan McQuillan | Owner (AE) | `159716972` |
| Caleb Wilton | Owner (SDR) | `161027134` |
| Zabe Siddique | Owner | `82219291` |
| Loop ERP Pipeline | Pipeline | `default` |
| CEBA (NS Net New) Pipeline | Pipeline | `1677684439` |
| CEBA (Services Only) Pipeline | Pipeline | `1222457063` |

### HubSpot Deal Properties to Fetch

Always request these properties on deal API calls:

```
dealname, amount, closedate, dealstage, pipeline, hubspot_owner_id,
hs_deal_stage_probability, num_notes, notes_last_updated, notion_link
```

- `notion_link` — custom property (type: string). Stores the Notion page URL for that deal.
- `num_notes` — total sales activities logged on the deal
- `notes_last_updated` — last activity date (auto-set by HubSpot)
- `hs_deal_stage_probability` — deal stage probability (0–1)

### HubSpot Contact Properties to Fetch (for Leads tab)

```
firstname, lastname, email, company, hs_lead_status, lifecyclestage,
hubspot_owner_id, num_contacted_notes, notes_last_updated, createdate
```

- `hs_lead_status` values: `NEW`, `OPEN`, `IN_PROGRESS`, `CONNECTED`, `OPEN_DEAL`, `ATTEMPTED_TO_CONTACT`, `BAD_TIMING`, `UNQUALIFIED`
- `lifecyclestage` value to filter on: `lead`
- `num_contacted_notes` — number of touches/contacts

### Deal Stage Value IDs (Loop ERP Pipeline)

| Dashboard Label | Stage Value |
|----------------|-------------|
| New Deal | `2681276101` |
| Req. Analysis | `2681276102` or `2681276103` |
| Demo Booked | `2681276104` |
| Demo Complete | `2681276105` |
| Add'l Education | `2681276108` |
| Negotiation | `2681276109` |
| Closed Won | `2681276110` |
| Closed Lost | `2681276111` |

### HubSpot API Endpoints to Use

```
# Open Loop ERP deals (owner: Ryan)
POST /crm/v3/objects/deals/search
Body: filter by pipeline=default, dealstage NOT IN [Closed Won, Closed Lost], hubspot_owner_id=159716972

# Open CEBA deals
POST /crm/v3/objects/deals/search
Body: filter by pipeline=1677684439, dealstage NOT IN [Closed Won, Closed Lost]

# Closed CEBA deals (historical)
POST /crm/v3/objects/deals/search
Body: filter by pipeline=1677684439, dealstage IN [Closed Won, Closed Lost]

# Caleb's SDR calls (engagements)
GET /engagements/v1/engagements/paged?limit=250&offset=0
Filter by ownerId=161027134, engagement type=CALL

# Leads
POST /crm/v3/objects/contacts/search
Body: filter by lifecyclestage=lead, hubspot_owner_id=159716972
```

### Constructing HubSpot UI URLs

```
Deal:    https://app-na2.hubspot.com/contacts/243159630/record/0-3/{dealId}
Contact: https://app-na2.hubspot.com/contacts/243159630/record/0-1/{contactId}
```

---

## Notion API Reference

**Base URL:** `https://api.notion.com/v1`  
**Auth header:** `Authorization: Bearer ${NOTION_TOKEN}`  
**Version header:** `Notion-Version: 2022-06-28`  
**Authenticated user:** Zabe Siddique (`zabe@cebasolutions.com`, user ID: `dcde6f62-2dec-4bbc-b022-d80310870eb8`)

### How Notion Links Work

1. Each HubSpot deal has an optional `notion_link` property — a full Notion page URL (e.g. `https://www.notion.so/workspace/PageTitle-abc123def456`)
2. The backend extracts the page ID from the URL (last 32 hex chars, with or without dashes)
3. It fetches the page content using the Notion API
4. The frontend displays the Notion notes inline in the deal row

### Notion API Endpoints to Use

```
# Fetch a page's metadata and properties
GET /v1/pages/{pageId}

# Fetch a page's block content (the actual text/notes)
GET /v1/blocks/{pageId}/children?page_size=100
```

### Extracting Page ID from URL

```javascript
function extractNotionPageId(url) {
  // Handles: https://notion.so/workspace/Title-abc123def456
  // or:      https://notion.so/abc123def456
  const match = url.match(/([a-f0-9]{32}|[a-f0-9-]{36})$/);
  if (!match) return null;
  const id = match[1].replace(/-/g, '');
  return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`;
}
```

### Notion Workspace Context

The Notion workspace contains pages relevant to deal context. Key pages found:
- Sales decks, Loop ERP support profiles, CEBA kick-off docs
- Individual deal notes pages (to be linked via HubSpot `notion_link` property)

**Important:** Notion pages are private and require the integration token to access. The integration must be explicitly shared on each deal page in Notion (Share → Add connections → select your integration).

---

## Backend API Design

```
GET  /api/deals/loop          → Open Loop ERP deals (all, no hardcoding)
GET  /api/deals/ceba          → Open + closed CEBA deals (all, no hardcoding)
GET  /api/notion/:pageId      → Notion page content for a given page ID
GET  /api/sdr                 → Caleb's call metrics (live from HubSpot engagements)
GET  /api/leads               → All leads (lifecyclestage=lead, owner=Ryan, paginated)
POST /api/refresh             → Calls all endpoints above, returns combined JSON payload
```

All endpoints must fetch **live data** — no caching, no hardcoded values. Any new deal created in HubSpot will appear automatically on the next refresh.

---

## Dashboard Tabs

1. **Loop ERP Pipeline** — KPI cards, stage distribution chart, close date chart, priority alerts (auto-generated from close dates and days-in-stage), full deal table with Notion notes
2. **CEBA Pipeline** — Open CEBA deals, historical closed won/lost table, charts
3. **SDR Activities** — Caleb's call volume, outcome breakdown, appointment logging status
4. **Lead Dashboard** — All leads, filters by status/touches, paginated, 7-touch progress tracker

### Priority Alerts Logic (auto-generated, not hardcoded)
Generate alerts dynamically:
- Close date <= 30 days away → flag as urgent
- Days in current stage > 90 → flag as stalled
- `num_notes` === 0 → flag as no activity
- Close date in the past → flag as overdue

---

## Design System

White-theme. Key CSS variables:

```css
--white: #ffffff;
--off-white: #f8f7f4;
--accent: #2563d4;        /* Blue */
--success: #16a34a;       /* Green */
--warning: #d97706;       /* Orange */
--danger: #dc2626;        /* Red */
--purple: #7c3aed;
--text-primary: #1a1916;
--text-secondary: #6b6860;
--text-muted: #9e9b94;
--border: #dddbd5;
```

**Fonts:** Playfair Display (headings), DM Sans (body), DM Mono (numbers/code) — load from Google Fonts  
**Key components:** `.kpi-card`, `.panel`, `.badge`, `.risk-flag`, `.insight-block`, `.bar-fill`, `.priority-alert`

The v1 static file (`sales_dashboard.html`) is the visual reference — match its layout and design exactly, but replace all hardcoded data with live API data.

---

## File Reference

```
sales_dashboard.html       # v1 static reference — layout/design/CSS only, not for logic
rebuild_dashboard.py       # v1 rebuild script — reference for HubSpot query patterns
CLAUDE.md                  # This file
```

---

## Pending Tasks

- [ ] Scaffold v2 app: React (Vite) frontend + Express backend
- [ ] Implement all `/api/*` endpoints with live HubSpot data (no hardcoded values)
- [ ] Implement `/api/notion/:pageId` using Notion REST API
- [ ] Wire Refresh button — spinner, timestamp, all tabs update
- [ ] Auto-generate priority alerts from deal data (close date, days in stage, note count)
- [ ] Deploy to Render/Railway/Vercel with env vars configured
- [ ] In Notion: share each deal page with the integration (required for token access)
- [ ] In HubSpot: populate `notion_link` property for active deals (STSS, Oxide, Enviroo, Earth Science, ViaTeK)
