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
    ui/ — InputRow, Section, MetricCard, DSCRBadge, CFSectionHeader, UndoToast
  lib/
    calc.js          — calcDeal(), calcExitScenarios(), calcSensitivity(), DEFAULT_PREFS, newDeal()
    constants.js     — sbClient, STORAGE_KEY, FMT_USD, FMT_PCT, loadLocal, saveLocal, sbRead, sbWrite, sbWriteDeal
    groups.js        — all group/comment Supabase functions (22 functions)
    loanEngine.js    — LOAN_CATALOG, runRecommendationEngine(), QUESTIONS, getQuestionFlow()
    taxEngine.js     — calcStateTax(), STATE_TAX_DATA (50 states + DC, 2026 brackets)
    useCloudSync.js  — useCloudSync() hook, per-deal cloud sync
    hooks.js         — useIsMobile()
    export.js, floodZone.js
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
- **Never use sequential `upd()` calls** — each deep-copies the same stale closure. Merge into one `upd()` with a single `JSON.parse(JSON.stringify(...))`.
- **Commit on `blur`, not `onChange`** for formatted number inputs — keystroke-level updates cause stale closure writes.

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

Last updated: March 2026 (v15). Status key: `Done (PROD)` = on main/production · `Done` = completed, may be on develop · `Backlog` = not started · `In Progress` = active · `Deferred` = intentionally postponed.

### Financial Model
| ID | Priority | Status | Effort | Feature |
|----|----------|--------|--------|---------|
| 1 | P0 | Done | XL | Core financial engine (Cap Rate, CoC, IRR, DSCR, NOI) |
| 2 | P0 | Done | L | Assumptions tab (rents, expenses, vacancy, financing) |
| 3 | P1 | Done | L | Value-Add / Remodel modeling |
| 4 | P2 | Done | M | Refinance scenario modeling |
| 5 | P1 | Done | L | Owner-occupancy cash flow modeling |
| BACK-010 | P1 | Backlog | M | 10-year cash flow view on Deal Summary |
| BACK-011 | P1 | Done (PROD) | S | Incremental Cash Flow metric — correct formula |
| BACK-012 | P2 | Done (PROD) | S | HOA / condo fee as real expense field |
| BACK-013 | P1 | Done (PROD) | XL | Advanced Tax Modeling — cost seg, PAL carryforward (IRC §469) |
| BACK-014 | P1 | Done (PROD) | L | State income tax engine — taxEngine.js (50 states + DC) |
| BACK-015 | P1 | Done (PROD) | M | State income tax UI — Tax Profile section + Cash Flow row |
| BACK-016 | P2 | Backlog | S | State income tax — Deal Summary card update |
| BACK-017 | P3 | Backlog | M | State income tax v2 — auto-populate county local rates |
| BACK-018 | P1 | Done (PROD) | S | Lender-view DSCR (full-building rent, no OO deduction) |
| BACK-019 | P2 | Done (PROD) | M | Refi scenario modeling |
| BACK-020 | P2 | Done (PROD) | M | Value-add renovation scenario |
| BACK-021 | P1 | Done (PROD) | L | PAL carryforward + §469 suspended loss tracking |
| BACK-062 | P1 | Done (PROD) | S | FHA Self-Sufficiency Test — Deal Summary card |
| BACK-063 | P2 | Backlog | M | DTI Calculator — loan eligibility + PMI impact |
| 805 | P2 | Done (develop) | M | Hold period flexibility — configurable exit year (1–30 yrs) + Exit Year Scenarios panel |
| SFR-001 | P1 | Backlog | S | SFR data layer — numUnits:1 + propertyType field |

### Analysis
| ID | Priority | Status | Effort | Feature |
|----|----------|--------|--------|---------|
| 6 | P2 | Done | M | Sensitivity analysis tab |
| 801 | P1 | Done | L | Scenario analysis — Adverse / Base / Optimal toggles |
| 802 | P1 | Done | M | Interactive sensitivity sliders |
| 803 | P1 | Backlog | L | Deal comparison view (side-by-side) |
| 804 | P1 | Backlog | L | Portfolio-level dashboard |
| 806 | P2 | Backlog | S | Additional red flag auto-checks |

### Auth & Users
| ID | Priority | Status | Effort | Feature |
|----|----------|--------|--------|---------|
| 101 | P0 | Done | L | Supabase Auth — email/password + email verification |
| 102 | P1 | Done | M | Google OAuth |
| 103 | P0 | Done | S | Password reset flow |
| 104 | P1 | Done | S | User profile page |
| 105 | P0 | Done | M | Row Level Security on all Supabase tables |
| 106 | P1 | Done | M | User preferences & global default settings |
| 108 | P2 | Backlog | M | Income & tax profile |
| 109 | P3 | Backlog | S | Notification preferences |
| UX-006 | P1 | Done (PROD) | XS | Surface Google OAuth button on auth screen |

### Infrastructure
| ID | Priority | Status | Effort | Feature |
|----|----------|--------|--------|---------|
| 1001 | P1 | Done | XL | Migrate to React/Vite |
| 1002 | P1 | Done | M | GitHub CI/CD + Cloudflare Pages |
| 1003 | P1 | Done | M | Error monitoring (Sentry) |
| 1004 | P0 | Done | L | Database schema redesign for multi-user |
| 1005 | P1 | Done (develop) | L | Serverless API layer — Rentcast + geocode proxy Workers |
| 1006 | P2 | Backlog | M | Data backup & disaster recovery *(deferred — requires Supabase Pro + R2 cost approval. Build plan saved in backlog AC column.)* |
| 1007 | P2 | Backlog | M | Performance monitoring & analytics (PostHog) |
| BACK-064 | P0 | Done (PROD) | S | FRED API — CORS fix via Cloudflare Pages Function proxy |
| BACK-065 | P2 | Done (PROD) | M | FRED API — expanded 5-series batch + Rate Context panels |

### Loan Type Module
| ID | Priority | Status | Effort | Feature |
|----|----------|--------|--------|---------|
| LOAN-001 | P2 | Backlog | S | Save selected loan type to Supabase deal record |
| LOAN-002 | P1 | Done (PROD) | XL | Loan recommendation engine — quiz/wizard UX |
| LOAN-003 | P2 | Backlog | M | Fix loan engine audit issues (472 no-recommendation scenarios, HomeStyle hard-disqualify, CHOICERenovation scoring gap, Bank Statement for W-2 users, null DSCR on empty rents) |
| LOAN-004 | P2 | Backlog | S | USDA loan re-enable for SFR |
| 1404 | P1 | Backlog | S | Dynamic down payment calculation by loan type |
| 1405 | P1 | Done | M | County loan limit lookup via ZIP code |
| 1408 | P1 | Done | L | Loan eligibility filter — show only qualifying loans |
| 1409 | P1 | Backlog | M | MIP / PMI monthly cost in cash flow model |
| 1410 | P1 | Backlog | S | VA Funding Fee & FHA UFMIP in closing costs |
| 1412 | P2 | Backlog | L | Loan comparison side-by-side view |
| 1413 | P2 | Backlog | M | FHA 203(k) rehab budget integration |

### UX & UI
| ID | Priority | Status | Effort | Feature |
|----|----------|--------|--------|---------|
| BACK-030 | P2 | Done (PROD) | L | Deal Summary redesign — equity chart + profitability layout |
| BACK-031 | P2 | Done (PROD) | S | Assumptions tab — consolidated 2/3-col input grids |
| BACK-032 | P2 | Done (PROD) | M | Traffic-light metric coloring with investor benchmarks |
| BACK-033 | P3 | Backlog | S | Pill-style tab bar with icons |
| BACK-034 | P3 | Backlog | M | Live recalculation sidebar on Assumptions tab |
| BACK-035 | P3 | Backlog | S | Dark mode elevation polish |
| BACK-036 | P2 | Done (PROD) | M | Portfolio page — card grid layout |
| BACK-050 | P1 | Backlog | M | Real app screenshots for landing page |
| UX-010 | P2 | Backlog | M | Tab bar — icons and beginner/advanced grouping |
| UX-012 | P1 | Backlog | M | Assumptions tab — collapse advanced inputs by default |
| UX-014 | P2 | Backlog | L | Assumptions tab — live summary sidebar / sticky footer |
| UX-015 | P1 | Backlog | M | Deal Summary — plain-English verdict card at top |
| UX-017 | P1 | Backlog | S | Mobile — declutter global nav inside a deal |
| UX-018 | P2 | Backlog | M | Mobile — Cash Flow tab Year 1 default + scroll shadow |
| 910 | P1 | Backlog | M | Effective mortgage metric — hero KPI for house hacking |
| 914 | P1 | Backlog | M | Post-tax cash flow in Deal Summary monthly section |
| 916 | P2 | Backlog | M | Assumptions tab — Progressive Disclosure (Advanced Mode toggle) |
| 917 | P2 | Backlog | M | Sticky Live KPI Bar — persists across tab scroll |
| 918 | P2 | Backlog | M | Cash Flow tab — Year 1 waterfall chart |
| 920 | P1 | Backlog | S | Quick-switch scenario toggle — House Hack vs. Fully Rented |

### Data & Integrations
| ID | Priority | Status | Effort | Feature |
|----|----------|--------|--------|---------|
| 501 | P1 | Done | L | Property data auto-fill from listing URL |
| 502 | P1 | Done | L | Rent comps from Rentcast API |
| 503 | P1 | Done | M | Property tax history & assessment data |
| BACK-040 | P0 | Done (PROD) | L | Rentcast integration — property lookup + rent AVM |
| BACK-041 | P2 | Backlog | S | RentCast — purchase price AVM |
| BACK-042 | P2 | Done (PROD) | S | FEMA flood zone lookup |
| BACK-043 | P1 | Done (PROD) | M | Loan limits — FHFA conforming + FHA by ZIP (2026) |
| 504 | P2 | Backlog | M | Permit & code violation history |
| 507 | P2 | Backlog | S | Mortgage rate feed (live rates by loan type) |

### Monetization & Payments
| ID | Priority | Status | Effort | Feature |
|----|----------|--------|--------|---------|
| 401 | P0 | Done | L | Stripe integration — subscription checkout |
| 402 | P0 | Backlog | M | Stripe webhooks — subscription lifecycle |
| 403 | P1 | Backlog | S | Billing portal (manage, invoices, cancel) |
| MON-001 | P0 | Done (PROD) | L | Subscription tiers — trial/pro/locked |
| 911 | P1 | Done | L | Pricing tier enforcement |

### Growth & Marketing
| ID | Priority | Status | Effort | Feature |
|----|----------|--------|--------|---------|
| SEO-001 | P1 | Done (PROD) | S | robots.txt, sitemap.xml, meta tags, OG |
| SEO-002 | P1 | Done (PROD) | S | OG image (1200×630) |
| SEO-007 | P2 | Done (PROD) | M | Blog — coming soon page at /blog/ |
| BACK-051 | P1 | Backlog | M | Landing page copy + testimonials |
| BACK-060 | P2 | Backlog | S | Landing page — add Pro pricing tier |
| 1202 | P1 | Backlog | M | Email onboarding sequence |
| 1204 | P2 | Backlog | S | In-app NPS + feature requests |
| SEO-008 | P2 | Backlog | M | Blog — first post: 'How to analyze a duplex in 5 minutes' |

### STR Module (all Backlog)
| ID | Priority | Effort | Feature |
|----|----------|--------|---------|
| 1501 | P0 | M | STR revenue estimator (per unit) |
| 1502 | P1 | L | AirDNA API integration |
| 1504 | P1 | L | STR revenue projection in cash flow model |
| 1505 | P1 | M | STR vs LTR comparison card |
| 1509 | P1 | L | STR regulatory / legal flags by city |
| 1511 | P1 | M | Hybrid unit strategy (some LTR, some STR) |
| 1512 | P1 | M | Owner-occupied unit STR income (house hack STR) |
| 1525 | P0 | S | AirDNA cost-benefit analysis for API adoption |

### SFR Module (all Backlog)
| ID | Priority | Effort | Feature |
|----|----------|--------|---------|
| SFR-001 | P1 | S | Data layer — numUnits:1 + propertyType field |
| SFR-002 | P1 | M | AssumptionsTab adapted for single-family |
| SFR-003 | P1 | S | DealSummaryTab adapted summary card |
| SFR-006 | P1 | M | loanEngine 1-unit down payment tables + USDA |
| SFR-008 | P2 | XS | Update '2–4 unit' copy to inclusive language |

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
| Backlog Excel | `RentHack_Product_Backlog_v15.xlsx` — upload updates to Drive manually |
| Backlog formatter | Run `/home/claude/format_backlog.py` after any Excel backlog update |
| PostHog | Integrated via `src/lib/analytics.js` |
