# PerforMotion Membership Dashboard — Claude Code Handoff

> **For Claude Code:** This document gives you everything you need to work on this project from a cold start. Read it fully before making any changes.

---

## Project Overview

**What it is:** A live membership dashboard for PerforMotion Rehab & Performance Centre, pulling real-time data from the GymMaster gym management API and displaying it through a Netlify-hosted single-page app.

**Who it's for:** Kelly (owner), for daily visibility on member numbers, retention, churn risk, and class occupancy — checked each morning before the workday starts.

**Live URL:** https://playful-kashata-9390c0.netlify.app/
**GitHub Repo:** https://github.com/kelly796/gym-dashboard
**Netlify Site:** playful-kashata-9390c0.netlify.app

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML + JavaScript (no framework) |
| Charts | Chart.js (CDN) |
| Backend | Netlify Serverless Functions (Node.js) |
| Data Source | GymMaster API (https://performotion.gymmasteronline.com/portal/api/v1) |
| Storage | @netlify/blobs v7.3.0 |
| Deployment | Netlify (auto-deploy from main branch) |

---

## Repo Structure

```
gym-dashboard/
├── index.html              # Entire frontend (single file, ~76% of codebase)
├── gymmaster.js            # Netlify function — GymMaster API gateway
├── netlify/
│   └── functions/          # Serverless functions directory
├── netlify.toml            # Build config: publish dir = ".", functions = "netlify/functions"
└── package.json            # Only dependency: @netlify/blobs ^7.3.0
```

**Important:** The project is intentionally minimal. index.html contains all frontend logic including all JavaScript. There is no build step — the root directory is published as-is.

---

## Architecture

### Data Flow
```
Browser
  → loadLiveData()
    → fetch("/.netlify/functions/gymmaster?type=members")
      → gymmaster.js (serverless function)
        → GymMaster API (bearer token auth via GYMMASTER_API_KEY env var)
          → JSON response back through the chain
            → updateMemberMetrics(), renderMembers(), etc.
            ```

            ### Netlify Function (gymmaster.js)
            - Single handler: exports.handler
            - Routes on ?type= query param to different GymMaster endpoints:
              - members → /members
                - memberships → /memberships
                  - cancel → /memberships/cancel
                    - classes → /booking/classes/schedule
                      - settings → /settings
                        - version → /version (health check)
                        - Applies CORS headers on all responses
                        - Returns 500 with error message on failure
                        - Auth: Authorization: Bearer ${process.env.GYMMASTER_API_KEY}

                        ### Environment Variables (set in Netlify dashboard)
                        - GYMMASTER_API_KEY — API key for GymMaster. Never commit this to the repo.

                        ---

                        ## Frontend Structure (index.html)

                        ### Pages / Tabs
                        | Page ID | Tab | Purpose |
                        |---|---|---|
                        | #page-overview | Overview | KPIs, charts, at-risk alerts |
                        | #page-members | Members | Searchable member table + detail panel |
                        | #page-classes | Classes | Weekly AM/PM schedule grid |
                        | #page-revenue | Revenue | Payment trends, overdue items |
                        | #page-cancellations | Cancellations | Churn analysis |

                        Navigation via showPage(name, tab).

                        ### Key Stat Element IDs (Overview page)
                        | ID | What it shows |
                        |---|---|
                        | #stat-active | Current active member count |
                        | #stat-hold | Members on hold |
                        | #stat-signups-mtd | Sign-ups this month |
                        | #stat-lifetime | Average member lifetime |
                        | #stat-retention | Retention rate |
                        | #stat-month-label | Current month label |
                        | #stat-retention-sub | Retention sub-label |

                        ### Membership Type Bars (8 types)
                        Each type has three elements:
                        - #bar-t1 through #bar-t8 — CSS width (visual fill)
                        - #count-t1 through #count-t8 — numeric count
                        - #pct-t1 through #pct-t8 — percentage display

                        ### Members Tab Elements
                        - #memberBody — table body (rows rendered by renderMembers())
                        - #mem-search — search input
                        - #mem-filter-btn — filter: active / hold / all
                        - #mem-active, #mem-hold, #mem-atrisk, #mem-new — metric tiles
                        - #mem-detail — slide-out detail panel
                        - #mem-det-name, #mem-det-status, #mem-det-type — detail fields

                        ### Chart Canvas IDs
                        - #c-signup — sign-up trend
                        - #c-retention — retention trend
                        - #c-revtype — revenue by type
                        - #c-revtrend — revenue trend
                        - #c-canceltrend — cancellation trend
                        - #c-canceltype — cancellation by type

                        ### Core JavaScript Functions
                        | Function | Purpose |
                        |---|---|
                        | loadLiveData() | Main async fetch; called on page load |
                        | updateMemberMetrics(members) | Populates all stat boxes |
                        | loadMembershipCounts() | Fetches and renders membership type bars |
                        | renderMembers(data) | Renders full member table |
                        | renderMemberTable(members) | Renders filtered/searched subset |
                        | filterMembers(q) | Filters by name, type, status |
                        | showMemberDetail(m) | Opens member detail panel |
                        | getMemberRisk(m, now) | Returns HIGH / MED / LOW churn risk |
                        | sendPromo() | Opens mailto with member details |
                        | renderClasses() | Builds AM/PM schedule tables |
                        | makeCell(s) | Generates class cell with booking fill |
                        | buildCharts() | Initialises all Chart.js instances |
                        | showPage(name, tab) | Switches active tab/page |

                        ### Member Data Shape (from API)
                        ```
                        {
                          firstname: string,
                            lastname: string,
                              membership_name: string,
                                status: "active" | "hold" | ...,
                                  join_date: string (date),
                                    last_visit: string (date),
                                      visit_count: number,
                                        cancel_date: string | null
                                        }
                                        ```

                                        ---

                                        ## Design / Styling
                                        - Colour palette: Navy #0f2350, blue gradients, red #c0392b for danger/high-risk states
                                        - Style: Single embedded style block in index.html — no external CSS file
                                        - No framework — plain CSS only

                                        ---

                                        ## Deployment
                                        - Auto-deploys from main branch on Netlify
                                        - Publish directory: . (root)
                                        - Functions directory: netlify/functions
                                        - Security headers set in netlify.toml: X-Frame-Options: DENY, X-Content-Type-Options: nosniff
                                        - No build command required

                                        ---

                                        ## Known Behaviour and Gotchas

                                        1. **Cold start latency:** Netlify functions spin down when idle. First load of the day can be slow (5-10s). The scheduled morning refresh task exists specifically to pre-warm them.
                                        2. **Single file frontend:** All HTML, CSS, and JS lives in index.html. This is intentional — don't split it without checking with Kelly first.
                                        3. **No README in repo** — this handoff document is the primary reference.
                                        4. **GymMaster API key** is environment-only. If the dashboard shows empty data, check the Netlify environment variable is still set correctly.
                                        5. **@netlify/blobs** is installed but may be used for caching — check gymmaster.js for any blob read/write calls before removing it.

                                        ---

                                        ## Automated Monitoring

                                        A scheduled task runs each morning to pre-warm the dashboard and verify data is loading. It checks:
                                        - #stat-active > 0
                                        - At least one membership bar (bar-t1 through bar-t8) showing non-zero width
                                        - #memberBody has at least 1 row

                                        Success = active member count is populated and data is flowing end-to-end.

                                        ---

                                        ## How to Make Changes

                                        1. Clone: git clone https://github.com/kelly796/gym-dashboard
                                        2. Test locally with Netlify CLI: npx netlify dev (requires GYMMASTER_API_KEY in a .env file — never commit .env)
                                        3. All frontend changes go in index.html
                                        4. All API/backend changes go in gymmaster.js or new files under netlify/functions/
                                        5. Push to main → Netlify auto-deploys within ~1 minute

                                        ---

                                        ## Contact / Context

                                        - **Owner:** Kelly Mann — kelly@performotion.net
                                        - **Business:** PerforMotion Rehab & Performance Centre (moving to a new location, currently scaling)
                                        - **Priority:** Dashboard must be reliable each morning. Data accuracy matters more than polish.
