# Sequences Tab Documentation

## Overview

The Sequences tab is the outreach workflow area for the app. It lets users:

- create and edit outreach sequences
- define ordered steps with delays
- enroll contacts into a sequence
- run due steps
- review enrolled contacts and recent activity

The page lives at `/sequences` and is rendered by `src/app/(app)/sequences/SequencesClient.tsx`.

## What The Tab Does

A sequence is a saved outreach cadence made up of one or more steps. Each step has:

- a type
- a title
- a delay in days
- content or instructions

Supported step types:

- `automatic_email`
- `manual_email`
- `phone_call`
- `task`
- `linkedin_task`

Automatic email steps attempt to send email through SMTP. Manual and task-based steps create work items in the Tasks tab.

## Main Areas On The Page

### 1. Header Actions

- `Run Due Steps`: executes any active enrollments whose `next_run_at` is due
- `New Sequence`: starts a blank sequence draft

### 2. Summary Metrics

The top cards show:

- total sequences
- active sequences
- total enrolled contacts
- active contacts

### 3. Sequence Library

The left panel shows saved sequences with:

- name
- description
- status
- number of steps
- enrolled count
- active enrollment count

Users can:

- search sequences
- filter by status
- page through results
- click a sequence to open it in the builder

### 4. Sequence Builder

The main builder area lets users edit:

- sequence name
- status
- description
- schedule label
- timezone
- use local timezone flag

Available sequence actions:

- `Create Sequence` or `Save Changes`
- `Activate`
- `Pause`
- `Archive`

### 5. Steps

Each step supports:

- step type
- title
- delay days
- subject/body for email steps
- instructions for call/task/manual steps

Users can:

- add steps
- edit steps
- remove steps

The builder keeps at least one step in the sequence.

### 6. Enroll Contacts

Once a sequence exists, users can:

- search contacts
- select one or more contacts
- enroll them into the selected sequence

Contacts are loaded from `/api/contacts`.

### 7. Enrolled Contacts

This section shows each enrollment with:

- contact name
- email
- company
- current status
- current step
- next run time
- last activity time

Available enrollment actions:

- `Pause`
- `Resume`
- `Complete`
- `Stop`

### 8. Recent Activity

Recent sequence events are displayed here, such as:

- sequence created
- sequence updated
- contact enrolled
- email sent or simulated
- task created
- task completed
- sequence completed

## How To Use The Sequences Tab

### Create A Sequence

1. Open `Sequences` from the sidebar.
2. Click `New Sequence`.
3. Enter a sequence name.
4. Add an optional description.
5. Set the schedule label, timezone, and local-timezone option if needed.
6. Build the steps for the sequence.
7. Click `Create Sequence`.

### Add And Configure Steps

For each step:

1. Choose a step type.
2. Add a clear title.
3. Set `Delay Days`.
4. Fill in the content:
   - for email steps, provide subject and body
   - for manual/task steps, provide instructions

Behavior by type:

- `automatic_email`: sends or simulates an email when due
- `manual_email`: creates a task in the Tasks tab
- `phone_call`: creates a call task
- `task`: creates a generic task
- `linkedin_task`: creates a LinkedIn follow-up task

### Activate A Sequence

1. Save the sequence first.
2. Click `Activate`.

When a sequence becomes active:

- new enrollments are scheduled immediately
- existing active enrollments with no run date are assigned `NOW()`

### Enroll Contacts

1. Select an existing saved sequence.
2. Open the `Enroll Contacts` section.
3. Search and select contacts.
4. Click `Enroll`.

Notes:

- duplicate enrollments are ignored
- if the sequence is already active, the first run is scheduled immediately
- if the sequence is draft, paused, or archived, enrolled contacts are stored but not scheduled yet

### Run The Sequence

1. Make sure the sequence status is `active`.
2. Click `Run Due Steps`.

This processes up to 100 due enrollments in one run.

For automatic email steps:

- if SMTP is configured, the email is sent
- if SMTP is not configured, the send is simulated and logged

For manual/task steps:

- the system creates an open task in the Tasks tab
- the enrollment waits on that step until the task is completed

### Complete Manual Work

1. Open the `Tasks` page.
2. Find the task created by the sequence.
3. Mark the task as complete.

When the task is completed, the related enrollment advances to the next step if that task still matches the contact's current step.

### Manage Enrollments

Use the enrollment buttons to control a contact inside the sequence:

- `Pause`: sets the enrollment status to paused
- `Resume`: makes it active again and schedules it to run now
- `Complete`: marks the enrollment completed
- `Stop`: stops the enrollment manually

## Important Behavior Notes

### How To Configure SMTP

SMTP is configured through local environment variables in `.env.local`.

Required keys:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Example Gmail setup:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

Example Microsoft 365 setup:

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=you@yourdomain.com
SMTP_PASS=your-password
SMTP_FROM=you@yourdomain.com
```

Example SendGrid setup:

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=verified-sender@yourdomain.com
```

After updating `.env.local`, restart the Next.js dev server before testing sequence sends.

### SMTP Behavior

Automatic emails use the SMTP environment variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

If these are missing or still using placeholder values, automatic email steps are simulated instead of sent.

### Delay Rules

- delay days are clamped between `0` and `30`
- the next step is scheduled by adding `delayDays` to the current run time

### Contact Without Email

If an automatic email step runs for a contact without an email address:

- the email step is skipped
- an activity event is recorded
- the enrollment still advances to the next step

### Sequence Status Effects

- `draft`: saved, but not actively processed
- `active`: eligible for `Run Due Steps`
- `paused`: not processed by the runner
- `archived`: not processed by the runner

### Enrollment Pause Behavior

Pausing an enrollment stores a `paused_until` value 24 hours ahead, but the current implementation does not auto-resume based on that field. Resume is still a manual action.

### Task-Based Steps

Task-based steps do not advance immediately when the task is created. They advance after the generated task is marked complete from the Tasks page.

## Current Limitations

- sequence execution is manual from the UI or API; there is no built-in background scheduler in this project
- `scheduleName`, `timezone`, and `useLocalTimezone` are stored and shown in the UI, but they are not yet used to enforce send windows
- sequence records are stored in custom `app_*` tables through raw SQL, not Prisma models
- `send_from_user_id` is captured on enrollment but not currently used to switch SMTP senders

## Related Files

- `src/app/(app)/sequences/SequencesClient.tsx`
- `src/app/api/sequences/route.ts`
- `src/app/api/sequences/[sequenceId]/route.ts`
- `src/app/api/sequences/[sequenceId]/enroll/route.ts`
- `src/app/api/sequences/[sequenceId]/enrollments/[enrollmentId]/route.ts`
- `src/app/api/sequences/run-due/route.ts`
- `src/app/(app)/tasks/TasksClient.tsx`
- `src/app/api/tasks/[taskId]/route.ts`
- `src/lib/sequences-store.ts`
- `prisma/migrations/20260409_add_sequence_backend_tables/migration.sql`
