# Apollonious — Complete Implementation Plan

> Full build plan for an Apollo.io clone, based on [walkthrough.md](file:///c:/Users/Admin/Desktop/Apollonious/walkthrough.md)

---

## Context

**Apollonious** is a B2B sales intelligence and engagement platform modeled after Apollo.io. This plan covers **all 3 phases** of the replication blueprint:

| Phase | Focus | Milestones |
|---|---|---|
| **Phase 1 — MVP** | Core platform | 7 milestones (M1–M7) |
| **Phase 2 — Growth** | Expansion features | 6 milestones (M8–M13) |
| **Phase 3 — Full Platform** | AI, automation, enterprise | 9 milestones (M14–M22) |

---

## User Review Required

> [!IMPORTANT]
> **Tech Stack Selection** — Please confirm or adjust before I begin:

| Layer | Choice | Rationale |
|---|---|---|
| **Framework** | **Next.js 14** (App Router) | Full-stack React, API routes, SSR |
| **Language** | **TypeScript** | Type safety across front + back end |
| **Database** | **SQLite via Prisma** (MVP) → **PostgreSQL** (Phase 2+) | Zero-setup locally, easy migration |
| **Auth** | **NextAuth.js** (JWT mode) | Built-in session/token management |
| **Styling** | **Vanilla CSS** with CSS variables design system | Premium dark-mode, per project rules |
| **State** | **React Context + SWR** (MVP) → **Redux** (Phase 2+) | Lightweight first, scale later |
| **Email** | **Nodemailer** | Direct SMTP, full control |
| **Queue** | **In-process scheduler** (MVP) → **BullMQ + Redis** (Phase 2+) | No Redis dependency initially |
| **Search** | **Prisma queries** (MVP) → **Elasticsearch** (Phase 2+) | No infra dependency initially |
| **AI** | **Anthropic Claude API** | Email generation, reply classification |
| **Charts** | **Recharts** | React-native charting library |

> [!WARNING]
> **Phase 1 runs fully local** — no Redis, Elasticsearch, or cloud services required. External dependencies are introduced in Phase 2+ as needed.

---

## UI Design System

- **Theme:** Premium dark-mode SaaS (Apollo.io inspired)
- **Colors:**
  - Backgrounds: `#0f1117` (base), `#1a1d27` (surfaces), `#232738` (elevated)
  - Primary: `#6366f1` (indigo), hover: `#818cf8`
  - Success: `#22c55e` · Warning: `#f59e0b` · Error: `#ef4444` · Info: `#3b82f6`
  - Text: `#e2e8f0` (primary), `#94a3b8` (secondary), `#64748b` (muted)
  - Borders: `#2d3348`
- **Typography:** Inter (Google Font), system fallbacks
- **Radius:** 8px cards, 6px buttons/inputs
- **Effects:** Glassmorphism cards, gradient accents, subtle hover glows, 150ms transitions, skeleton loaders

---

## Project Structure

```
apollonious/
├── prisma/
│   ├── schema.prisma              # Database schema
│   ├── seed.ts                    # Seed data (demo contacts, companies)
│   └── migrations/                # Auto-generated migrations
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx             # Root layout (sidebar + topbar)
│   │   ├── page.tsx               # Dashboard home
│   │   ├── globals.css            # Design system + global styles
│   │   ├── (auth)/                # Auth group (no sidebar)
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── contacts/              # Contact management
│   │   │   ├── page.tsx           # Contact list
│   │   │   └── [id]/page.tsx      # Contact detail
│   │   ├── companies/             # Company management
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── search/page.tsx        # Advanced search
│   │   ├── sequences/             # Outreach sequences
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx      # Sequence builder
│   │   ├── deals/                 # Deal pipeline (Phase 2)
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── plays/page.tsx         # Automation (Phase 3)
│   │   ├── tasks/page.tsx         # Task management (Phase 2)
│   │   ├── analytics/page.tsx     # Analytics dashboard
│   │   ├── settings/              # Settings pages
│   │   │   ├── page.tsx           # General settings
│   │   │   ├── mailboxes/page.tsx # Mailbox management
│   │   │   ├── team/page.tsx      # Team management (Phase 2)
│   │   │   ├── integrations/page.tsx # CRM integrations (Phase 2)
│   │   │   └── billing/page.tsx   # Billing (Phase 3)
│   │   └── api/                   # API routes
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── contacts/          # Contact CRUD
│   │       ├── companies/         # Company CRUD
│   │       ├── sequences/         # Sequence management
│   │       ├── deals/             # Deal management (Phase 2)
│   │       ├── activities/        # Activity logging
│   │       ├── analytics/         # Analytics queries
│   │       ├── track/             # Email tracking endpoints
│   │       ├── plays/             # Automation (Phase 3)
│   │       └── webhooks/          # Webhook system (Phase 2)
│   ├── components/                # Reusable UI components
│   │   ├── layout/                # Sidebar, Topbar, PageHeader
│   │   ├── ui/                    # Button, Modal, Table, Badge, Card, etc.
│   │   ├── forms/                 # Input, Select, TagInput, RichTextEditor
│   │   ├── contacts/              # ContactTable, ContactCard, ImportModal
│   │   ├── sequences/             # SequenceBuilder, StepEditor, TokenPicker
│   │   ├── deals/                 # KanbanBoard, DealCard (Phase 2)
│   │   ├── analytics/             # ChartWidget, MetricCard
│   │   └── common/                # EmptyState, Skeleton, Toast, BulkActionBar
│   ├── lib/                       # Shared utilities
│   │   ├── db.ts                  # Prisma client singleton
│   │   ├── auth.ts                # NextAuth configuration
│   │   ├── email.ts               # Nodemailer helpers
│   │   ├── scheduler.ts           # Sequence execution scheduler
│   │   ├── tracking.ts            # Open/click tracking helpers
│   │   ├── csv.ts                 # CSV parser
│   │   ├── tokens.ts              # Template token rendering
│   │   └── utils.ts               # General helpers
│   └── types/                     # TypeScript definitions
│       ├── contact.ts
│       ├── sequence.ts
│       ├── deal.ts
│       └── activity.ts
├── public/                        # Static assets
│   └── pixel.png                  # 1x1 transparent tracking pixel
├── package.json
├── tsconfig.json
├── next.config.js
└── .env.local                     # Environment variables
```

---

## Database Schema Overview

All schemas follow the [walkthrough Section 6](file:///c:/Users/Admin/Desktop/Apollonious/walkthrough.md). Key models per phase:

### Phase 1 Models
`Organization`, `User`, `Team`, `Contact`, `Company`, `Sequence`, `SequenceStep`, `SequenceEnrollment`, `Activity`, `Mailbox`, `List`, `ContactList` (join), `SavedSearch`

### Phase 2 Additions
`Deal`, `Pipeline`, `DealStage`, `DealContact` (join), `Task`, `Webhook`, `WebhookEvent`, `CustomField`

### Phase 3 Additions
`Play`, `PlayAction`, `PlayExecution`, `AiGeneration`, `CalendarEvent`, `BillingPlan`, `Subscription`, `ApiKey`, `Notification`, `NotificationPreference`, `DataSource`, `DataAcquisitionJob`

---

# PHASE 1 — MVP

> **Goal:** Users can register, import contacts, build email sequences, send tracked emails, and view basic analytics.

---

### Milestone 1: Project Foundation + Auth

**Deliverables:**
- Next.js 14 project with TypeScript, App Router
- Prisma schema with `Organization`, `User`, `Team` models
- CSS design system (dark theme, variables, base components)
- Registration page (creates user + org)
- Login page with JWT auth
- Protected route middleware
- App shell layout (sidebar + topbar)
- Dashboard page (placeholder widgets)

**Key Pages:** `/login`, `/register`, `/` (dashboard)

**API Routes:**
- `POST /api/auth/[...nextauth]` — NextAuth handlers
- `GET /api/auth/session` — Current session

---

### Milestone 2: Contact & Company Management

**Deliverables:**
- Prisma models: `Contact`, `Company`, `List`, `ContactList`
- Contact list page with DataTable (pagination, sorting, column selection)
- Contact detail page (info sidebar, tabs for activities/sequences/notes)
- Create/edit contact modal
- CSV import: upload → parse → preview → validate → bulk insert
- Bulk actions toolbar (delete, add to list, change stage, add tag)
- Contact stages with color badges
- Company list + detail pages
- Auto-associate contacts to companies by email domain
- Seed script with 100+ demo contacts/companies

**Key Pages:** `/contacts`, `/contacts/[id]`, `/companies`, `/companies/[id]`

**API Routes:**
- `GET/POST /api/contacts` — List (paginated/filtered) + Create
- `GET/PUT/DELETE /api/contacts/[id]` — Detail + Update + Delete
- `POST /api/contacts/import` — CSV import
- `POST /api/contacts/bulk` — Bulk operations
- `GET/POST /api/companies` — List + Create
- `GET/PUT/DELETE /api/companies/[id]` — Detail + Update + Delete
- `GET/POST /api/lists` — List management
- `POST /api/lists/[id]/contacts` — Add contacts to list

---

### Milestone 3: Search & Filtering

**Deliverables:**
- Search page with People / Companies tabs
- Left filter panel with 10 filter types:
  1. Job title (text search)
  2. Seniority (multi-select: C-suite, VP, Director, Manager, Senior, Entry)
  3. Department (multi-select)
  4. Company name (text search)
  5. Industry (multi-select)
  6. Employee count (range slider: 1-10, 11-50, 51-200, 201-1000, 1000+)
  7. Location: country, state, city (cascading)
  8. Email status (verified / guessed / unavailable)
  9. Contact stage (multi-select)
  10. Tags (multi-select)
- Filter state in URL (shareable searches)
- Saved searches (save current filters with a name)
- Results table with checkbox select + bulk action bar
- "Save to List" and "Add to Sequence" actions from results

**Key Pages:** `/search`

**API Routes:**
- `POST /api/contacts/search` — Advanced filtered search
- `POST /api/companies/search` — Company search
- `GET/POST /api/saved-searches` — Save / list saved searches

---

### Milestone 4: Email Sequence Builder

**Deliverables:**
- Sequence list page (name, status badge, enrolled count, stats)
- Create sequence modal
- Sequence detail page with **visual step builder**:
  - Vertical timeline UI
  - "Add Step" button → step type selector (Auto Email for MVP)
  - Step editor: subject line + rich text body + personalization token picker
  - Delay configuration between steps (days/hours)
  - Drag-to-reorder steps
  - Step preview with sample contact data
- Contact enrollment:
  - Add contacts from lists or search results
  - View enrolled contacts with status
  - Pause / resume / remove individual enrollments
- Sequence settings:
  - Send window (start hour, end hour, timezone, business days only)
  - Stop on reply
  - Daily send limit
- Sequence status management (draft → active → paused → archived)
- Personalization tokens: `{{first_name}}`, `{{last_name}}`, `{{company}}`, `{{title}}`, `{{city}}`, `{{sender.first_name}}`

**Key Pages:** `/sequences`, `/sequences/[id]`

**API Routes:**
- `GET/POST /api/sequences` — List + Create
- `GET/PUT/DELETE /api/sequences/[id]` — Detail + Update + Delete
- `GET/POST/PUT/DELETE /api/sequences/[id]/steps` — Step CRUD
- `POST /api/sequences/[id]/enroll` — Enroll contacts
- `GET /api/sequences/[id]/enrollments` — List enrollments
- `PUT /api/sequences/[id]/enrollments/[eid]` — Pause/resume

---

### Milestone 5: Mailbox & Email Sending

**Deliverables:**
- Mailbox settings page (`/settings/mailboxes`)
- Add SMTP mailbox form (host, port, username, password, TLS toggle)
- Test connection endpoint
- Daily send limit configuration
- **Sequence Execution Engine** (in-process scheduler):
  - Polls `sequence_enrollments` where `next_step_at <= now()`
  - Renders email template with personalization tokens
  - Sends via Nodemailer
  - Updates enrollment to next step
  - Handles threading (In-Reply-To headers)
  - Enforces send window and rate limits
- **Email Tracking:**
  - Open tracking: inject `<img src="/api/track/open/{id}.png">` in email HTML
  - Click tracking: rewrite URLs to `/api/track/click/{id}?url={original}`
  - Tracking pixel endpoint: logs event, returns 1x1 transparent PNG
  - Click redirect endpoint: logs event, 302 redirects to original URL
- Error handling: retry failed sends (3x), bounce detection, mailbox status flags

**Key Pages:** `/settings/mailboxes`

**API Routes:**
- `GET/POST /api/mailboxes` — List + Add
- `DELETE /api/mailboxes/[id]` — Remove
- `POST /api/mailboxes/test` — Test connection
- `GET /api/track/open/[id].png` — Open tracking pixel
- `GET /api/track/click/[id]` — Click tracking redirect

---

### Milestone 6: Activity Timeline

**Deliverables:**
- Activity model logging all events
- Contact detail page: chronological activity feed with icons per type
- Activity types: `email_sent`, `email_opened`, `email_clicked`, `email_replied`, `contact_created`, `contact_updated`, `stage_changed`, `note_added`, `added_to_sequence`, `added_to_list`
- Filter activities by type
- "Add Note" form on contact detail page
- Activity metadata display (email subject, sequence name, etc.)
- Relative timestamps ("2 hours ago")

**Key Pages:** Contact detail page (activity tab), `/contacts/[id]`

**API Routes:**
- `GET /api/activities?contact_id=x` — List activities for contact
- `POST /api/activities` — Log activity (internal + notes)

---

### Milestone 7: Analytics Dashboard

**Deliverables:**
- Analytics overview page with date range selector
- **KPI Cards** (with trend indicators):
  - Total emails sent
  - Open rate (%)
  - Click rate (%)
  - Reply rate (%)
  - Active sequences
  - Total contacts
- **Line Chart:** Email activity over time (sent, opened, clicked per day)
- **Bar Chart:** Performance by sequence (comparison)
- **Table:** Top-performing sequences (name, enrolled, open rate, reply rate)
- Date range filter (7d, 30d, 90d, custom)

**Key Pages:** `/analytics`

**API Routes:**
- `GET /api/analytics/overview` — Aggregate KPI metrics
- `GET /api/analytics/email-activity` — Time-series data
- `GET /api/analytics/sequences` — Per-sequence performance

---

# PHASE 2 — Growth Features

> **Goal:** Add deal management, multi-channel outreach, advanced search, CRM integrations, and team features.

---

### Milestone 8: Deal Pipeline & Kanban Board

**Deliverables:**
- Prisma models: `Pipeline`, `DealStage`, `Deal`, `DealContact`
- Default pipeline with stages: Discovery → Qualified → Proposal → Negotiation → Won → Lost
- Kanban board view (drag-and-drop deals between stages)
- Deal detail page (amount, contacts, company, activities, notes)
- Create/edit deal modal
- List view toggle
- Deal source tracking
- Pipeline value totals per stage
- Close deal flow (won/lost + reason)

**Key Pages:** `/deals`, `/deals/[id]`

---

### Milestone 9: Multi-Channel Steps & Task System

**Deliverables:**
- New step types: Manual Email, Phone Call, LinkedIn View/Connect/Message, Custom Task
- Task list page (`/tasks`) with My Tasks / Team Tasks tabs
- Task creation from sequence steps
- Task completion flow (mark done, log outcome)
- Call disposition logging (connected, voicemail, no answer)
- Task due dates and overdue indicators

**Key Pages:** `/tasks`

---

### Milestone 10: Advanced Search & Enrichment

**Deliverables:**
- Migrate to PostgreSQL + optional Elasticsearch
- 15+ filter fields (add: technology, revenue, founded year, buying intent, hiring signals)
- Saved search improvements (auto-run, notifications on new matches)
- **Data Enrichment module:**
  - Manual enrich button (per contact or bulk)
  - Enrichment API integration (Clearbit/similar or mock)
  - Enrichment status tracking
  - Credit system (per-org credit balance)

**Key Pages:** `/search` (enhanced), `/settings/enrichment`

---

### Milestone 11: CRM Integrations

**Deliverables:**
- Integration settings page
- **Salesforce connector:**
  - OAuth 2.0 authentication flow
  - Object mapping config UI (Contact → Lead, Company → Account, Deal → Opportunity)
  - Bi-directional sync engine
  - Field mapping configuration
  - Sync status dashboard with error logs
- **HubSpot connector** (same pattern)
- Conflict resolution settings (last-write-wins vs manual)
- Sync history + error log view

**Key Pages:** `/settings/integrations`, `/settings/integrations/salesforce`, `/settings/integrations/hubspot`

---

### Milestone 12: Team Management & RBAC

**Deliverables:**
- Team settings page (`/settings/team`)
- Invite user flow (email invite link)
- Role management: Admin, Manager, Member
- Permission enforcement on API routes
- Visibility rules: own data vs team vs org
- Team member list with role badges
- Transfer ownership of contacts/deals

**Key Pages:** `/settings/team`

---

### Milestone 13: A/B Testing, Custom Fields, Webhooks, Saved Lists

**Deliverables:**
- **A/B Testing:** Add variant B to email steps, auto-split enrolled contacts, report winner based on open/reply rate
- **Custom Fields:** Define custom fields per org, render dynamically on contact/company/deal forms, use in personalization tokens
- **Webhook System:**
  - Webhook subscription management UI
  - Event types: contact.created, contact.updated, email.sent, email.opened, email.replied, email.bounced, deal.created, deal.stage_changed
  - HMAC signature verification
  - Delivery retry with exponential backoff
  - Webhook delivery log
- **Saved Lists:** Improved list management, dynamic lists (auto-populate from saved search), static lists (manual add)

**Key Pages:** `/settings/webhooks`, `/settings/custom-fields`

---

# PHASE 3 — Full Platform

> **Goal:** AI features, automation engine, enterprise security, Chrome extension, billing.

---

### Milestone 14: AI Email Writer & Reply Classification

**Deliverables:**
- Anthropic Claude API integration
- "Generate with AI" button in sequence step editor:
  - Collect context: prospect data, company signals, step position
  - Send to Claude with sales email system prompt
  - Return subject + body, user edits + approves
- Subject line suggestions (generate 3–5 options)
- **Reply Classification:**
  - Incoming reply detected → classify via LLM
  - Categories: Interested, Not Interested, OOO, Bounce, Objection, Referral
  - Auto-update contact stage based on classification
  - Suggest follow-up response

**Key Pages:** Sequence builder (AI button), Contact detail (reply classification)

---

### Milestone 15: Plays — Automation Engine

**Deliverables:**
- Prisma models: `Play`, `PlayAction`, `PlayExecution`
- Plays list page (`/plays`)
- Play builder UI:
  - **Trigger selection:** contact added to list, stage changed, email opened 3+ times, email replied, deal created, lead score threshold, job change detected
  - **Condition builder:** if/then filters on contact/company fields
  - **Action configuration:** add to sequence, update stage, add tag, create task, send notification, assign owner, push to CRM
- Play execution engine (event-driven):
  - Listen for trigger events
  - Evaluate conditions
  - Execute actions in order
  - Log execution results
- Play analytics: executions over time, success/failure rate

**Key Pages:** `/plays`, `/plays/[id]`

---

### Milestone 16: Advanced Analytics & Custom Dashboards

**Deliverables:**
- Custom dashboard builder:
  - Add/remove/reorder widgets
  - Widget types: KPI card, line chart, bar chart, funnel, table, heatmap
  - Widget data source configuration
- Pre-built dashboards: Email Performance, Pipeline, Team Activity
- **Pipeline Analytics:** funnel chart, win rate, avg deal size, sales velocity
- **Team Analytics:** leaderboard, per-rep metrics, activity comparison
- **Deliverability Dashboard:** bounce rate, spam complaints, domain health
- Scheduled email reports (weekly summary)
- Export to CSV/PDF

**Key Pages:** `/analytics` (enhanced), `/analytics/pipeline`, `/analytics/team`

---

### Milestone 17: Chrome Extension

**Deliverables:**
- Chrome extension (Manifest V3):
  - **LinkedIn content script:** detect profile → show sidebar with Apollo data
  - **Gmail content script:** add tracking/sequence buttons
  - **Popup UI:** quick search, recent activities
- Extension API endpoints:
  - Lookup contact by LinkedIn URL or email
  - One-click "Add to Sequence"
  - Reveal contact info (email, phone) — deducts credits
- OAuth authentication flow (extension ↔ main app)
- Build pipeline + Chrome Web Store deployment config

**Output:** Separate `/extension` directory in project root

---

### Milestone 18: Calendar, Deliverability, Public API

**Deliverables:**
- **Calendar Integration:**
  - Google Calendar OAuth connection
  - Meeting scheduler: generate booking links, available slots
  - Round-robin assignment for team scheduling
  - Auto-log meetings as activities
- **Deliverability Tools:**
  - SPF/DKIM/DMARC setup wizard
  - Custom tracking domain configuration (CNAME validation)
  - Email warmup scheduler (gradual send increase for new mailboxes)
  - Spam score checker (pre-send content analysis)
- **Public REST API:**
  - API key management (standard + master keys, `/settings/api`)
  - Rate limiting (100 req/5min standard, 500 req/5min master)
  - Full CRUD for contacts, companies, sequences, deals
  - Enrichment endpoint
  - API documentation page (auto-generated from schemas)

**Key Pages:** `/settings/calendar`, `/settings/deliverability`, `/settings/api`

---

### Milestone 19: SSO, Billing & Enterprise

**Deliverables:**
- **SSO:** SAML 2.0 integration for enterprise orgs
- **MFA:** TOTP-based two-factor authentication setup
- **Billing & Subscriptions:**
  - Plan tiers: Free, Basic, Professional, Organization, Enterprise
  - Stripe integration for payment processing
  - Credit system for enrichment
  - Usage tracking dashboard
  - Upgrade/downgrade flows
- **Data Privacy:**
  - GDPR data export (full contact data as JSON/CSV)
  - Right-to-deletion (cascade delete with confirmation)
  - Consent tracking + suppression list management
  - Audit log for admin actions
- **Enterprise Features:**
  - Custom data retention policies
  - Dedicated support settings
  - White-label options

**Key Pages:** `/settings/security`, `/settings/billing`, `/settings/privacy`

---

### Milestone 20: Real-Time Notifications

**Deliverables:**
- Prisma models: `Notification`, `NotificationPreference`
- **WebSocket integration (Socket.io):**
  - Real-time event push to connected clients
  - Auto-reconnect with exponential backoff
  - Room-based isolation per org/user
- **Notification bell** in top bar:
  - Unread count badge
  - Dropdown panel with notification list
  - Mark as read / mark all as read
  - Click to navigate to related resource
- **Notification types:**
  - `email_replied` — "John Smith replied to your email"
  - `email_opened` — "Jane Doe opened your email (3x)"
  - `link_clicked` — "Prospect clicked pricing link"
  - `task_due` — "Call task due in 30 minutes"
  - `sequence_finished` — "Sequence 'Q1 Outbound' completed"
  - `deal_stage_changed` — "Deal moved to Negotiation"
  - `credit_low` — "Only 50 enrichment credits remaining"
  - `play_executed` — "Play 'Hot Lead Fast Track' triggered"
- **Notification preferences page** (`/settings/notifications`):
  - Per-type enable/disable toggles
  - Channel selection per type (in-app, email digest, browser push)
  - Quiet hours configuration (start time, end time, timezone)
- **Browser push notifications** (Web Push API):
  - Service worker registration
  - Permission request flow
  - Push delivery for critical events (replies, task due)
- **Email digest:**
  - Daily or weekly summary email
  - Configurable schedule
  - Template with activity highlights
- **Internal event bus:**
  - Redis Pub/Sub or in-process EventEmitter
  - All system events published to bus
  - Notification service subscribes and routes to channels

**Key Pages:** `/settings/notifications`, notification bell (global component)

**API Routes:**
- `GET /api/notifications` — List notifications (paginated)
- `PUT /api/notifications/read` — Mark as read
- `GET /api/notifications/preferences` — Get preferences
- `PUT /api/notifications/preferences` — Update preferences
- `POST /api/notifications/push-subscribe` — Register push subscription

---

### Milestone 21: AI Copilots

**Deliverables:**
- Expand AI layer beyond email writing to include 4 copilot systems:

- **Inbox Copilot:**
  - Auto-classify all incoming replies (interested / not interested / OOO / bounce / objection / referral)
  - Draft suggested reply based on full thread context + prospect data
  - Extract action items from replies (e.g., "Call back Thursday", "Send pricing")
  - One-click accept suggested reply or edit before sending
  - Reply sentiment analysis with visual indicator

- **Pipeline Copilot:**
  - Predict deal close probability using historical win/loss patterns
  - "Next Best Action" suggestions per deal (follow up, send proposal, schedule meeting)
  - At-risk deal detection: flag deals stalled for N days with no activity
  - Deal velocity insights: average days per stage vs current deal
  - Weekly pipeline health summary

- **Prospecting Copilot:**
  - ICP (Ideal Customer Profile) builder: analyze closed-won deals → extract common traits
  - Lookalike audience recommendations: "Contacts similar to your best customers"
  - Buying intent signal aggregation: hiring, funding, tech stack changes
  - Smart list suggestions: auto-generate prospect lists based on ICP
  - "Who to contact next" daily recommendations

- **Coaching Copilot:**
  - Analyze email performance patterns per rep (best send times, subject line styles)
  - Suggest improvements: "Your emails with questions in subject lines get 2x replies"
  - Compare rep metrics to team benchmarks with visualizations
  - Sequence optimization: "Step 3 has 45% drop-off — consider shortening delay"
  - Weekly coaching digest email to managers

- **Copilot UI Components:**
  - Floating copilot panel (slide-in from right side)
  - Copilot suggestions inline on contact detail, deal detail, and sequence pages
  - "Ask Copilot" input for freeform questions about contacts/deals/pipeline
  - Copilot insights cards on dashboard home page

**Key Pages:** Copilot panel (global), `/` (dashboard insights), contact detail, deal detail, sequence detail

**API Routes:**
- `POST /api/ai/classify-reply` — Classify incoming reply
- `POST /api/ai/suggest-reply` — Generate reply suggestion
- `POST /api/ai/deal-prediction` — Predict deal outcome
- `POST /api/ai/next-action` — Suggest next best action
- `GET /api/ai/icp-analysis` — ICP trait analysis
- `GET /api/ai/lookalikes` — Lookalike contact recommendations
- `GET /api/ai/coaching/:userId` — Rep coaching insights
- `POST /api/ai/ask` — Freeform copilot question

---

### Milestone 22: Data Acquisition Strategy & Command Palette

**Deliverables:**

- **Data Acquisition Pipeline:**
  - Prisma models: `DataSource`, `DataAcquisitionJob`
  - Data source management UI (`/settings/data-sources`)
  - **Licensed Data Integration:**
    - Connect to B2B data provider APIs (Clearbit, ZoomInfo, or similar)
    - Bulk import from partner data feeds
    - Aggregated business registry ingestion
  - **User-Contributed Data:**
    - Contacts imported by users tagged with source
    - Crowdsourced email verification: track send results (delivered/bounced) across org
    - Engagement signals feed back into data quality scores
  - **Public Data Collection:**
    - Company website scraper (about pages, team pages) — ethical, robots.txt compliant
    - Job posting aggregator (hiring signals → company growth detection)
    - Press release / funding announcement monitor
    - Social profile enrichment from public LinkedIn data
  - **Verification Pipeline:**
    - SMTP validation (check mailbox exists without sending)
    - MX record verification
    - Catch-all domain detection
    - Disposable email address detection
    - Phone number carrier lookup + validation
  - **Data Quality Dashboard:**
    - Overall data health score per org
    - Stale contact detection (not enriched in 90+ days)
    - Duplicate contact detection + merge tool
    - Enrichment coverage stats (% contacts with email, phone, etc.)
  - **Legal & Ethical Compliance:**
    - Respect robots.txt on all scraped sources
    - Honor opt-out and suppression lists
    - GDPR lawful basis tracking (legitimate interest)
    - Data retention policies (auto-purge stale records)
    - Audit log for all data acquisition activities

- **Command Palette (Cmd+K / Ctrl+K):**
  - Global keyboard shortcut to open
  - **Quick Search:** search contacts, companies, deals, sequences by name
  - **Quick Actions:**
    - "Create Contact"
    - "Create Sequence"
    - "Create Deal"
    - "Import CSV"
    - "Open Settings"
  - **Navigation:** type page name to navigate instantly
  - Recent items list (last 5 visited contacts/sequences/deals)
  - Fuzzy matching with highlighted results
  - Keyboard navigation (arrow keys + enter)
  - Extensible action registry (plugins can register commands)

**Key Pages:** `/settings/data-sources`, `/settings/data-quality`, Command palette (global overlay)

**API Routes:**
- `GET/POST /api/data-sources` — Manage data sources
- `POST /api/data-sources/[id]/run` — Trigger acquisition job
- `GET /api/data-quality` — Data health metrics
- `POST /api/contacts/deduplicate` — Find + merge duplicates
- `POST /api/contacts/verify` — Run email/phone verification
- `GET /api/command-palette/search?q=x` — Global search endpoint

---

## Verification Plan

### Per-Milestone Checks
- `npm run build` passes (no TypeScript errors)
- Dev server renders all pages without errors
- API routes return correct data with sample payloads
- Browser walkthrough of primary user flows

### Phase 1 Verification
- Register → login → see dashboard
- Import CSV → contacts appear in table → detail page works
- Search with 3+ filters → correct results
- Create sequence → add 3 email steps → enroll contacts → sequence runs
- Connect SMTP mailbox → send test email → tracking events logged
- Analytics dashboard shows metrics from sample data

### Phase 2 Verification
- Create deal → drag through pipeline stages → close deal
- Multi-channel sequence → tasks created for manual steps
- CRM sync: mock Salesforce/HubSpot round-trip
- RBAC: member cannot access admin settings

### Phase 3 Verification
- AI generates email → user edits → saves to step
- Play triggers on stage change → executes actions
- Chrome extension loads → shows contact data on LinkedIn
- Billing: upgrade plan → credits increase → features unlock

---

## Open Questions

> [!IMPORTANT]
> 1. **Database**: Should we use **SQLite** (zero-setup) or do you have **PostgreSQL** installed?
> 2. **Email testing**: Do you have an SMTP account for testing (Gmail app password, Mailtrap, etc.)? We can mock email sending if not.
> 3. **AI API key**: Do you have an Anthropic or OpenAI API key for Phase 3's AI features?
> 4. **Ready to proceed?** If the plan looks good, I'll start building from Milestone 1.

