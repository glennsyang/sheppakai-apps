# External API (`/api/v1`)

A small JSON API for driving Synapse from outside the web UI. Authentication, the response
envelope, error codes, CORS and what's out of scope are shared with budget and documented in
[docs/API_CONVENTIONS.md](../../../docs/API_CONVENTIONS.md). This file covers what's specific
to synapse.

## Keys

- Created and revoked by an admin from **Admin → API Keys** (`/admin`).
- **Admin → API Logs** (`/admin`) shows the audit trail (who made each write, with which key,
  and what happened), so you can review external activity in the UI.
- Records are per user: a key only sees and changes its own user's records. Any other id
  returns `404`.

## Scopes

| Scope            | Grants                                                 |
| ---------------- | ------------------------------------------------------ |
| `tasks:read`     | `GET /api/v1/tasks`, `GET /api/v1/tasks/{id}`          |
| `tasks:write`    | `POST /api/v1/tasks`, `PATCH /api/v1/tasks/{id}`       |
| `mood:read`      | `GET /api/v1/mood`                                     |
| `mood:write`     | `POST /api/v1/mood`                                    |
| `workouts:read`  | `GET /api/v1/workouts`, `GET /api/v1/workouts/{id}`    |
| `workouts:write` | `POST /api/v1/workouts`, `PATCH /api/v1/workouts/{id}` |
| `meals:read`     | `GET /api/v1/meals`, `GET /api/v1/meals/{id}`          |
| `meals:write`    | `POST /api/v1/meals`, `PATCH /api/v1/meals/{id}`       |
| `visits:read`    | `GET /api/v1/visits`, `GET /api/v1/visits/{id}`        |
| `visits:write`   | `POST /api/v1/visits`, `PATCH /api/v1/visits/{id}`     |
| `people:read`    | `GET /api/v1/people`                                   |
| `journal:read`   | `GET /api/v1/journal`, `GET /api/v1/journal/{id}`      |
| `journal:write`  | `POST /api/v1/journal`, `PATCH /api/v1/journal/{id}`   |

`people:read` exists mainly to resolve a `personId` for the
visits endpoints — a visit is tied to an existing person record, not a free-text name.

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

`PATCH /api/v1/tasks/{id}` — requires `tasks:write`. Body is a partial update (any subset of
the `POST` fields). Returns `200` with the updated task.

### Mood

`GET /api/v1/mood` — requires `mood:read`. Query params: `startDate`/`endDate`
(`YYYY-MM-DD`, must be given together).

`POST /api/v1/mood` — requires `mood:write`. There's at most one mood log per day, so this
always creates-or-updates the entry for `date`:

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{ "date": "2026-08-25", "mood": "happy", "notes": "Slept well" }' \
  "https://synapse.example.com/api/v1/mood"
```

### Workouts

`GET /api/v1/workouts` — requires `workouts:read`. Query params: `startDate`/`endDate`,
`type`, `limit` (1-200, default 50).

`GET /api/v1/workouts/{id}` — requires `workouts:read`. Returns the workout with its
`exercises` array.

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

`GET /api/v1/meals` — requires `meals:read`. Query params: `startDate`/`endDate`,
`timeOfDay` (`breakfast`/`lunch`/`dinner`/`snack`), `limit` (1-200, default 50).

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
default `false`). Returns `{ id, name, isArchived, scheduledVisitDate }` for each person — use
the `id` as `personId` when creating a visit.

```bash
curl -H "Authorization: Bearer sk_live_xxx" "https://synapse.example.com/api/v1/people"
```

### Visits

`GET /api/v1/visits` — requires `visits:read`. Query params: `personId` (optional), `limit`
(1-200, default 50).

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

`PATCH /api/v1/visits/{id}` — requires `visits:write`.

### Journal

`GET /api/v1/journal` — requires `journal:read`. Query params: `startDate`/`endDate`
(`YYYY-MM-DD`, must be given together), `content` (substring match), `limit` (1-200,
default 50).

`GET /api/v1/journal/{id}` — requires `journal:read`.

`POST /api/v1/journal` — requires `journal:write`. Multiple entries per day are allowed
(unlike `/mood`, this always creates a new entry rather than upserting). Body:

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

## Out of scope

Beyond the [shared list](../../../docs/API_CONVENTIONS.md#out-of-scope): there are no delete
endpoints. Delete records from the web UI.
