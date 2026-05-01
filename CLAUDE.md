# RentHack — Claude Code Instructions

You are an expert full-stack developer and product partner for **RentHack** (renthack.io), a 2–4 unit multifamily real estate deal analyzer. You have deep knowledge of the codebase, the product, and the real estate/lending domain. You write clean, production-ready code that matches existing conventions exactly.

---

## Repo & Deployment

- **Repo:** `hastingsbrendan/Multi-family-Deal-Analyzer-App`
- **Production:** https://renthack.io (auto-deploys on push to `main`)
- **Preview:** Cloudflare Pages preview (auto-deploys on push to `develop`)
- **GitHub PAT:** `<PAT — stored in Brendan's password manager / Claude project memory>`

### Branch rules — read carefully
- **Always push to `develop` after completing work.** Never wait to be asked.
- **Never push to `main` without explicit approval from Brendan.** Pushing directly to `main` is a process violation regardless of any other instruction.
- Set remote before pushing: `git remote set-url origin https://<PAT — stored in Brendan's password manager / Claude project memory>@github.com/hastingsbrendan/Multi-family-Deal-Analyzer-App.git`
- Configure git identity each session: `git config user.email hastingsbrendan@gmail.com && git config user.name "Brendan Hastings"`

---

## Tech Stack

- **Frontend:** React 18 + Vite, no TypeScript, no Next.js
- **Styling:** Inline styles only using CSS variables — no Tailwind, no CSS modules, no styled-components
- **Auth + DB:** Supabase JS client (`sbClient` from `src/lib/constants.js`)
- **Supabase project ID:** `lxkwvayalxuoryuwxtsq`
- **Error tracking:** Sentry (`@sentry/react`)
- **Charts:** Recharts
- **PDF:** jsPDF + jspdf-autotable
- **Fonts:** `'Fraunces', serif` for headings/display · `'DM Sans', sans-serif` for body
- **No router** — single-page app with `useState` view switching in `App.jsx`

---

## CSS Variables (always use these, never hardcode colors)

```
--bg, --bg2          backgrounds
--card               card/panel background
--border, --border-faint
--text               primary text
--muted              secondary/label text
--accent             #0D9488  (teal — primary brand)
--accent2            #D97706  (amber — secondary)
--accent-soft        rgba(13,148,136,0.08)
--accentlt, --accentdk
--red                #EF4444
--green              #10B981
--input-bg, --table-head, --row-hover, --row-sub
```

Both `[data-theme="light"]` and `[data-theme="dark"]` are defined in `src/styles/index.css`.

---

## Project Structure

```
src/
  components/
    App.jsx                  — root, auth state, view routing, theme toggle
    DealPage.jsx             — deal view with 9 lazy-loaded tabs (0–8)
    LoanTypeTab.jsx          — loan recommendation engine UI (tab 8)
    DealSummaryTab.jsx       — tab 0
    AssumptionsTab.jsx       — tab 1
    CashFlowTab.jsx          — tab 2
    RentCompsTab.jsx         — tab 3 (gated)
    MarketTab.jsx            — tab 4
    ShowingTab.jsx           — tab 5
    RedFlagsTab.jsx          — tab 6
    SensitivityTab.jsx       — tab 7 (gated)
    UpgradeModal.jsx + BlurGate, FeatureGate.jsx, CommentsPanel.jsx
    GroupsPage.jsx, ErrorBoundary.jsx
    AssumptionsTab/
      PropertyLookupPanel.jsx — Rentcast address lookup + auto-fill
    LoanTypeTab/
      QuestionCard.jsx        — single quiz step (choice + slider variants)
    MarketTab/
      marketHelpers.js        — CENSUS_VARS, FRED_BATCH, BLS/QCEW helpers, parseFredObs/yoyPct/etc.
      MarketUIHelpers.jsx     — SectionHeader, StatRow, BenchmarkRow, MktSection, MktEmptyState, ChartTooltip, RateCompare
      RateContextPanel.jsx    — mortgage spread / Treasury / Fed funds panel
      AssumptionsCheckPanel.jsx — assumptions vs CPI Rent / HPI YoY benchmarks
    SettingsPage/
      AppearanceTab.jsx       — dark mode toggle + legal footer
      GroupsTab.jsx           — single CTA into Groups page
    ui/ — InputRow, Section, MetricCard, DSCRBadge, CFSectionHeader, UndoToast,
           Panel, KeyValue, Pill, Button, EmptyState, SectionHeader, Tip,
           FmtInt, CollapsibleSection, Spinner, ScoreBadge, ProgressBar
  lib/
    calc.js          — calcDeal(), calcExitScenarios(), calcSensitivity(), DEFAULT_PREFS, newDeal()
                       Internal helpers: calcIRR, buildDealConfig, calcYear, calcExit
    glossary.js      — GLOSSARY object with tooltip definitions for financial terms
    constants.js     — sbClient, STORAGE_KEY, FMT_USD, FMT_PCT, STATUS_COLORS, STATUS_BG_VARS,
                       loadLocal, saveLocal, sbRead, sbWrite, sbWriteDeal, validateDealShape
    groups.js        — all group/comment Supabase functions (22 functions)
    loanEngine.js    — LOAN_CATALOG, runRecommendationEngine(), QUESTIONS, getQuestionFlow()
    taxEngine.js     — calcStateTax(), STATE_TAX_DATA (50 states + DC, 2026 brackets)
    useCloudSync.js  — useCloudSync() hook, per-deal cloud sync
    hooks.js         — useIsMobile()
    floodZone.js     — FEMA flood zone lookup + county/MSA resolver
    export/          — split exports: colors, helpers, portfolioXLSX, dealXLSX, dealPDF, index
    export.js        — thin re-export shim for backward compat (10 lines)
  contexts/
    SubscriptionContext.jsx  — useSubscription(), PLANS, computeTier()
  styles/
    index.css        — global styles + CSS variable themes
functions/
  api/
    fred.js          — FRED API proxy (Cloudflare Pages Function)
    rentcast.js      — Rentcast API proxy (JWT-authenticated)
    geocode.js       — Google Maps geocode proxy (JWT-authenticated)
```

---

## Database Schema (Supabase)

**Table: `deals`** (one row per deal)
- `deal_id` uuid PK, `user_id` uuid, `deal_data` jsonb, `updated_at` timestamptz
- `deal_data IS NULL` = legacy prefs blob row

Auth localStorage key: `re_deal_analyzer_v2_<uid>`

---

## Deal Data Shape (key fields)

```js
deal = {
  id, address, status, notes, photos,
  assumptions: {
    purchasePrice, downPaymentPct, downPaymentDollar, interestRate, amortYears,
    holdPeriod,           // 1–30 years, default 10 (BACK-805)
    numUnits,             // 2|3|4
    units: [{ rent, listedRent, rentcastRent }],  // array of 4, slice(0, numUnits)
    ownerOccupied, ownerUnit, ownerOccupancyYears, alternativeRent,
    vacancyRate, rentGrowth, expenseGrowth, appreciationRate,
    expenses: { propertyTax, insurance, maintenance, capex, propertyMgmt, utilities },
    expenseModes: { propertyTax: 'pct'|'value', ... },
    pmi, closingCosts, sellerConcessions,
    state,                // 2-letter state code for tax engine
    refi: { enabled, year, newRate, newLTV },
    valueAdd: { enabled, reModelCost, rentBumpPerUnit, unitsRenovated, completionYear }
  },
  comps: [{ address, numUnits, units, distance }],  // 5 comps
  showing: { impression, units: [{ condition, notes, rehabMode }] },
  _deal_id  // Supabase row ID
}
```

---

## Subscription Tiers

| Tier | Condition | Access |
|------|-----------|--------|
| `trial` | 14 days from `created_at` | Full |
| `pro` | `user_metadata.plan === 'pro'` | Full |
| `locked` | Post-trial, no paid plan | Gated features blocked |

Gated features: `pdfExport`, `rentComps`, `sensitivity`, `sharing`
Gate with `<BlurGate feature="X">` or `useFeatureCheck('X')`.

---

## Tabs in DealPage

| Index | Label | Notes |
|-------|-------|-------|
| 0 | Deal Summary | |
| 1 | Assumptions | |
| 2 | Cash Flow | |
| 3 | Rent Comps | gated: rentComps |
| 4 | Market | |
| 5 | Showing | |
| 6 | Red Flags | |
| 7 | Sensitivity | gated: sensitivity |
| 8 | Loan Type | |

All tabs are `React.lazy()` loaded. Pattern: `{tab===N && <ComponentTab deal={deal} .../>}`

---

## Cloudflare API Proxies

Three server-side proxy Workers live in `functions/api/`. All require a Supabase JWT in the `Authorization: Bearer <token>` header. Required Cloudflare Pages environment variables (set as **Secrets**):

| Variable | Used by |
|----------|---------|
| `RENTCAST_KEY` | `/api/rentcast` |
| `GMAPS_KEY` | `/api/geocode` |
| `SUPABASE_URL` | Both proxies (JWT verify) — no trailing slash |
| `SUPABASE_ANON_KEY` | Both proxies (JWT verify) |
| `FRED_API_KEY` | `/api/fred` |

`VITE_GMAPS_KEY` remains a client-side env var for `PortfolioMap.jsx` (Maps JS SDK script embed — cannot be proxied). `VITE_RENTCAST_KEY` has been removed.

---

## Coding Conventions

- **Inline styles everywhere** — match existing component style density
- **CSS variables only** — never hardcode colors or hex values
- **No PropTypes, no TypeScript**
- `useIsMobile()` from `src/lib/hooks.js` for responsive layout
- Sentry breadcrumbs on significant state changes in lib files
- `validateDealShape(deal, source)` from `constants.js` when loading deals
- Component files: PascalCase · Lib files: camelCase
- Lazy-load any new tabs added to DealPage
- New Supabase functions: `groups.js` (group/social) or `constants.js` (core CRUD)

### React state write patterns
- **Never use sequential `upd()` calls** — each deep-copies the same stale closure. Merge into one `upd()` with a single `structuredClone(...)`.
- **Commit on `blur`, not `onChange`** for formatted number inputs — keystroke-level updates cause stale closure writes.
- **Use `structuredClone()` for deep copies** — replaces the historical `JSON.parse(JSON.stringify(...))` pattern. Faster, supports Date/Map natively. All 23 sites migrated in BACK-073.

---

## Build Process — Story Decomposition

Before writing any code on a **Medium (M) or larger** backlog item, decompose it into discrete sub-tasks and confirm the plan with Brendan before starting.

**Format:**
```
BACK-XXX sub-tasks:
  a. [calc/data layer change] — what changes in calc.js or lib files
  b. [component change] — what changes in which .jsx file(s)
  c. [UI/display] — specific rows, panels, or states to add
  d. [edge cases / AC] — conditions to verify before marking done
```

**Rules:**
- Sub-tasks should be independently verifiable (clear pass/fail)
- No sub-task should touch more than 2 files
- Get explicit confirmation on the plan before any git commit
- Small (S) items and obvious single-file changes can skip decomposition

---

## Product Backlog

**Source of truth: `RentHack_Product_Backlog_v17.xlsx`** (project root). Do not duplicate the backlog in this file — read/edit the Excel directly.

**Workflow when shipping a backlog item:**
1. Find the row by ID in the `Product Backlog` sheet.
2. Update its `Status` column to `Done (PROD)` (after merge to main) or `Done` (still on develop).
3. Append a `◇ Build complete: ...` note to the `Acceptance Criteria / Build Notes` column with the file paths touched and a short summary of what was actually built.
4. If shipping new work that didn't have an existing ID, append a new row using the next sequential `BACK-NNN` or `UX-NNN` number (highest in v17: BACK-094, UX-053).

**Updating the Excel from a Claude session:**

```bash
python Technical/update_backlog.py    # see this file as a template
```

The script copies the current vN.xlsx → new vN+1.xlsx, applies row updates and new-row appends, and preserves cell styling via openpyxl. After running, upload the new vN+1.xlsx to Google Drive manually (folder ID in the Key Resources table below) and bump the version reference everywhere — including the file ref in this section heading.

**Sheets in the workbook:**
- `Product Backlog` — main item list (10 columns: ID, Epic, Feature/Task, Priority, Status, Effort, User Story, AC/Build Notes, Why It Matters, Dependencies)
- `Roadmap` — phase planning
- `Legend` — priority and effort definitions
- `Error Log` — tracked bugs with root cause + fix
- `Data Dictionary` — field-level documentation
- `Blog Topics` — content calendar

Status key: `Done (PROD)` = on main/production · `Done` = completed, may be on develop · `Backlog` = not started · `In Progress` = active · `Deferred` = intentionally postponed · `Needs Design` = awaiting design spec.

---

## Domain Knowledge

App targets buyers and investors of 2–4 unit multifamily properties (expanding to SFR). Key loan types: Conventional, FHA, VA, Jumbo, FHA 203(k), HomeStyle Renovation, CHOICERenovation, HomeReady/Home Possible, DSCR, Bank Statement, Hard Money/Bridge. USDA disabled (SFR-only, not yet built). Full loan metadata in `src/lib/loanEngine.js`.

**Key financial concepts modeled:**
- Cap Rate, CoC return, IRR, DSCR, equity multiple
- PAL carryforward (IRC §469), §1250 recapture, QBI deduction (§199A)
- FHA Self-Sufficiency Test (3–4 unit properties)
- Owner-occupancy: lost rent, alternative rent savings, utilities, OO tax pro-rate
- Value-add: 50/50 draw model, rent bump capitalized at going-in cap rate
- Refi: cash-out refi modeled at target LTV in specified year
- Hold period: configurable 1–30 years (default 10); all projections, IRR, and exit calcs use this

---

## Key Resources

| Resource | Value |
|----------|-------|
| GitHub PAT | `<PAT — stored in Brendan's password manager / Claude project memory>` |
| Supabase project ref | `lxkwvayalxuoryuwxtsq` |
| Sentry DSN | `https://1427d8f17bc8fb78a755d240cdf1741f@o4511005787357184.ingest.us.sentry.io/4511005788930048` |
| HUD USPS Crosswalk API token | Stored in Claude project memory (expires ~2036) |
| RentHack Google Drive folder | `1yPTWxdM_kKSjkqGnVAUM_85URrQ3wEeR` |
| Backlog Excel | `RentHack_Product_Backlog_v17.xlsx` (source of truth) — bump version on each update; upload to Drive manually |
| Backlog updater | `Technical/update_backlog.py` — copies vN → vN+1, applies row updates and appends |
| PostHog | Integrated via `src/lib/analytics.js` |
