# External API (`/api/v1`)

A small JSON API for driving Synapse from outside the web UI. Authentication, the response envelope,
error codes, CORS and what's out of scope are shared with budget and documented in
[docs/API_CONVENTIONS.md](../../../docs/API_CONVENTIONS.md). This file covers what's specific to
synapse.

## Keys

- Created and revoked by an admin from **Admin → API Keys** (`/admin`).
- **Admin → API Logs** (`/admin`) shows the audit trail (who made each write, with which key, and
  what happened), so you can review external activity in the UI.
- Records are per user: a key only sees and changes its own user's records. Any other id returns
  `404`.

## Scopes

| Scope                  | Grants                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks:read`           | `GET /api/v1/tasks`, `GET /api/v1/tasks/{id}`                                                                                                                                             |
| `tasks:write`          | `POST /api/v1/tasks`, `PATCH /api/v1/tasks/{id}`                                                                                                                                          |
| `mood:read`            | `GET /api/v1/mood`                                                                                                                                                                        |
| `mood:write`           | `POST /api/v1/mood`                                                                                                                                                                       |
| `workouts:read`        | `GET /api/v1/workouts`, `GET /api/v1/workouts/{id}`                                                                                                                                       |
| `workouts:write`       | `POST /api/v1/workouts`, `PATCH /api/v1/workouts/{id}`                                                                                                                                    |
| `meals:read`           | `GET /api/v1/meals`, `GET /api/v1/meals/{id}`                                                                                                                                             |
| `meals:write`          | `POST /api/v1/meals`, `PATCH /api/v1/meals/{id}`                                                                                                                                          |
| `visits:read`          | `GET /api/v1/visits`, `GET /api/v1/visits/{id}`                                                                                                                                           |
| `visits:write`         | `POST /api/v1/visits`, `PATCH /api/v1/visits/{id}`                                                                                                                                        |
| `people:read`          | `GET /api/v1/people`                                                                                                                                                                      |
| `journal:read`         | `GET /api/v1/journal`, `GET /api/v1/journal/{id}`                                                                                                                                         |
| `journal:write`        | `POST /api/v1/journal`, `PATCH /api/v1/journal/{id}`                                                                                                                                      |
| `meditation:read`      | `GET /api/v1/meditation`                                                                                                                                                                  |
| `agenda:read`          | `GET /api/v1/agenda`                                                                                                                                                                      |
| `family-worship:read`  | `GET /api/v1/family-worship/topics`, `GET /api/v1/family-worship/plan`, `GET /api/v1/family-worship/sessions`                                                                             |
| `family-worship:write` | `PUT`/`DELETE /api/v1/family-worship/plan/{weekStart}`, `POST /api/v1/family-worship/sessions`, `PATCH /api/v1/family-worship/sessions/{id}`, `POST /api/v1/family-worship/skipped-weeks` |

`people:read` exists mainly to resolve a `personId` for the visits endpoints — a visit is tied to an
existing person record, not a free-text name.

## Endpoints

### Tasks

`GET /api/v1/tasks` — requires `tasks:read`. Query params (all optional): `state`
(`new`/`in_progress`/`on_hold`/`blocked`/`done`), `priority` (1-4), `limit` (1-200, default 50).

`GET /api/v1/tasks/{id}` — requires `tasks:read`.

`POST /api/v1/tasks` — requires `tasks:write`. Body:

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{
    "title": "Renew passport",
    "description": "Expires next spring",
    "tags": ["errands", "urgent"],
    "dueDate": "2026-09-01",
    "priority": 2,
    "state": "new"
  }' \
  "https://synapse.example.com/api/v1/tasks"
```

`PATCH /api/v1/tasks/{id}` — requires `tasks:write`. Body is a partial update (any subset of the
`POST` fields). Returns `200` with the updated task.

### Mood

`GET /api/v1/mood` — requires `mood:read`. Query params: `startDate`/`endDate` (`YYYY-MM-DD`, must
be given together).

`POST /api/v1/mood` — requires `mood:write`. There's at most one mood log per day, so this always
creates-or-updates the entry for `date`:

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{ "date": "2026-08-25", "mood": "happy", "notes": "Slept well" }' \
  "https://synapse.example.com/api/v1/mood"
```

### Workouts

`GET /api/v1/workouts` — requires `workouts:read`. Query params: `startDate`/`endDate`, `type`,
`limit` (1-200, default 50).

`GET /api/v1/workouts/{id}` — requires `workouts:read`. Returns the workout with its `exercises`
array.

`POST /api/v1/workouts` — requires `workouts:write`. Body:

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{
    "date": "2026-08-25",
    "time": "07:30",
    "type": "strength",
    "durationMinutes": 45,
    "exercises": [{ "exerciseName": "Squat", "sets": 3, "reps": 5, "weightLbs": 185 }]
  }' \
  "https://synapse.example.com/api/v1/workouts"
```

`PATCH /api/v1/workouts/{id}` — requires `workouts:write`. Passing `exercises` replaces the
workout's full exercise list.

### Meals

`GET /api/v1/meals` — requires `meals:read`. Query params: `startDate`/`endDate`, `timeOfDay`
(`breakfast`/`lunch`/`dinner`/`snack`), `limit` (1-200, default 50).

`GET /api/v1/meals/{id}` — requires `meals:read`.

`POST /api/v1/meals` — requires `meals:write`. Body:

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{ "date": "2026-08-25", "timeOfDay": "lunch", "description": "Chicken salad", "caloriesEstimate": 450 }' \
  "https://synapse.example.com/api/v1/meals"
```

`PATCH /api/v1/meals/{id}` — requires `meals:write`.

### People

`GET /api/v1/people` — requires `people:read`. Query params: `includeArchived` (`true`/`false`,
default `false`). Returns `{ id, name, isArchived, scheduledVisitDate }` for each person — use the
`id` as `personId` when creating a visit. `scheduledVisitDate` is the member's **Next Visit**, the
one place it is stored.

```bash
curl -H "Authorization: Bearer sk_live_xxx" "https://synapse.example.com/api/v1/people"
```

### Visits

`GET /api/v1/visits` — requires `visits:read`. Query params: `personId` (optional), `limit` (1-200,
default 50).

`GET /api/v1/visits/{id}` — requires `visits:read`.

`POST /api/v1/visits` — requires `visits:write`. Body:

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{
    "personId": "abc123",
    "date": "2026-08-25",
    "companions": ["Alex"],
    "notes": "Coffee catch-up",
    "followUpDate": "2026-09-25"
  }' \
  "https://synapse.example.com/api/v1/visits"
```

`followUpDate` sets the group member's Next Visit (`scheduledVisitDate` on `/people`). Logging a
visit always replaces it, so leaving `followUpDate` out clears the member's Next Visit.

`PATCH /api/v1/visits/{id}` — requires `visits:write`. A `followUpDate` in the body sets the
member's Next Visit, `null` clears it, and leaving it out keeps it.

`followUpDate` is write-only: visits don't store it, so visit responses don't include it. Read the
member's Next Visit from `scheduledVisitDate` on `GET /api/v1/people`.

### Journal

`GET /api/v1/journal` — requires `journal:read`. Query params: `startDate`/`endDate` (`YYYY-MM-DD`,
must be given together), `content` (substring match), `limit` (1-200, default 50).

`GET /api/v1/journal/{id}` — requires `journal:read`.

`POST /api/v1/journal` — requires `journal:write`. Multiple entries per day are allowed (unlike
`/mood`, this always creates a new entry rather than upserting). Body:

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{
    "date": "2026-08-25",
    "content": "Went for a long walk along the river.",
    "location": "Riverside Park",
    "weatherTemp": 72,
    "weatherCondition": "sunny"
  }' \
  "https://synapse.example.com/api/v1/journal"
```

`PATCH /api/v1/journal/{id}` — requires `journal:write`.

### Meditation

`GET /api/v1/meditation` — requires `meditation:read`. Lists completed sessions, newest first. Query
params: `startDate`/`endDate` (`YYYY-MM-DD`, must be given together; inclusive Pacific calendar
days, matched against `completedAt`), `limit` (1-200, default 50). Each session includes its
routine:

```json
{
	"id": "abc123",
	"completedAt": "2026-08-25T14:30:00.000Z",
	"preMoodRating": 2,
	"moodRating": 4,
	"notes": "Calmer afterwards",
	"routine": { "title": "Morning breath", "durationMinutes": 10 }
}
```

Read-only for now: log sessions from the web UI.

### Daily Agenda

`GET /api/v1/agenda` — requires `agenda:read`. Returns one day's agenda in display order. Query
param (optional): `date` (`YYYY-MM-DD`, Pacific calendar day; defaults to today). Recurring
(template) items for that day are created on first read, the same as opening the day in the web UI.

```bash
curl -H "Authorization: Bearer sk_live_xxx" "https://synapse.example.com/api/v1/agenda?date=2026-11-11"
```

```json
{
	"date": "2026-11-11",
	"entries": [
		{
			"id": "abc123",
			"title": "Stretch",
			"sourceType": "default",
			"completed": false,
			"completedAt": null
		}
	]
}
```

`sourceType` is `default` for an item from a recurring template and `custom` for a one-off item.
Read-only: check items off from the web UI.

### Family Worship

Terms (Topic, Topic Queue, Planned Week, Skipped Week, Usual Weekday) are defined in the Family
Worship section of [GLOSSARY.md](../GLOSSARY.md). A week is named by its Monday (`weekStart`,
`YYYY-MM-DD`, Pacific calendar). The rules are the same as in the web UI: these routes are thin
adapters over the Family Worship module.

`GET /api/v1/family-worship/topics` — requires `family-worship:read`. Active topics in Topic Queue
order, front first: `id`, `title`, `description`, `notes`, `scriptureReferences`,
`publicationLinks`, `queuePosition`.

`GET /api/v1/family-worship/plan` — requires `family-worship:read`. Query params (optional): `weeks`
(1-26, default 8: this week plus the next 7) and `lookbackWeeks` (0-12, default 4: past weeks shown
only while unlogged). One row per week:

```json
{
	"weekStart": "2026-11-23",
	"date": "2026-11-25",
	"isCurrent": true,
	"isPast": false,
	"plannedTopic": { "id": "t1", "title": "Psalm 23" },
	"session": null,
	"skip": null,
	"suggestion": null
}
```

`date` is the week's Usual Weekday. `suggestion` is the next topic from the Topic Queue for an empty
current or upcoming week; it is computed on read, not stored.

`PUT /api/v1/family-worship/plan/{weekStart}` — requires `family-worship:write`. Body:
`{ "topicId": "t1" }`. Plans an active topic for the week, replacing any planned topic.
`DELETE /api/v1/family-worship/plan/{weekStart}` clears the week's plan; its topic goes back to the
front of the queue.

`GET /api/v1/family-worship/sessions` — requires `family-worship:read`. Sessions newest first. Query
params (optional): `topicId`, `limit` (1-200, default 50).

`POST /api/v1/family-worship/sessions` — requires `family-worship:write`. Returns the session (201).

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{
    "date": "2026-11-25",
    "topicId": "t1",
    "note": "Good questions from the kids",
    "continueNextWeek": false
  }' \
  "https://synapse.example.com/api/v1/family-worship/sessions"
```

Optional flags: `confirmUnskip` (must be `true` to log into a Skipped Week; this removes the skip),
`continueNextWeek` (plan the same topic for next week) and `nextWeekConflict` (`"replace"` or
`"shift"`, needed when next week already holds a different topic).

`PATCH /api/v1/family-worship/sessions/{id}` — requires `family-worship:write`. Any of `date`,
`topicId`, `note` (`null` clears it), plus `confirmUnskip` when moving into a Skipped Week.

`POST /api/v1/family-worship/skipped-weeks` — requires `family-worship:write`. Body:
`{ "weekStart": "2026-11-30", "reason": "Convention" }` (`reason` optional). The week's planned
topic goes back to the front of the queue.

Rule violations return an error with an `error.reason`, so a client can explain what went wrong and
how to fix it:

| Status | `error.code`        | `error.reason`          | When                                                                               |
| ------ | ------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| 400    | `validation_failed` | `invalid_week`          | `weekStart` isn't a Monday                                                         |
| 400    | `validation_failed` | `future_date`           | A session dated after today                                                        |
| 404    | `not_found`         | `not_found`             | Unknown or archived topic, or unknown session                                      |
| 409    | `conflict`          | `week_has_session`      | The week already has a session (one per week)                                      |
| 409    | `conflict`          | `week_skipped`          | Planning a Skipped Week, or logging into one without `confirmUnskip`               |
| 409    | `conflict`          | `next_week_conflict`    | `continueNextWeek` while next week holds another topic, without `nextWeekConflict` |
| 409    | `conflict`          | `next_week_skipped`     | `continueNextWeek` into a Skipped Week                                             |
| 409    | `conflict`          | `next_week_has_session` | `continueNextWeek` into a week that already has a session                          |

Topics are managed in the web UI: there's no API to create, archive, reorder or delete them.

## Out of scope

Beyond the [shared list](../../../docs/API_CONVENTIONS.md#out-of-scope): there are no delete
endpoints, apart from clearing a Family Worship week's plan. Delete records from the web UI.
