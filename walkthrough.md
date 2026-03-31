# Apollo.io — Reverse-Engineered System Specification

> **Document Type:** Developer-Ready System Walkthrough
> **Platform:** AI-Powered Sales Intelligence + Engagement SaaS
> **Purpose:** Full replication blueprint for engineers, designers, and AI agents

---

## 1. 🧭 Product Overview

### 1.1 What the Platform Does

Apollo.io is a unified, AI-powered B2B sales intelligence and engagement platform that combines:

- A massive B2B contact/company database (275M+ contacts, 73M+ companies)
- Multi-channel outreach automation (email, phone, LinkedIn)
- Lightweight CRM with pipeline/deal management
- AI-assisted content generation and lead prioritization
- Real-time analytics and reporting dashboards
- Workflow automation engine ("Plays")

### 1.2 Core Value Proposition

Eliminate the need for 5–7 separate sales tools by providing a single platform that handles prospecting, enrichment, outreach, tracking, and pipeline management — all enhanced by AI.

### 1.3 Target Users

| Persona | Use Case |
|---|---|
| SDRs / BDRs | Prospecting, cold outreach sequences, call tasks |
| Account Executives | Pipeline management, deal tracking, follow-ups |
| Sales Leaders / VPs | Team analytics, forecasting, coaching |
| Founders / Solopreneurs | Self-serve lead gen, automated outbound |
| RevOps / Marketing | Data enrichment, list building, CRM sync |

### 1.4 Key Modules

1. **Search** — Lead database with advanced filters
2. **Engage** — Sequence builder, email/call/LinkedIn outreach
3. **Plays** — Trigger-based workflow automation
4. **CRM** — Deal pipeline, contact/account management
5. **Enrich** — Data enrichment engine
6. **Analytics** — Reporting dashboards and performance metrics
7. **Settings** — Integrations, mailboxes, team management

---

## 2. 🏗️ System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ React SPA│  │Chrome Extension│ │  Mobile (PWA)    │ │
│  └────┬─────┘  └──────┬───────┘  └────────┬──────────┘ │
└───────┼───────────────┼────────────────────┼────────────┘
        │               │                    │
┌───────▼───────────────▼────────────────────▼────────────┐
│                   API GATEWAY (NGINX)                    │
│              Rate Limiting / Auth / Routing              │
└───────┬───────────────┬────────────────────┬────────────┘
        │               │                    │
┌───────▼────┐  ┌───────▼────┐  ┌────────────▼───────────┐
│ Core API   │  │ Search API │  │  Outreach Engine       │
│ (Rails)    │  │(Elasticsearch│ │  (Background Workers)  │
│            │  │ + API)     │  │  Sidekiq / Bull         │
└───────┬────┘  └───────┬────┘  └────────────┬───────────┘
        │               │                    │
┌───────▼───────────────▼────────────────────▼────────────┐
│                   DATA LAYER                             │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │PostgreSQL│  │Elasticsearch │  │  Redis             │  │
│  │(Primary) │  │(Search Index)│  │  (Cache/Queues)    │  │
│  └──────────┘  └──────────────┘  └───────────────────┘  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ S3       │  │ ClickHouse   │  │  MongoDB           │  │
│  │(Storage) │  │(Analytics)   │  │  (Activity Logs)   │  │
│  └──────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────┘
        │
┌───────▼─────────────────────────────────────────────────┐
│               EXTERNAL SERVICES                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐ ┌──────────┐ │
│  │Gmail API │  │Salesforce│  │ HubSpot  │ │Anthropic │ │
│  │SMTP/IMAP │  │  API     │  │   API    │ │Claude AI │ │
│  └──────────┘  └──────────┘  └──────────┘ └──────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Suggested Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React 18 + Redux + TypeScript | Component-based SPA, state management |
| **Styling** | Sass / CSS Modules | Scoped styles, design system |
| **Build** | Webpack / Vite | Module bundling, HMR |
| **Backend API** | Ruby on Rails / Node.js | Rapid development, REST APIs |
| **Search Engine** | Elasticsearch 8.x | Full-text search, faceted filtering |
| **Primary DB** | PostgreSQL 15 | Relational data, ACID compliance |
| **Cache/Queue** | Redis 7 | Session cache, job queues, rate limiting |
| **Job Processing** | Sidekiq (Rails) / BullMQ (Node) | Background email sending, enrichment |
| **Analytics DB** | ClickHouse / TimescaleDB | Time-series analytics, event tracking |
| **Object Storage** | AWS S3 | Attachments, CSV exports |
| **AI/ML** | Anthropic Claude API / OpenAI | Email generation, lead scoring |
| **Infrastructure** | AWS (EKS/Kubernetes) | Container orchestration |
| **IaC** | Terraform + Ansible | Infrastructure provisioning |
| **CI/CD** | GitHub Actions / Jenkins | Automated deployment |
| **Testing** | Jest + Cypress + Selenium | Unit, integration, E2E |
| **Monitoring** | Datadog / Prometheus + Grafana | Observability |

### 2.3 Architecture Decision: Modular Monolith → Microservices

**Recommended approach:** Start with a **modular monolith** (Rails or Node) with clear domain boundaries, then extract into microservices as scale demands.

| Service Domain | Responsibility |
|---|---|
| `core-api` | Auth, users, teams, billing |
| `search-service` | Contact/company search, filters |
| `enrichment-service` | Data enrichment pipeline |
| `outreach-engine` | Sequence execution, email sending |
| `analytics-service` | Event ingestion, reporting |
| `integration-service` | CRM sync, webhooks |
| `ai-service` | LLM orchestration, scoring |

---

## 3. 🧱 Core Modules (Detailed)

### 3.1 Lead Database & Search

#### 3.1.1 Search Filters

| Filter Category | Fields |
|---|---|
| **Person Filters** | Job title, seniority level, department, management level |
| **Company Filters** | Industry, employee count, revenue range, founded year |
| **Location** | Country, state, city, region, postal code |
| **Technology** | Tech stack used (e.g., Salesforce, AWS, React) |
| **Contact Info** | Email status (verified/guessed/unavailable), phone availability |
| **Buying Intent** | Intent topics, intent score threshold |
| **Engagement** | Lists membership, sequence enrollment status |
| **Custom** | Tags, custom fields, CRM sync status |

#### 3.1.2 Data Points Per Contact

```
Contact Record:
├── Personal Info
│   ├── first_name, last_name
│   ├── title, seniority, department
│   ├── linkedin_url, twitter_url
│   └── city, state, country
├── Contact Info
│   ├── email (verified | guessed | unavailable)
│   ├── phone_direct, phone_mobile, phone_hq
│   └── email_status, email_confidence_score
├── Company Association
│   ├── company_name, company_domain
│   ├── company_industry, company_size
│   └── company_revenue, company_linkedin
└── Metadata
    ├── enrichment_status, last_enriched_at
    ├── source, created_at, updated_at
    └── lists[], tags[], custom_fields{}
```

#### 3.1.3 Enrichment System

```
Enrichment Pipeline:
1. Input: email OR (name + company_domain)
2. Internal DB lookup (275M+ records)
3. Third-party data provider waterfall:
   ├── Provider A (e.g., Clearbit)
   ├── Provider B (e.g., ZoomInfo data partnerships)
   └── Provider C (e.g., web scraping pipeline)
4. Email verification (SMTP check, MX validation)
5. Phone verification (carrier lookup)
6. Confidence scoring (0-100)
7. Result merge + deduplication
8. Store enriched record
9. Trigger webhooks / CRM sync
```

#### 3.1.4 Search Indexing Logic

- **Index:** Elasticsearch with denormalized contact+company documents
- **Mapping:** Keyword fields for filters, text fields for search
- **Update Strategy:** Near real-time indexing via change-data-capture (CDC) from PostgreSQL
- **Query:** Boolean queries with filter context for performance
- **Pagination:** Search-after cursor-based pagination (not offset)
- **Caching:** Redis cache for frequently-used saved searches

---

### 3.2 Outreach System

#### 3.2.1 Email Sequences

A **Sequence** is an ordered collection of **Steps**, each representing an outreach touchpoint.

```
Sequence:
├── name, status (draft | active | paused | archived)
├── settings
│   ├── send_as_reply_to_previous (thread emails)
│   ├── stop_on_reply (true/false)
│   ├── stop_on_meeting_booked (true/false)
│   ├── exclude_bounced_contacts
│   ├── daily_send_limit
│   └── send_window (start_hour, end_hour, timezone, days[])
├── steps[]
│   ├── step_number (1, 2, 3...)
│   ├── step_type (auto_email | manual_email | phone_call | linkedin_task | custom_task)
│   ├── delay_days (wait N days after previous step)
│   ├── delay_hours
│   ├── subject_line (supports {{variables}})
│   ├── body_html (supports {{variables}})
│   ├── ab_variants[] (for A/B testing)
│   └── priority
└── contacts_enrolled[]
    ├── contact_id
    ├── current_step
    ├── status (active | paused | finished | replied | bounced)
    └── enrolled_at, finished_at
```

#### 3.2.2 Personalization Tokens

| Token | Description |
|---|---|
| `{{first_name}}` | Contact's first name |
| `{{last_name}}` | Contact's last name |
| `{{company}}` | Company name |
| `{{title}}` | Job title |
| `{{city}}` | Location city |
| `{{custom.field_name}}` | Custom field value |
| `{{sender.first_name}}` | Sending user's first name |
| `{{unsubscribe_link}}` | Auto-generated opt-out link |

#### 3.2.3 Multi-Channel Step Types

| Step Type | Execution | Description |
|---|---|---|
| **Auto Email** | Automated | Sent automatically when schedule triggers |
| **Manual Email** | Task-based | Creates a task for user to review and send |
| **Phone Call** | Task-based | Creates call task with script, logs disposition |
| **LinkedIn View** | Task-based | Prompt to view prospect's LinkedIn profile |
| **LinkedIn Connect** | Task-based | Prompt to send connection request |
| **LinkedIn Message** | Task-based | Prompt to send InMail or message |
| **Custom Task** | Task-based | Any custom action (e.g., "research company") |

#### 3.2.4 AI Email Generation

```
AI Email Generation Flow:
1. User selects "Generate with AI"
2. System collects context:
   ├── Prospect data (name, title, company, industry)
   ├── Company signals (funding, hiring, tech stack)
   ├── Sequence context (step number, previous steps)
   └── User prompt / instructions
3. LLM call (Anthropic Claude):
   ├── System prompt: sales email best practices
   ├── Context injection: prospect data + signals
   └── User instructions: tone, CTA, length
4. Response: generated subject + body
5. User reviews, edits, approves
6. Saved as step template
```

---

### 3.3 CRM / Pipeline

#### 3.3.1 Deal Stages (Default)

| Stage | Type | Description |
|---|---|---|
| Discovery | Open | Initial qualification |
| Qualified | Open | Budget, authority, need confirmed |
| Proposal Sent | Open | Proposal/quote delivered |
| Negotiation | Open | Terms being discussed |
| Closed Won | Closed | Deal successfully closed |
| Closed Lost | Closed | Deal lost to competitor or no-decision |

Custom stages are fully configurable per organization.

#### 3.3.2 Contact Stages

Default contact lifecycle stages:

| Stage | Description |
|---|---|
| Cold | No outreach attempted |
| Approaching | Outreach initiated |
| Replied | Contact has responded |
| Interested | Positive response, engaged |
| Not Interested | Negative response |
| Do Not Contact | Opted out or restricted |
| Follow Up | Requires future re-engagement |

#### 3.3.3 Activity Timeline

Every contact/deal maintains a chronological activity feed:

```
Activity Types:
├── email_sent, email_opened, email_clicked, email_replied, email_bounced
├── call_made, call_answered, call_voicemail, call_no_answer
├── linkedin_viewed, linkedin_connected, linkedin_messaged
├── task_created, task_completed
├── note_added
├── stage_changed
├── deal_created, deal_updated, deal_closed
├── meeting_booked, meeting_completed
└── enrichment_completed
```

#### 3.3.4 Deal Record Structure

```
Deal:
├── id, name
├── amount, currency (ISO 4217)
├── stage_id, pipeline_id
├── probability (0-100%)
├── expected_close_date
├── owner_id (assigned user)
├── contact_ids[] (associated contacts)
├── company_id (associated account)
├── source (inbound | outbound | referral)
├── notes, tags[]
├── custom_fields{}
├── activities[] (timeline)
├── created_at, updated_at, closed_at
└── crm_sync_status, external_crm_id
```

---

### 3.4 Automation Engine ("Plays")

#### 3.4.1 Play Structure

```
Play:
├── name, description, status (active | paused)
├── trigger
│   ├── type: (contact_added_to_list | contact_stage_changed |
│   │          email_opened | email_replied | email_bounced |
│   │          deal_created | deal_stage_changed |
│   │          form_submitted | csv_uploaded |
│   │          job_change_detected | new_contact_matched)
│   └── conditions[] (filter criteria that must be met)
├── actions[]
│   ├── action_type:
│   │   ├── add_to_sequence
│   │   ├── remove_from_sequence
│   │   ├── update_contact_stage
│   │   ├── add_tag
│   │   ├── remove_tag
│   │   ├── create_task
│   │   ├── send_notification
│   │   ├── update_field
│   │   ├── add_to_list
│   │   ├── assign_owner
│   │   └── push_to_crm
│   └── action_config{} (parameters for each action)
└── execution_log[] (audit trail)
```

#### 3.4.2 Lead Scoring Model

```
Lead Score Calculation:
├── Demographic Score (0-50 pts)
│   ├── Title match to ICP: +10-20
│   ├── Seniority level: +5-15
│   ├── Department match: +5-10
│   └── Location match: +5
├── Firmographic Score (0-30 pts)
│   ├── Company size match: +10
│   ├── Industry match: +10
│   └── Revenue range match: +10
├── Behavioral Score (0-50 pts)
│   ├── Email opened: +2 each
│   ├── Email clicked: +5 each
│   ├── Email replied: +15
│   ├── Website visited: +5 each
│   └── Meeting booked: +25
├── Intent Score (0-20 pts)
│   └── Buying intent signals: +5-20
└── Total Score: 0-150 → mapped to Hot/Warm/Cold
```

#### 3.4.3 Behavioral Triggers

| Trigger | Condition | Typical Action |
|---|---|---|
| Email Opened 3+ times | `email_opens >= 3` | Create priority call task |
| Link Clicked | `link_clicked = true` | Move to "Interested" stage |
| Reply Received | `reply_detected = true` | Pause sequence, notify owner |
| Bounced Email | `bounce_type = hard` | Flag contact, remove from sequences |
| Job Change | `job_change = true` | Re-enrich, add to re-engagement sequence |
| Meeting Booked | `meeting_status = booked` | Create deal, update stage |

---

### 3.5 AI Layer

#### 3.5.1 AI Capabilities

| Feature | Model | Input | Output |
|---|---|---|---|
| Email Writer | Claude / GPT-4 | Prospect data + prompt | Personalized email draft |
| Subject Line Generator | Claude / GPT-4 | Email body + context | 3-5 subject line options |
| Follow-up Suggestions | Claude / GPT-4 | Thread history + signals | Next-step recommendation |
| Lead Prioritization | Custom ML | Demographic + behavioral data | Score + ranking |
| Reply Classification | NLP classifier | Incoming reply text | interested / not_interested / OOO / bounce |
| ICP Recommendations | Collaborative filtering | Closed-won deal patterns | Lookalike contact suggestions |

#### 3.5.2 AI Email Generation Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  User Input  │────▶│  Context     │────▶│  LLM API     │
│  (prompt,    │     │  Assembly    │     │  (Claude)    │
│   tone, CTA) │     │  + Prospect  │     │              │
└──────────────┘     │  Data Fetch  │     └──────┬───────┘
                     └──────────────┘            │
                                          ┌──────▼───────┐
                                          │  Post-Process│
                                          │  - Token     │
                                          │    insertion │
                                          │  - Compliance│
                                          │    check     │
                                          │  - Spam      │
                                          │    scoring   │
                                          └──────┬───────┘
                                          ┌──────▼───────┐
                                          │  User Review │
                                          │  + Edit      │
                                          │  + Approve   │
                                          └──────────────┘
```

---

### 3.6 Analytics Dashboard

#### 3.6.1 Core Metrics

| Metric Category | Metrics Tracked |
|---|---|
| **Email Performance** | Sent, delivered, opened, clicked, replied, bounced, unsubscribed |
| **Sequence Performance** | Enrolled, active, finished, replied, meetings booked per sequence |
| **Call Metrics** | Calls made, connected, voicemail, average duration, calls to connect |
| **Pipeline** | Deals created, pipeline value, win rate, avg deal size, velocity |
| **Activity** | Emails/day, calls/day, tasks completed, touches per contact |
| **Deliverability** | Bounce rate, spam complaints, domain health score |
| **Team** | Leaderboard, per-rep metrics, quota attainment |

#### 3.6.2 Dashboard Widget Types

- **KPI Cards** — Single metric with trend indicator
- **Line Charts** — Time-series performance
- **Bar Charts** — Comparative metrics (by rep, by sequence)
- **Funnel Charts** — Conversion through stages
- **Tables** — Detailed breakdowns with sorting/filtering
- **Heatmaps** — Best send times
- **Kanban** — Deal pipeline view

#### 3.6.3 Tracking Implementation

```
Email Tracking:
├── Open Tracking: 1x1 invisible tracking pixel (unique per recipient)
│   └── GET /track/open/{tracking_id}.png → log event → return pixel
├── Click Tracking: URL rewriting through tracking domain
│   └── GET /track/click/{tracking_id}?url={original} → log event → 302 redirect
├── Reply Detection: IMAP/webhook monitoring of connected mailbox
│   └── Match incoming email thread_id to outbound message_id
└── Bounce Detection: SMTP bounce-back parsing + webhook from ESP
    └── Parse DSN (Delivery Status Notification) for bounce type
```

---

## 4. 🔄 User Flows

### Flow 1: Lead Prospecting

```
Step 1: Navigate to Search → People
Step 2: Apply filters:
        ├── Title: "VP of Sales"
        ├── Company Size: 50-200
        ├── Industry: "SaaS"
        └── Location: "United States"
Step 3: Review results (25 per page)
Step 4: Select contacts (checkbox) or "Select All"
Step 5: Action menu:
        ├── "Save to List" → select/create list
        ├── "Add to Sequence" → select sequence
        ├── "Export to CSV"
        ├── "Enrich Contacts"
        └── "Push to CRM"
Step 6: Save search for re-use
Step 7: Configure alerts for new matches
```

### Flow 2: Outreach Campaign

```
Step 1: Navigate to Engage → Sequences → "Create Sequence"
Step 2: Choose creation method:
        ├── AI-Generated (provide goal + persona)
        ├── Template (browse library)
        ├── Clone existing
        └── Start from scratch
Step 3: Add Steps:
        ├── Step 1: Auto Email (Day 0) — subject + body
        ├── Step 2: Auto Email (Day 3) — follow-up
        ├── Step 3: Phone Call (Day 5) — call script
        ├── Step 4: LinkedIn Connect (Day 6)
        └── Step 5: Auto Email (Day 8) — breakup email
Step 4: Configure settings:
        ├── Send window: Mon-Fri, 8AM-6PM EST
        ├── Daily send limit: 50
        ├── Stop on reply: Yes
        └── Track opens/clicks: Yes
Step 5: A/B test setup (optional):
        └── Variant A vs Variant B subject lines
Step 6: Add contacts:
        ├── From saved list
        ├── From search results
        └── CSV import
Step 7: Review → Activate sequence
Step 8: Monitor in Analytics → Sequence Report
```

### Flow 3: Deal Management

```
Step 1: Contact replies with interest → reply detected
Step 2: Auto-stage update: "Replied" → "Interested"
Step 3: User creates Deal:
        ├── Deal name, amount, expected close
        ├── Associate contact + company
        └── Assign pipeline + stage
Step 4: Deal moves through stages:
        ├── Discovery → Qualified → Proposal → Negotiation
        └── Drag-and-drop on Kanban board
Step 5: Log activities:
        ├── Notes, calls, meetings
        └── Auto-logged emails from sequences
Step 6: Close deal:
        ├── "Closed Won" → update revenue metrics
        └── "Closed Lost" → tag reason, feed ML model
Step 7: Sync to CRM (Salesforce/HubSpot)
```

### Flow 4: Automation (Play) Execution

```
Step 1: Create Play:
        ├── Name: "Hot Lead Fast Track"
        └── Description: "Auto-sequence for leads scoring 100+"
Step 2: Define Trigger:
        ├── Type: "Lead score threshold reached"
        └── Condition: score >= 100
Step 3: Define Actions:
        ├── Action 1: Add to "Hot Lead Sequence"
        ├── Action 2: Create task for assigned owner
        ├── Action 3: Send Slack notification
        └── Action 4: Update stage to "Approaching"
Step 4: Activate Play
Step 5: System monitors trigger conditions continuously
Step 6: When triggered:
        ├── Execute actions in order
        ├── Log execution in audit trail
        └── Handle errors (retry logic)
```

---

## 5. 🧑‍💻 UI / UX Structure

### 5.1 Global Layout

```
┌─────────────────────────────────────────────────────────┐
│  Top Bar: [Logo] [Search Bar] [Notifications] [Profile] │
├────────┬────────────────────────────────────────────────┤
│        │                                                │
│  Side  │              Main Content Area                 │
│  bar   │                                                │
│        │  ┌──────────────────────────────────────────┐  │
│  ○ Home│  │  Page Header + Actions                   │  │
│  ○ Srch│  ├──────────────────────────────────────────┤  │
│  ○ Engag│ │                                          │  │
│  ○ Play│  │  Content (Table / Cards / Kanban / Form) │  │
│  ○ CRM │  │                                          │  │
│  ○ Tasks│ │                                          │  │
│  ○ Anlyt│ │                                          │  │
│  ○ Sett│  └──────────────────────────────────────────┘  │
│        │                                                │
│        │  ┌──────────────────────────────────────────┐  │
│        │  │  Pagination / Load More                   │  │
│        │  └──────────────────────────────────────────┘  │
├────────┴────────────────────────────────────────────────┤
│  [Footer / Status Bar]                                   │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Sidebar Navigation Items

| Item | Icon | Route | Sub-Items |
|---|---|---|---|
| Home | 🏠 | `/` | Dashboard overview |
| Search | 🔍 | `/search` | People, Companies, Lists |
| Engage | ✉️ | `/sequences` | Sequences, Templates, Mailboxes |
| Plays | ⚡ | `/plays` | Plays list, Create play |
| CRM | 💼 | `/deals` | Deals, Pipeline, Accounts |
| Tasks | ✅ | `/tasks` | My Tasks, Team Tasks |
| Analytics | 📊 | `/analytics` | Dashboards, Reports |
| Enrichment | 🔄 | `/enrichment` | Enrich, API usage |
| Settings | ⚙️ | `/settings` | Account, Team, Integrations, Billing |

### 5.3 Reusable UI Components

| Component | Usage |
|---|---|
| `DataTable` | Contacts list, companies list, deals list, activities |
| `FilterPanel` | Left sidebar filters on search pages |
| `KanbanBoard` | Deal pipeline, sequence stages |
| `Modal` | Create/edit forms, confirmations, previews |
| `SequenceBuilder` | Visual step editor (vertical timeline) |
| `ActivityTimeline` | Chronological event feed on contact/deal pages |
| `MetricCard` | Dashboard KPI display |
| `ChartWidget` | Line/bar/funnel chart containers |
| `ContactCard` | Contact detail flyout/sidebar |
| `TagInput` | Multi-select tag management |
| `RichTextEditor` | Email body composition with token insertion |
| `CommandPalette` | Global search / quick actions (Cmd+K) |
| `Toast/Notification` | Success/error/info alerts |
| `EmptyState` | Illustrated placeholder for zero-data views |
| `BulkActionBar` | Floating bar when items are selected |

### 5.4 Key Page Layouts

#### Search Page
```
┌─────────────────────────────────────────────────┐
│ [People] [Companies] tabs                        │
├──────────┬──────────────────────────────────────┤
│ Filters  │ ┌────────────────────────────────┐   │
│ --------│ │ Bulk Actions Bar (when selected)│   │
│ Title    │ ├────────────────────────────────┤   │
│ Seniority│ │ ☐ Name  | Title | Company |...│   │
│ Company  │ │ ☐ John  | VP    | Acme    |...│   │
│ Industry │ │ ☐ Jane  | Dir   | Globex  |...│   │
│ Location │ │ ☐ ...   | ...   | ...     |...│   │
│ Intent   │ ├────────────────────────────────┤   │
│ Tech     │ │ Page 1 of 50  [<] [>]          │   │
│ Revenue  │ └────────────────────────────────┘   │
│ + More   │                                      │
└──────────┴──────────────────────────────────────┘
```

#### Sequence Builder Page
```
┌─────────────────────────────────────────────────┐
│ Sequence Name          [Settings] [Analytics]    │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────────┐                              │
│  │ Step 1: Email  │ ← Day 0                     │
│  │ Subject: ...   │                              │
│  └───────┬────────┘                              │
│          │ Wait 3 days                           │
│  ┌───────▼────────┐                              │
│  │ Step 2: Email  │ ← Day 3                     │
│  │ Follow-up      │                              │
│  └───────┬────────┘                              │
│          │ Wait 2 days                           │
│  ┌───────▼────────┐                              │
│  │ Step 3: Call   │ ← Day 5                     │
│  │ Script: ...    │                              │
│  └───────┬────────┘                              │
│          │                                       │
│  [+ Add Step]                                    │
│                                                  │
│ ─── Enrolled Contacts ──────────────────────── │
│  Total: 150 | Active: 89 | Replied: 23          │
└─────────────────────────────────────────────────┘
```

---

## 6. 🗄️ Data Model

### 6.1 Core Schemas

#### Users Table

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL |
| `password_hash` | VARCHAR(255) | NOT NULL |
| `first_name` | VARCHAR(100) | NOT NULL |
| `last_name` | VARCHAR(100) | NOT NULL |
| `role` | ENUM(admin, manager, member) | NOT NULL |
| `team_id` | UUID | FK → teams.id |
| `avatar_url` | TEXT | NULLABLE |
| `timezone` | VARCHAR(50) | DEFAULT 'UTC' |
| `daily_send_limit` | INTEGER | DEFAULT 100 |
| `last_login_at` | TIMESTAMP | NULLABLE |
| `created_at` | TIMESTAMP | NOT NULL |
| `updated_at` | TIMESTAMP | NOT NULL |

#### Teams Table

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | VARCHAR(255) | NOT NULL |
| `org_id` | UUID | FK → organizations.id |
| `created_at` | TIMESTAMP | NOT NULL |

#### Organizations Table

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | VARCHAR(255) | NOT NULL |
| `domain` | VARCHAR(255) | UNIQUE |
| `plan` | ENUM(free, basic, professional, organization, enterprise) | NOT NULL |
| `subscription_status` | ENUM(active, trialing, past_due, cancelled) | NOT NULL |
| `credits_remaining` | INTEGER | DEFAULT 0 |
| `monthly_credit_limit` | INTEGER | NOT NULL |
| `billing_email` | VARCHAR(255) | NULLABLE |
| `created_at` | TIMESTAMP | NOT NULL |

#### Contacts Table

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `org_id` | UUID | FK → organizations.id, NOT NULL |
| `first_name` | VARCHAR(100) | NULLABLE |
| `last_name` | VARCHAR(100) | NULLABLE |
| `email` | VARCHAR(255) | NULLABLE |
| `email_status` | ENUM(verified, guessed, unavailable, bounced) | NULLABLE |
| `email_confidence` | INTEGER | 0-100 |
| `phone_direct` | VARCHAR(20) | NULLABLE |
| `phone_mobile` | VARCHAR(20) | NULLABLE |
| `phone_hq` | VARCHAR(20) | NULLABLE |
| `title` | VARCHAR(255) | NULLABLE |
| `seniority` | ENUM(c_suite, vp, director, manager, senior, entry) | NULLABLE |
| `department` | VARCHAR(100) | NULLABLE |
| `company_id` | UUID | FK → companies.id |
| `linkedin_url` | TEXT | NULLABLE |
| `city` | VARCHAR(100) | NULLABLE |
| `state` | VARCHAR(100) | NULLABLE |
| `country` | VARCHAR(100) | NULLABLE |
| `stage` | ENUM(cold, approaching, replied, interested, not_interested, dnc) | DEFAULT 'cold' |
| `owner_id` | UUID | FK → users.id |
| `lead_score` | INTEGER | DEFAULT 0 |
| `enrichment_status` | ENUM(pending, enriched, failed, stale) | DEFAULT 'pending' |
| `last_enriched_at` | TIMESTAMP | NULLABLE |
| `source` | VARCHAR(100) | NULLABLE |
| `tags` | TEXT[] | DEFAULT '{}' |
| `custom_fields` | JSONB | DEFAULT '{}' |
| `external_crm_id` | VARCHAR(255) | NULLABLE |
| `created_at` | TIMESTAMP | NOT NULL |
| `updated_at` | TIMESTAMP | NOT NULL |

#### Companies Table

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `name` | VARCHAR(255) | NOT NULL |
| `domain` | VARCHAR(255) | UNIQUE |
| `industry` | VARCHAR(100) | NULLABLE |
| `employee_count` | INTEGER | NULLABLE |
| `employee_range` | VARCHAR(20) | NULLABLE |
| `annual_revenue` | BIGINT | NULLABLE |
| `revenue_range` | VARCHAR(30) | NULLABLE |
| `founded_year` | INTEGER | NULLABLE |
| `description` | TEXT | NULLABLE |
| `linkedin_url` | TEXT | NULLABLE |
| `website_url` | TEXT | NULLABLE |
| `phone_hq` | VARCHAR(20) | NULLABLE |
| `address` | TEXT | NULLABLE |
| `city` | VARCHAR(100) | NULLABLE |
| `state` | VARCHAR(100) | NULLABLE |
| `country` | VARCHAR(100) | NULLABLE |
| `technologies` | TEXT[] | DEFAULT '{}' |
| `sic_codes` | TEXT[] | DEFAULT '{}' |
| `naics_codes` | TEXT[] | DEFAULT '{}' |
| `logo_url` | TEXT | NULLABLE |
| `enrichment_status` | ENUM(pending, enriched, failed, stale) | DEFAULT 'pending' |
| `created_at` | TIMESTAMP | NOT NULL |
| `updated_at` | TIMESTAMP | NOT NULL |

#### Sequences Table

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `org_id` | UUID | FK → organizations.id |
| `name` | VARCHAR(255) | NOT NULL |
| `status` | ENUM(draft, active, paused, archived) | DEFAULT 'draft' |
| `created_by` | UUID | FK → users.id |
| `settings` | JSONB | NOT NULL |
| `total_enrolled` | INTEGER | DEFAULT 0 |
| `total_replied` | INTEGER | DEFAULT 0 |
| `total_bounced` | INTEGER | DEFAULT 0 |
| `total_meetings` | INTEGER | DEFAULT 0 |
| `folder_id` | UUID | FK → folders.id, NULLABLE |
| `created_at` | TIMESTAMP | NOT NULL |
| `updated_at` | TIMESTAMP | NOT NULL |

#### Sequence Steps Table

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `sequence_id` | UUID | FK → sequences.id, ON DELETE CASCADE |
| `step_number` | INTEGER | NOT NULL |
| `step_type` | ENUM(auto_email, manual_email, phone, linkedin_view, linkedin_connect, linkedin_message, custom_task) | NOT NULL |
| `delay_days` | INTEGER | DEFAULT 0 |
| `delay_hours` | INTEGER | DEFAULT 0 |
| `subject` | TEXT | NULLABLE |
| `body_html` | TEXT | NULLABLE |
| `body_text` | TEXT | NULLABLE |
| `is_reply` | BOOLEAN | DEFAULT false |
| `ab_enabled` | BOOLEAN | DEFAULT false |
| `variants` | JSONB | DEFAULT '[]' |
| `task_note` | TEXT | NULLABLE |
| `created_at` | TIMESTAMP | NOT NULL |

#### Sequence Enrollments Table

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `sequence_id` | UUID | FK → sequences.id |
| `contact_id` | UUID | FK → contacts.id |
| `user_id` | UUID | FK → users.id (sender) |
| `mailbox_id` | UUID | FK → mailboxes.id |
| `current_step` | INTEGER | DEFAULT 1 |
| `status` | ENUM(active, paused, finished, replied, bounced, opted_out, manual_stop) | DEFAULT 'active' |
| `enrolled_at` | TIMESTAMP | NOT NULL |
| `finished_at` | TIMESTAMP | NULLABLE |
| `next_step_at` | TIMESTAMP | NULLABLE |

#### Activities Table

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `org_id` | UUID | FK → organizations.id |
| `contact_id` | UUID | FK → contacts.id, NULLABLE |
| `deal_id` | UUID | FK → deals.id, NULLABLE |
| `user_id` | UUID | FK → users.id |
| `activity_type` | VARCHAR(50) | NOT NULL |
| `subject` | TEXT | NULLABLE |
| `body` | TEXT | NULLABLE |
| `metadata` | JSONB | DEFAULT '{}' |
| `sequence_id` | UUID | FK → sequences.id, NULLABLE |
| `step_id` | UUID | FK → sequence_steps.id, NULLABLE |
| `created_at` | TIMESTAMP | NOT NULL |

#### Deals Table

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `org_id` | UUID | FK → organizations.id |
| `name` | VARCHAR(255) | NOT NULL |
| `amount` | DECIMAL(12,2) | NULLABLE |
| `currency` | CHAR(3) | DEFAULT 'USD' |
| `pipeline_id` | UUID | FK → pipelines.id |
| `stage_id` | UUID | FK → deal_stages.id |
| `probability` | INTEGER | NULLABLE |
| `expected_close_date` | DATE | NULLABLE |
| `owner_id` | UUID | FK → users.id |
| `company_id` | UUID | FK → companies.id, NULLABLE |
| `source` | VARCHAR(100) | NULLABLE |
| `loss_reason` | VARCHAR(255) | NULLABLE |
| `custom_fields` | JSONB | DEFAULT '{}' |
| `external_crm_id` | VARCHAR(255) | NULLABLE |
| `closed_at` | TIMESTAMP | NULLABLE |
| `created_at` | TIMESTAMP | NOT NULL |
| `updated_at` | TIMESTAMP | NOT NULL |

#### Mailboxes Table

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users.id |
| `email_address` | VARCHAR(255) | NOT NULL |
| `provider` | ENUM(gmail, outlook, smtp) | NOT NULL |
| `oauth_token` | TEXT (encrypted) | NULLABLE |
| `smtp_host` | VARCHAR(255) | NULLABLE |
| `smtp_port` | INTEGER | NULLABLE |
| `imap_host` | VARCHAR(255) | NULLABLE |
| `daily_send_limit` | INTEGER | DEFAULT 100 |
| `sends_today` | INTEGER | DEFAULT 0 |
| `warmup_enabled` | BOOLEAN | DEFAULT false |
| `warmup_day` | INTEGER | DEFAULT 0 |
| `status` | ENUM(active, disconnected, warming) | DEFAULT 'active' |
| `created_at` | TIMESTAMP | NOT NULL |

### 6.2 Entity Relationship Summary

```
organizations (1) ──< (N) teams
organizations (1) ──< (N) users
organizations (1) ──< (N) contacts
organizations (1) ──< (N) companies
organizations (1) ──< (N) sequences
organizations (1) ──< (N) deals
organizations (1) ──< (N) pipelines

users (1) ──< (N) mailboxes
users (1) ──< (N) contacts (owner)
users (1) ──< (N) deals (owner)
users (1) ──< (N) activities

contacts (N) >──(1) companies
contacts (1) ──< (N) activities
contacts (N) ──< (N) lists (via contact_lists join)
contacts (N) ──< (N) sequences (via sequence_enrollments)

sequences (1) ──< (N) sequence_steps
sequences (1) ──< (N) sequence_enrollments
sequence_enrollments (N) >── (1) contacts
sequence_enrollments (N) >── (1) mailboxes

deals (N) >── (1) pipelines
deals (N) >── (1) deal_stages
deals (N) >── (1) companies
deals (1) ──< (N) activities
deals (N) ──< (N) contacts (via deal_contacts join)

pipelines (1) ──< (N) deal_stages
```

---

## 7. ⚙️ Feature Logic

### 7.1 Sequence Execution Engine

```
Sequence Execution Loop (runs every 60 seconds):
1. Query: SELECT * FROM sequence_enrollments
          WHERE status = 'active'
          AND next_step_at <= NOW()
          LIMIT 500 (batch size)

2. For each enrollment:
   a. Fetch current step configuration
   b. Check preconditions:
      ├── Is sequence still active?
      ├── Has contact replied? (check reply inbox)
      ├── Has contact bounced/opted out?
      └── Is sender mailbox within daily limit?
   c. If step_type = 'auto_email':
      ├── Render template (replace {{tokens}})
      ├── Apply threading (In-Reply-To header if is_reply)
      ├── Check deliverability (domain reputation)
      ├── Queue email job → email_send_queue (Redis/BullMQ)
      └── Update: current_step++, next_step_at = NOW() + delay
   d. If step_type = 'manual_*' or 'phone' or 'linkedin_*':
      ├── Create Task record for assigned user
      └── Update enrollment (awaiting task completion)
   e. If last step → mark enrollment as 'finished'

3. Log activity for each executed step
4. Update sequence aggregate counters
```

### 7.2 Email Sending Pipeline

```
Email Send Queue Processing:
1. Worker picks job from Redis queue
2. Rate limiting check:
   ├── Per-mailbox: max N/day (e.g., 100)
   ├── Per-domain: max N/hour (avoid domain flooding)
   └── Global org limit
3. If within limits:
   a. Connect to SMTP/Gmail API
   b. Construct MIME message:
      ├── Headers (From, To, Subject, Reply-To, Message-ID)
      ├── Custom headers (X-Mailer, List-Unsubscribe)
      ├── HTML body (with tracking pixel injected)
      ├── Plain text body (fallback)
      └── Click-tracked URLs (rewritten)
   c. Send email
   d. Record: message_id, sent_at, mailbox_id
   e. Log activity: email_sent
   f. Increment mailbox sends_today counter
4. If rate limited:
   └── Re-queue with delay (exponential backoff)
5. Error handling:
   ├── SMTP error → retry 3x, then mark failed
   ├── Authentication error → flag mailbox, notify user
   └── Hard bounce → mark contact email as bounced
```

### 7.3 Deliverability Management

```
Deliverability Stack:
├── Domain Authentication:
│   ├── SPF: TXT record authorizing sending IPs
│   ├── DKIM: 2048-bit key pair, sign outbound headers+body
│   └── DMARC: Policy record (p=quarantine or p=reject)
│
├── Sending Reputation:
│   ├── Warm-up schedule: Day 1→5/day, Day 7→15/day, Day 14→30/day, Day 30→100/day
│   ├── Engagement-based throttling: slow down if bounce rate > 5%
│   └── Domain rotation: distribute sends across multiple domains
│
├── Content Optimization:
│   ├── Spam scoring: pre-send check (SpamAssassin-style)
│   ├── Link density check: max 2-3 links per email
│   ├── Image-to-text ratio: balanced
│   └── Unsubscribe header: RFC 8058 compliant
│
├── Custom Tracking Domain:
│   ├── CNAME: track.clientdomain.com → tracking-server
│   └── SSL certificate provisioned automatically
│
└── Monitoring:
    ├── Bounce rate dashboard (< 2% target)
    ├── Spam complaint tracking (< 0.1% target)
    ├── Blacklist monitoring (Spamhaus, Barracuda)
    └── Inbox placement testing
```

### 7.4 AI Suggestion Triggers

| Trigger Context | AI Action | Implementation |
|---|---|---|
| User composing email | Show "Generate with AI" button | On-demand LLM call |
| Prospect replies | Classify reply + suggest follow-up | NLP pipeline → LLM |
| New contacts added | Score and prioritize | ML scoring model |
| Sequence underperforming | Suggest improvements | Analytics → LLM analysis |
| Contact job change | Draft re-engagement email | Event trigger → LLM |
| Low open rates | Suggest subject line alternatives | A/B data → LLM |

---

## 8. 🔌 Integrations

### 8.1 CRM Integrations

#### Salesforce Integration

```
Sync Architecture:
├── Authentication: OAuth 2.0 (authorization code flow)
├── Sync Direction: Bi-directional
├── Object Mapping:
│   ├── Apollo Contact → SF Lead / Contact
│   ├── Apollo Company → SF Account
│   ├── Apollo Deal → SF Opportunity
│   ├── Apollo Activity → SF Task / Event
│   └── Apollo Sequence → SF Campaign
├── Sync Frequency:
│   ├── Real-time: via webhooks (Salesforce Streaming API)
│   └── Batch: hourly full reconciliation
├── Conflict Resolution:
│   ├── Last-write-wins (configurable)
│   └── Field-level merge rules
└── Error Handling:
    ├── Retry with exponential backoff
    ├── Dead-letter queue for failed syncs
    └── Admin notification on persistent failures
```

#### HubSpot Integration

```
Sync Architecture:
├── Authentication: OAuth 2.0
├── Sync Direction: Bi-directional
├── Object Mapping:
│   ├── Apollo Contact → HS Contact
│   ├── Apollo Company → HS Company
│   ├── Apollo Deal → HS Deal
│   └── Apollo Activity → HS Engagement
├── Enrichment: Auto-enrich HS contacts with Apollo data (11-24 fields)
├── Timeline: Push Apollo activities to HS contact timeline
└── Properties: Map custom fields to HS properties
```

### 8.2 Email Provider Integrations

| Provider | Auth Method | Capabilities |
|---|---|---|
| Gmail | OAuth 2.0 (Google API) | Send, receive, track, thread |
| Outlook/O365 | OAuth 2.0 (MS Graph) | Send, receive, track, thread |
| Custom SMTP | Username/password + TLS | Send only |
| Custom IMAP | Username/password + TLS | Receive/reply detection |

### 8.3 Calendar Integration

```
Calendar Sync:
├── Google Calendar: OAuth 2.0 → read/write events
├── Outlook Calendar: MS Graph API → read/write events
├── Meeting Scheduler:
│   ├── Generate shareable booking link
│   ├── Show available slots (exclude busy times)
│   ├── Round-robin assignment (team scheduling)
│   └── Auto-create deal on meeting booked
└── Meeting Detection:
    ├── Parse calendar events for CRM logging
    └── Auto-update contact stage on meeting completion
```

### 8.4 Webhook Events

| Event | Payload |
|---|---|
| `contact.created` | Full contact object |
| `contact.updated` | Changed fields + contact ID |
| `sequence.started` | Enrollment details |
| `sequence.completed` | Final status + metrics |
| `email.sent` | Message ID, contact, sequence step |
| `email.opened` | Tracking ID, timestamp, IP, user-agent |
| `email.clicked` | Tracking ID, URL clicked, timestamp |
| `email.replied` | Message ID, reply body excerpt |
| `email.bounced` | Bounce type, error message |
| `deal.created` | Full deal object |
| `deal.stage_changed` | Old stage, new stage, deal ID |

---

## 9. 🔐 Security & Scaling

### 9.1 Authentication & Authorization

```
Auth Stack:
├── User Auth: JWT (access token: 15min, refresh token: 7d)
├── API Auth: API key in Authorization header (Basic auth)
├── OAuth: For CRM + email provider integrations
├── MFA: TOTP-based two-factor authentication
├── SSO: SAML 2.0 for enterprise orgs
├── RBAC:
│   ├── Admin: full access, billing, team management
│   ├── Manager: team-level access, reports
│   └── Member: own data, sequences, contacts
└── Row-Level Security:
    ├── org_id filter on every query
    ├── Visibility rules (only-me, team, org)
    └── Owner-based access for contacts/deals
```

### 9.2 Rate Limiting

| Endpoint Category | Limit | Window |
|---|---|---|
| API (Standard) | 100 requests | 5 minutes |
| API (Master Key) | 500 requests | 5 minutes |
| Search | 50 requests | 1 minute |
| Enrichment | 100 credits | Per billing cycle |
| Email Sending | Configurable per mailbox | 24 hours |
| Webhook Delivery | 1000 events | 1 hour |

### 9.3 Multi-Tenant Architecture

```
Tenant Isolation:
├── Database: Shared database, org_id column on every table
├── Indexes: Composite indexes include org_id as prefix
├── Queries: Middleware injects org_id filter automatically
├── Elasticsearch: Separate index per org OR filtered aliases
├── File Storage: S3 bucket with org_id prefix in key path
├── Cache: Redis key prefix includes org_id
└── Background Jobs: Job payload includes org_id for scoping
```

### 9.4 Data Privacy & Compliance

```
Compliance Framework:
├── GDPR:
│   ├── Right to deletion: cascade delete contact + activities
│   ├── Data export: full contact data export in JSON/CSV
│   ├── Consent tracking: opt-in/opt-out records
│   └── DPA: Data Processing Agreement for enterprise
├── CCPA/CPRA:
│   ├── Do Not Sell: honor opt-out signals
│   └── Privacy policy: disclose data collection practices
├── CAN-SPAM:
│   ├── Unsubscribe link: mandatory in all sequences
│   ├── Physical address: included in email footer
│   └── Opt-out processing: within 10 business days
├── SOC 2 Type 2: annual audit of security controls
├── ISO 27001: information security management
└── Data Encryption:
    ├── At rest: AES-256 (database, S3)
    ├── In transit: TLS 1.2+ (all connections)
    └── Secrets: HashiCorp Vault / AWS KMS
```

### 9.5 Scaling Strategy

| Component | Scaling Approach |
|---|---|
| API Servers | Horizontal (Kubernetes HPA) |
| Database | Read replicas + connection pooling (PgBouncer) |
| Elasticsearch | Multi-node cluster, sharding by org size |
| Redis | Cluster mode, separate instances for cache vs queues |
| Email Workers | Auto-scale based on queue depth |
| Analytics | ClickHouse columnar storage, materialized views |
| File Storage | S3 (infinite scale) |
| CDN | CloudFront for static assets + tracking domain |

---

## 10. 🚀 Replication Blueprint

### 10.1 MVP Feature Set (Phase 1: Weeks 1–8)

| Feature | Priority | Effort |
|---|---|---|
| User auth + team management | P0 | 1 week |
| Contact CRUD + import (CSV) | P0 | 1 week |
| Company CRUD + association | P0 | 0.5 week |
| Basic search + filters (5-10 filters) | P0 | 1.5 weeks |
| Email sequence builder (email-only) | P0 | 2 weeks |
| Mailbox connection (Gmail OAuth) | P0 | 1 week |
| Email sending (auto + manual) | P0 | 1.5 weeks |
| Basic tracking (opens, clicks) | P1 | 1 week |
| Activity timeline | P1 | 0.5 week |
| Basic analytics (sent/opened/replied) | P1 | 1 week |

**MVP Deliverable:** Users can import contacts, build email sequences, connect Gmail, send tracked emails, and view basic analytics.

### 10.2 Growth Features (Phase 2: Weeks 9–16)

| Feature | Priority | Effort |
|---|---|---|
| Deal pipeline + Kanban board | P1 | 1.5 weeks |
| Multi-channel steps (call, LinkedIn tasks) | P1 | 1 week |
| Advanced search (15+ filters) | P1 | 1.5 weeks |
| Contact enrichment (API integration) | P1 | 1 week |
| CRM sync (Salesforce or HubSpot) | P1 | 2 weeks |
| Lead scoring (rule-based) | P2 | 1 week |
| Team management + RBAC | P1 | 1 week |
| Custom fields | P2 | 0.5 week |
| Saved searches + lists | P1 | 0.5 week |
| A/B testing for emails | P2 | 1 week |
| Webhook system | P2 | 0.5 week |

### 10.3 Full Platform (Phase 3: Weeks 17–28)

| Feature | Priority | Effort |
|---|---|---|
| AI email writer (LLM integration) | P1 | 2 weeks |
| Plays / automation engine | P1 | 3 weeks |
| Advanced analytics + custom dashboards | P1 | 2 weeks |
| Chrome extension | P2 | 3 weeks |
| Calendar integration + meeting scheduler | P2 | 1.5 weeks |
| Email deliverability tools (warmup, SPF wizard) | P2 | 1.5 weeks |
| API for external developers | P2 | 2 weeks |
| Reply classification (AI) | P2 | 1 week |
| Lead scoring (ML-based) | P3 | 2 weeks |
| SSO + enterprise security | P3 | 1.5 weeks |
| Billing + subscription management | P1 | 1.5 weeks |
| Data privacy tools (GDPR exports, deletion) | P1 | 1 week |

### 10.4 Suggested Team Composition

| Role | Count | Responsibility |
|---|---|---|
| Full-Stack Engineers | 3-4 | Core platform development |
| Frontend Engineer | 1-2 | UI/UX, design system |
| Backend/Infra Engineer | 1-2 | Search, queues, scaling |
| ML/AI Engineer | 1 | Scoring, LLM integration |
| Designer (UI/UX) | 1 | Interface design, prototyping |
| Product Manager | 1 | Roadmap, prioritization |
| QA Engineer | 1 | Testing, quality assurance |
| DevOps | 1 | Infrastructure, CI/CD, monitoring |

### 10.5 Critical Technical Decisions

| Decision | Recommendation | Rationale |
|---|---|---|
| Database | PostgreSQL | Proven, JSONB for flexibility, strong ecosystem |
| Search | Elasticsearch | Essential for multi-faceted lead filtering |
| Queue | Redis + BullMQ | Reliable, fast, native to Node.js ecosystem |
| Email Sending | Direct SMTP via Nodemailer | Control over deliverability, no vendor lock-in |
| AI Provider | Anthropic Claude API | Strong at email generation, safe outputs |
| Auth | JWT + refresh tokens | Stateless, scalable |
| Hosting | AWS (ECS or EKS) | Mature tooling, global availability |
| Monitoring | Datadog or self-hosted Grafana stack | Critical for email pipeline observability |

---

## 11. 📌 Advanced Features

### 11.1 Chrome Extension

```
Chrome Extension Architecture:
├── Manifest V3 (service worker based)
├── Content Scripts:
│   ├── LinkedIn injector: detect profile page → show sidebar
│   ├── Gmail injector: add tracking + sequence buttons
│   └── Company website: detect domain → show company info
├── Popup UI:
│   ├── Quick search contacts
│   ├── View recent activities
│   └── Add contact to sequence
├── Background Service Worker:
│   ├── Auth token management
│   ├── API calls to Apollo backend
│   └── Notification handling
├── Data Flow:
│   ├── Scrape LinkedIn profile → match in Apollo DB
│   ├── Show enriched data (email, phone, company)
│   ├── One-click "Add to Sequence"
│   └── Track email opens from Gmail
└── Permissions:
    ├── activeTab, storage, identity
    ├── Host permissions: linkedin.com, mail.google.com
    └── OAuth for Apollo API authentication
```

### 11.2 Real-Time Notifications

```
Notification System:
├── Delivery Channels:
│   ├── In-app: WebSocket (Socket.io) → notification bell
│   ├── Email: daily/weekly digest
│   ├── Browser: Push notifications (Web Push API)
│   └── Slack/Teams: webhook integration
├── Notification Types:
│   ├── email_replied: "John Smith replied to your email"
│   ├── email_opened: "Jane Doe opened your email (3x)"
│   ├── link_clicked: "Prospect clicked pricing link"
│   ├── task_due: "Call task due in 30 minutes"
│   ├── sequence_finished: "Sequence 'Q1 Outbound' completed"
│   ├── deal_stage_changed: "Deal moved to Negotiation"
│   └── credit_low: "Only 50 enrichment credits remaining"
├── Preferences:
│   ├── Per-type enable/disable
│   ├── Quiet hours configuration
│   └── Channel preferences per notification type
└── Architecture:
    ├── Event bus (Redis Pub/Sub or Kafka)
    ├── Notification service subscribes to events
    ├── Template rendering per channel
    └── Delivery with retry logic
```

### 11.3 AI Copilot Features

```
AI Copilot Capabilities:
├── Inbox Copilot:
│   ├── Auto-classify incoming replies (interested/OOO/bounce/objection)
│   ├── Draft suggested reply based on thread context
│   └── Extract action items from replies
├── Pipeline Copilot:
│   ├── Predict deal close probability
│   ├── Suggest next best action per deal
│   └── Identify at-risk deals (stalled, no activity)
├── Prospecting Copilot:
│   ├── ICP-based contact recommendations
│   ├── Lookalike audience from closed-won deals
│   └── Buying intent signal aggregation
└── Coaching Copilot:
    ├── Analyze email performance patterns
    ├── Suggest improvements (send time, subject lines, length)
    └── Compare rep metrics to team benchmarks
```

### 11.4 Data Strategy

```
Data Acquisition Approach:
├── Licensed Data:
│   ├── Partner with B2B data providers
│   ├── Aggregated business registries
│   └── Published directories (SEC filings, etc.)
├── User-Contributed:
│   ├── Contacts imported by users (with consent)
│   ├── Crowdsourced verification
│   └── Engagement signals (email validity from sends)
├── Public Data:
│   ├── Company websites (about pages, team pages)
│   ├── Social profiles (LinkedIn public data)
│   ├── Job postings (hiring signals)
│   └── Press releases, funding announcements
├── Verification Pipeline:
│   ├── SMTP validation (without sending)
│   ├── MX record verification
│   ├── Catch-all domain detection
│   ├── Disposable email detection
│   └── Phone number carrier validation
└── Legal & Ethical:
    ├── Comply with website ToS
    ├── Respect robots.txt
    ├── Honor opt-out / suppression lists
    ├── GDPR lawful basis: legitimate interest
    └── Regular data accuracy audits
```

---

## Appendix A: Key API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/login` | JWT login |
| `POST` | `/auth/refresh` | Refresh access token |
| `GET` | `/contacts` | List contacts (paginated, filtered) |
| `POST` | `/contacts` | Create contact |
| `GET` | `/contacts/:id` | Get contact details |
| `PUT` | `/contacts/:id` | Update contact |
| `DELETE` | `/contacts/:id` | Delete contact |
| `POST` | `/contacts/search` | Advanced search |
| `POST` | `/contacts/enrich` | Enrich contact data |
| `GET` | `/companies` | List companies |
| `POST` | `/companies/search` | Search companies |
| `GET` | `/sequences` | List sequences |
| `POST` | `/sequences` | Create sequence |
| `POST` | `/sequences/:id/steps` | Add step to sequence |
| `POST` | `/sequences/:id/enroll` | Enroll contacts |
| `GET` | `/deals` | List deals |
| `POST` | `/deals` | Create deal |
| `PUT` | `/deals/:id` | Update deal (stage change) |
| `GET` | `/activities` | List activities (filtered) |
| `GET` | `/analytics/sequences/:id` | Sequence performance |
| `GET` | `/analytics/emails` | Email metrics |
| `GET` | `/analytics/pipeline` | Pipeline metrics |
| `POST` | `/plays` | Create play (automation) |
| `GET` | `/webhooks` | List webhook subscriptions |
| `POST` | `/webhooks` | Create webhook subscription |

---

## Appendix B: Environment Variables

```env
# Application
NODE_ENV=production
APP_PORT=3000
APP_SECRET=<random-256-bit-key>
JWT_SECRET=<random-256-bit-key>
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# Database
DATABASE_URL=postgresql://user:pass@host:5432/apollo_db
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL=redis://host:6379
REDIS_QUEUE_DB=1
REDIS_CACHE_DB=2

# Elasticsearch
ELASTICSEARCH_URL=https://host:9200
ELASTICSEARCH_INDEX_PREFIX=apollo

# Email
SMTP_DEFAULT_FROM=noreply@yourdomain.com
TRACKING_DOMAIN=track.yourdomain.com

# AI
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-3-5-sonnet

# External Integrations
SALESFORCE_CLIENT_ID=...
SALESFORCE_CLIENT_SECRET=...
HUBSPOT_CLIENT_ID=...
HUBSPOT_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# AWS
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=apollo-assets
AWS_REGION=us-east-1

# Monitoring
DATADOG_API_KEY=...
SENTRY_DSN=...
```

---

> **End of System Specification**
> This document provides a complete reverse-engineered blueprint of the Apollo.io platform. It is structured for engineering teams to use as a reference for building a comparable B2B sales intelligence and engagement SaaS product.

