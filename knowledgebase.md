# Parallex CRM Knowledge Base

## Product Overview
Parallex CRM is a B2B sales platform built around four major capabilities:
- CRM data management
- prospect discovery and enrichment
- sequence-based outbound execution
- workflow automation

It is implemented with Next.js, Supabase auth, PostgreSQL, Prisma, and several raw-SQL-backed operational tables.

## Main Product Areas
### CRM
- Contacts
- Companies
- Leads
- Deals
- Tasks

### Prospecting
- Google Maps-based search and scraping
- saved search/query history
- lead caching and dedupe

### Engagement
- Sequences
- Workflows

### Operations
- Analytics
- Admin user endpoints
- visitor and app usage tracking

## Authentication and User Resolution
The app uses Supabase auth sessions, but application users live in PostgreSQL and are resolved through `src/lib/api-utils.ts`.

Important behavior:
- If the authenticated Supabase user does not yet exist in the app DB, the code auto-provisions:
  - organization
  - user
- Public email domains get a generated `.local` workspace domain.
- First user in an organization becomes `admin`.

This means the application has an app-level user model layered on top of Supabase auth.

## Database Model
### Prisma-backed core entities
Defined in `prisma/schema.prisma`:
- `Organization`
- `Team`
- `User`
- `Contact`
- `Company`
- `SearchQuery`
- `Prospect`
- `Lead`

These drive the core CRM and prospecting experience.

### Raw SQL operational tables
Created dynamically by backend helpers:

#### Sequence tables
Managed in `src/lib/sequences-store.ts`:
- `app_sequences`
- `app_sequence_enrollments`
- `app_sequence_events`
- `app_tasks`

#### Workflow tables
Managed in `src/lib/workflow-engine.ts`:
- `workflows`
- `workflow_steps`
- `workflow_runs`
- `workflow_queue`
- `workflow_logs`

## Key Runtime Patterns
### Org scoping
Most app behavior is org-scoped. APIs typically:
1. resolve current user
2. use `user.org_id`
3. restrict queries to the current org

### Serverless execution
The project runs in a serverless-friendly shape:
- short-lived HTTP routes
- DB-backed state
- queue-based delayed execution for workflows

### Mixed persistence strategy
The codebase uses both:
- Prisma model delegates for core entities
- raw SQL for custom automation systems

This is important when changing data models or adding migrations.

## Prospecting Knowledge
### Main search behavior
`/api/prospect/search` is one of the heaviest routes in the app.

It:
- validates query and location
- checks org-scoped lead cache
- optionally scrapes Google Maps
- ranks and dedupes results
- returns prospect-style output

Important notes:
- Admin users may trigger deeper fill behavior.
- Scraped results are not always persisted immediately.
- Lead helpers handle dedupe keys, business tags, and normalized websites.

### Supporting libraries
- `src/lib/lead-utils.ts`
- `src/lib/scrapers/google-maps-scraper.ts`
- `src/lib/scrapers/business-email-scraper.ts`
- `src/lib/scrapers/browser-launcher.ts`

## Sequences Knowledge
### What Sequences do
Sequences are outbound multi-step engagement flows for contacts.

Supported step types:
- `automatic_email`
- `manual_email`
- `phone_call`
- `task`
- `linkedin_task`

### Important sequence behavior
- Enrollment is per contact per sequence.
- Automatic email sends through SMTP when configured, otherwise simulates.
- Manual steps create tasks.
- Completing a generated task advances the enrollment.
- `Run Due Steps` is required unless the UI explicitly auto-triggers it.

### Key limitations to remember
- Some schedule settings are stored but not fully enforced at runtime.
- Enrollment removal is still more limited than a full unsubscribe/reset model.

## Workflows Knowledge
### What Workflows do
Workflows are trigger-driven automation graphs backed by:
- workflow definitions
- ordered steps
- run records
- queue records
- step logs

### Supported concepts
- trigger types: `event`, `webhook`, `schedule`
- step types: `condition`, `delay`, `action`
- branch-aware execution:
  - shared path
  - YES path
  - NO path
- queue-based delayed execution

### Current workflow execution model
- trigger creates a workflow run
- queue starts at step 0
- each step either:
  - evaluates
  - executes
  - inserts the next queue job
- delays persist in `workflow_queue`

### Current workflow action patterns
Actions currently include:
- send email task
- create task
- notify owner
- update stage
- add tag
- call webhook
- enroll in sequence

Some actions are still generic at the UI level even though backend support exists.

## UI Knowledge
### Route groups
- `(auth)` contains login/register/auth callback
- `(app)` contains authenticated application pages

### Main authenticated pages
- `/`
- `/prospect`
- `/contacts`
- `/companies`
- `/leads`
- `/tasks`
- `/sequences`
- `/plays`
- `/analytics`
- `/settings`

### Naming note
Workflows currently live at `/plays`, even though the UI label says `Workflows`.

## Environment Knowledge
### Core env vars
- `DATABASE_URL`
- Supabase project keys used by the server/client helpers

### Email env vars
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

If SMTP values remain placeholders, sequence email steps simulate instead of sending.

## Scripts
From `package.json`:
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run seed:accounts`
- `npm run db:bootstrap:sequences`

## Operational Notes
### If contacts do not appear
Check:
- current org/workspace
- user login
- org scoping in the API route

### If sequence emails do not send
Check:
- `.env.local` SMTP credentials
- app restart after env change
- event log showing `email_sent` vs `email_simulated`

### If workflows do not run
Check:
- workflow is active
- trigger config matches the test payload
- queue processor route or launch action has been run
- logs in `workflow_logs`

## Known Technical Risks
- mixed raw SQL and Prisma can drift if not documented well
- limited automated test coverage
- scraping reliability depends on external target behavior
- workflow and sequence engines need continued hardening for retries and admin visibility

## Recommended Knowledge for New Contributors
Start here:
1. `prisma/schema.prisma`
2. `src/lib/api-utils.ts`
3. `src/lib/db.ts`
4. `src/app/(app)/layout.tsx`
5. `src/app/api/prospect/search/route.ts`
6. `src/lib/sequences-store.ts`
7. `src/lib/workflow-engine.ts`
