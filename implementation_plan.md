# Parallex CRM Implementation Plan

## Purpose
This plan documents how the current codebase can be stabilized and extended into a more complete sales intelligence, CRM, sequencing, and workflow platform.

The project already has strong foundations:
- Next.js App Router UI
- Supabase-backed auth session flow
- PostgreSQL through Prisma + raw SQL
- core CRM entities for organizations, users, contacts, companies, searches, prospects, and leads
- working Sequences and Workflows engines

This plan focuses on turning those foundations into a production-ready operating system for outbound sales teams.

## Current State Summary
### Working today
- Authenticated app shell with org-scoped user resolution
- Contacts, Companies, Leads, Tasks, Analytics, Settings, Prospecting, Sequences, and Workflows pages
- Google Maps-based prospect search flow with lead caching and ranking
- Sequence backend with enrollments, events, tasks, SMTP/simulated email handling, and due-step runner
- Workflow backend with trigger -> condition -> delay -> action execution, queue table, cron processor, event/webhook triggers, logs, and run history
- Branch-aware workflow builder UI with shared, YES, and NO paths

### Gaps today
- Limited automated testing
- Mixed use of Prisma models and raw SQL tables
- Incomplete per-action forms in workflows
- Limited observability and admin tooling
- Some product areas are scaffolded but not yet deep
- Docs exist for Sequences, but not yet for the full project

## Goals
1. Stabilize the existing platform.
2. Make core CRM flows reliable and easier to operate.
3. Improve Workflows and Sequences into production-grade automation tools.
4. Add better testing, observability, and deployment hygiene.
5. Reduce architectural ambiguity across auth, Prisma, and custom SQL tables.

## Phase 1: Stabilize the Core
### 1.1 Auth and org safety
- Standardize all API routes on `getCurrentUser()`.
- Audit every route for org scoping.
- Add explicit role checks for admin-only operations.
- Add consistent unauthorized/forbidden error responses.

### 1.2 Database consistency
- Inventory all tables used by:
  - Prisma schema models
  - sequence custom tables
  - workflow custom tables
  - visitor/app usage tracking
- Decide which custom tables should stay raw SQL and which should be promoted into Prisma schema.
- Add missing indexes for high-frequency filters:
  - org + status
  - org + updated_at
  - queue execute_at
  - search/history lookups

### 1.3 Error handling
- Normalize API errors into a single response shape.
- Remove silent failures where possible.
- Add server-side logging around:
  - workflow run failures
  - sequence run failures
  - scraping failures
  - auth/user bootstrap failures

### 1.4 Environment validation
- Add startup validation for required env vars:
  - `DATABASE_URL`
  - Supabase keys
  - optional SMTP keys
- Fail fast in development when critical env values are missing.

## Phase 2: Product Hardening
### 2.1 CRM modules
- Finish CRUD polish for Contacts and Companies.
- Add stronger validation and duplicate handling.
- Improve lead-to-contact/company conversion flows.
- Add better filtering, saved views, and pagination consistency.

### 2.2 Prospecting
- Separate scrape orchestration from HTTP route logic.
- Add provider abstraction for future prospect sources.
- Persist more normalized search metadata.
- Add rate-limit handling and clearer status feedback in the UI.

### 2.3 Tasks
- Expand task metadata so workflow- and sequence-generated tasks are easier to debug.
- Add owner assignment and filtering.
- Add task activity history if needed.

## Phase 3: Sequences Maturity
### 3.1 Sequence builder
- Add richer step editing UX.
- Add more guardrails for activation and enrollment.
- Add delete/remove enrollment flows where appropriate.

### 3.2 Execution engine
- Add schedule-window enforcement from sequence settings.
- Add per-step throttling and better skip reasons.
- Add retry rules for failed outbound email sends.

### 3.3 Observability
- Add sequence run dashboards:
  - sent
  - simulated
  - skipped
  - tasks created
  - completed enrollments
- Add contact-level execution timeline.

## Phase 4: Workflows Maturity
### 4.1 Builder UX
- Replace generic action value fields with real forms for:
  - send email
  - update stage
  - enroll in sequence
  - create task
  - call webhook
  - add tag
- Add reusable templates for common automation patterns.
- Add clearer action validation before activation.

### 4.2 Runtime
- Add retry support for failed workflow queue items.
- Add dead-letter/error state handling.
- Add run replay tools for admins.
- Add more explicit queue ownership and dedupe protections.

### 4.3 Trigger system
- Expand trigger support:
  - contact created
  - contact updated
  - company updated
  - task completed
  - sequence completed
  - webhook received
  - scheduled interval
- Add trigger payload validation and trigger previews.

### 4.4 Visual parity
- Continue evolving the builder toward GHL/Apollo-grade UX:
  - stronger connector visuals
  - reusable blocks
  - nested branch affordances
  - smarter path summaries

## Phase 5: Admin, Analytics, and Monitoring
### 5.1 Admin tooling
- Add workflow and sequence run inspection for admins.
- Add user/org management polish.
- Add simple maintenance utilities:
  - queue health
  - stuck runs
  - SMTP mode
  - scraper health

### 5.2 Analytics
- Expand app usage and visitor tracking into clearer dashboards.
- Add product analytics around:
  - prospect searches
  - lead saves
  - sequence performance
  - workflow execution success/failure

### 5.3 Auditing
- Add change logs for sensitive operations:
  - workflow edits
  - sequence edits
  - contact imports
  - admin user changes

## Phase 6: Testing and Release Readiness
### 6.1 Automated tests
- Add unit tests for:
  - lead normalization utilities
  - sequence step normalization and templating
  - workflow execution branching
- Add integration tests for:
  - `/api/contacts`
  - `/api/prospect/search`
  - `/api/sequences/*`
  - `/api/workflows/*`
- Add end-to-end smoke tests for:
  - login
  - contact creation
  - sequence enrollment
  - workflow launch

### 6.2 CI/CD
- Add a CI workflow that runs:
  - install
  - typecheck
  - lint
  - tests
- Add preview deployment validation if needed.

### 6.3 Release safety
- Add migration review checklist.
- Add environment promotion checklist.
- Add rollback notes for raw-SQL-backed features.

## Suggested Delivery Order
1. Core stabilization and auth/org audit
2. Database consistency and env validation
3. Sequence hardening
4. Workflow form/config hardening
5. Admin observability
6. Automated tests
7. CI/CD and release readiness

## Near-Term Recommended Tasks
### High priority
- Add tests around workflow branching and sequence execution
- Add env validation and startup health checks
- Add workflow action forms
- Add sequence schedule enforcement

### Medium priority
- Promote workflow/sequence tables into explicit schema management strategy
- Add admin queue/run inspection
- Improve task ownership and filtering

### Lower priority
- Expand visual parity with third-party workflow builders
- Add more analytics and audit views

## Definition of Done
The platform should be considered implementation-complete for the next milestone when:
- all major APIs are org-safe
- workflow and sequence engines have reliable logs and retries
- users can configure workflows and sequences without raw/generic inputs
- key product flows have automated test coverage
- deployment and migration steps are documented and repeatable
