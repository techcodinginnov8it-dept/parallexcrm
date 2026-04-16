# Parallex CRM Codebase Guide

## Top-Level Structure
### Root
- `package.json`
- `tsconfig.json`
- `next.config.js`
- `.env`, `.env.local`
- `implementation_plan.md`
- `knowledgebase.md`
- `codebase.md`

### Main directories
- `src/`
- `prisma/`
- `scripts/`
- `docs/`

## `src/` Layout
### `src/app/`
Primary Next.js App Router tree.

#### Route groups
- `src/app/(auth)/`
- `src/app/(app)/`

#### Global app shell
- `src/app/layout.tsx`
- `src/app/globals.css`

### `src/components/`
Reusable UI and layout components.

Important subareas:
- `layout/`
- `contacts/`
- `ui/`

### `src/lib/`
Server-side and shared logic.

Important files:
- `api-utils.ts`
- `db.ts`
- `lead-utils.ts`
- `sequences-store.ts`
- `workflow-engine.ts`
- `workflows-store.ts`
- `visitor-analytics.ts`
- `supabase/`
- `scrapers/`

### `src/pages/`
Legacy Pages Router support files:
- `_app.tsx`
- `_document.tsx`

These coexist with App Router.

## Authenticated App Pages
Located in `src/app/(app)/`.

### Core pages
- `page.tsx`: dashboard/home
- `prospect/page.tsx`: prospecting interface
- `contacts/page.tsx`
- `companies/page.tsx`
- `leads/page.tsx`
- `tasks/page.tsx`
- `sequences/page.tsx`
- `plays/page.tsx`: workflows UI
- `analytics/page.tsx`
- `settings/page.tsx`

### Client-heavy pages
Several pages split server route + client component:
- `ContactsClient.tsx`
- `CompaniesClient.tsx`
- `LeadsClient.tsx`
- `TasksClient.tsx`
- `SequencesClient.tsx`
- `SettingsClient.tsx`

## API Surface
Located in `src/app/api/`.

### CRM APIs
- `contacts/route.ts`
- `contacts/import/route.ts`
- `companies/route.ts`
- `leads/route.ts`
- `leads/convert/route.ts`
- `leads/cleanup/route.ts`
- `tasks/route.ts`
- `tasks/[taskId]/route.ts`

### Prospecting APIs
- `prospect/search/route.ts`
- `prospect/enrich/route.ts`
- `prospect/save/route.ts`
- `prospect/scrape-emails/route.ts`
- `prospect/history/route.ts`
- `prospect/history/[searchId]/route.ts`

### Sequence APIs
- `sequences/route.ts`
- `sequences/[sequenceId]/route.ts`
- `sequences/[sequenceId]/enroll/route.ts`
- `sequences/[sequenceId]/enrollments/[enrollmentId]/route.ts`
- `sequences/run-due/route.ts`

### Workflow APIs
- `workflows/route.ts`
- `workflows/[workflowId]/route.ts`
- `workflows/run/route.ts`
- `workflow-runs/route.ts`
- `workflow-logs/route.ts`
- `events/route.ts`
- `webhooks/[workflowId]/route.ts`
- `cron/process-workflows/route.ts`

### User/admin/system APIs
- `user/me/route.ts`
- `user/presence/route.ts`
- `admin/users/route.ts`
- `app/usage/route.ts`
- `visitor/track/route.ts`

## Key Back-End Modules
### `src/lib/api-utils.ts`
Responsibilities:
- resolve current authenticated user
- auto-provision organization/user when needed
- expose auth helpers like unauthorized/forbidden responses

Use this file whenever building new org-scoped routes.

### `src/lib/db.ts`
Responsibilities:
- initialize Prisma client with PostgreSQL adapter
- provide singleton client behavior

This is the main DB entry point.

### `src/lib/lead-utils.ts`
Responsibilities:
- dedupe key generation
- website normalization
- tag inference
- merge utilities for lead/prospect processing

### `src/lib/sequences-store.ts`
Responsibilities:
- ensure sequence tables
- list/create/update/archive sequences
- enroll contacts
- update enrollment status
- create sequence tasks
- process due sequence steps
- progress enrollments on task completion

This is the sequence engine and task backend.

### `src/lib/workflow-engine.ts`
Responsibilities:
- ensure workflow tables
- workflow CRUD support helpers
- workflow step persistence
- run creation
- queue processing
- trigger handling
- step execution
- run and log listing

This is the workflow engine.

### `src/lib/workflows-store.ts`
Auxiliary workflow storage/adapter layer. Keep an eye on overlap with `workflow-engine.ts` when refactoring.

## Scraper Layer
Located in `src/lib/scrapers/`.

### Files
- `browser-launcher.ts`
- `google-maps-scraper.ts`
- `business-email-scraper.ts`

These power prospect discovery and enrichment.

## Prisma and Data
### `prisma/schema.prisma`
Defines the core business entities used by Prisma:
- organizations
- teams
- users
- contacts
- companies
- search queries
- prospects
- leads

### `prisma/migrations/`
Contains sequence SQL migration material.

### `docs/workflows-schema.sql`
Documents workflow table shape.

## Important Cross-Cutting Flows
### Login to app access
1. Supabase session is resolved.
2. `getCurrentUser()` maps that session to the app DB.
3. Missing app users/orgs can be provisioned automatically.
4. `(app)` layout redirects unauthenticated users to `/login`.

### Prospect search flow
1. Request hits `/api/prospect/search`.
2. Route checks lead cache.
3. If needed, scraper runs.
4. Results are ranked/deduped.
5. Prospect-style payload returns to UI.

### Sequence execution flow
1. User creates sequence and enrolls contacts.
2. Enrollment row stores current step and next run time.
3. `/api/sequences/run-due` calls sequence engine.
4. Engine sends/simulates email or creates tasks.
5. Enrollment advances or waits on manual completion.

### Workflow execution flow
1. Trigger comes from event, webhook, schedule, or manual run.
2. Workflow run is created.
3. Queue inserts step 0.
4. Cron/manual processor picks due queue items.
5. `executeWorkflowStep()` evaluates or executes the step.
6. Logs and next queue items are written back to DB.

## Front-End Styling
### `src/app/globals.css`
Large shared stylesheet for:
- app shell
- tables
- forms
- sequences UI
- workflows builder

Workflow and sequence UI currently rely heavily on this global stylesheet.

## Architectural Notes
### Mixed App Router and legacy Pages Router
The app mainly uses App Router, but still contains:
- `src/pages/_app.tsx`
- `src/pages/_document.tsx`

### Mixed ORM and raw SQL usage
The codebase combines:
- Prisma delegate calls for core business entities
- raw SQL for automation engines and reporting-style queries

This is workable, but contributors need to be deliberate when changing schemas.

## Where to Start as a Developer
### For UI work
1. `src/app/(app)/layout.tsx`
2. target page under `src/app/(app)/...`
3. related client component
4. `src/app/globals.css`

### For API work
1. target route under `src/app/api/...`
2. `src/lib/api-utils.ts`
3. `src/lib/db.ts`
4. feature engine/store file in `src/lib/`

### For automation work
1. `src/lib/sequences-store.ts`
2. `src/lib/workflow-engine.ts`
3. sequence/workflow API routes
4. `src/app/(app)/sequences/SequencesClient.tsx`
5. `src/app/(app)/plays/page.tsx`

## Recommended Refactor Targets
- consolidate workflow store/engine boundaries
- document raw SQL table ownership more explicitly
- reduce large-route complexity in prospect APIs
- introduce feature-level tests around automation engines
