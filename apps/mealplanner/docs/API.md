# External API (`/api/v1`)

A small JSON API for driving Meal Planner from outside the web UI. Authentication, the response
envelope, error codes, CORS and what's out of scope are shared with budget and synapse and
documented in [docs/API_CONVENTIONS.md](../../../docs/API_CONVENTIONS.md). This file covers what's
specific to mealplanner.

## Keys

- Created and revoked by an admin from **Admin → API keys** (`/admin/api-keys`).
- **Admin → API logs** (`/admin/api-logs`) shows the audit trail: who made each write, with which
  key, and the status it got.
- Banning or demoting an admin disables every key they own.

## Data visibility model (important)

Mealplanner's API is intentionally **shared-household**, not user-isolated, matching the app (see
`apps/mealplanner/CLAUDE.md`, "Product Data-Sharing Model"):

- Any authorized key sees and changes the one shared pantry, recipe box and weekly planner.
- `userId` on a record only says who created it. Records created through the API get the key owner's
  id.

## Scopes

| Scope           | Grants                                                                              |
| --------------- | ----------------------------------------------------------------------------------- |
| `pantry:read`   | `GET /api/v1/pantry`, `GET /api/v1/pantry/{id}`                                     |
| `pantry:write`  | `POST /api/v1/pantry`, `PATCH /api/v1/pantry/{id}`, `DELETE /api/v1/pantry/{id}`    |
| `recipes:read`  | `GET /api/v1/recipes`, `GET /api/v1/recipes/{id}`                                   |
| `recipes:write` | `POST /api/v1/recipes`, `PATCH /api/v1/recipes/{id}`, `DELETE /api/v1/recipes/{id}` |
| `plans:read`    | `GET /api/v1/plans`                                                                 |
| `plans:write`   | `PUT /api/v1/plans/{week}/days/{day}`, `DELETE /api/v1/plans/{week}/days/{day}`     |
| `suggest:write` | `POST /api/v1/suggestions`                                                          |

## Endpoints

### Pantry

`GET /api/v1/pantry` — requires `pantry:read`. Every pantry item.

`GET /api/v1/pantry/{id}` — requires `pantry:read`.

`POST /api/v1/pantry` — requires `pantry:write`. Body: `name` (1-100 chars, required), `quantity`
(positive number or `null`), `unit` (up to 30 chars or `null`). Returns `201` with the item.

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{ "name": "Chicken thighs", "quantity": 1.5, "unit": "kg" }' \
  "https://mealplanner.example.com/api/v1/pantry"
```

`PATCH /api/v1/pantry/{id}` — requires `pantry:write`. Any of the `POST` fields; at least one.

`DELETE /api/v1/pantry/{id}` — requires `pantry:write`. Returns `{ "id": "…" }`.

### Recipes

A recipe is returned as:

```jsonc
{
	"id": "…",
	"userId": "…",
	"name": "Lemon chicken",
	"description": "…",
	"ingredients": [{ "name": "chicken thighs", "quantity": "4", "unit": "" }],
	"instructions": ["Preheat the oven…"],
	"prepTimeMinutes": 40,
	"servings": 4,
	"source": "ai", // "ai" (saved from a suggestion) or "custom"
	"createdAt": "…",
	"updatedAt": "…"
}
```

`GET /api/v1/recipes` — requires `recipes:read`. Query parameters (optional): `source` (`ai` /
`custom`), `limit` (1-200, default 50). Most recently updated first.

`GET /api/v1/recipes/{id}` — requires `recipes:read`.

`POST /api/v1/recipes` — requires `recipes:write`. Body: `name` (required, up to 200 chars),
`description` (up to 2000, default `""`), `ingredients` (up to 50 `{ name, quantity, unit }`
strings, default `[]`), `instructions` (up to 50 strings, default `[]`), `prepTimeMinutes` (0-1440,
default 0), `servings` (1-100, default 1). Always saved with `source: "custom"`. Returns `201`.

`PATCH /api/v1/recipes/{id}` — requires `recipes:write`. Any of the `POST` fields; at least one.
`source` can't be changed.

`DELETE /api/v1/recipes/{id}` — requires `recipes:write`. **Also removes the recipe from every
planned day** (the plan entries cascade). Returns `{ "id": "…" }`.

### Meal plans

One shared plan per week, keyed on the week's Monday (`YYYY-MM-DD`). Days are numbered `0` (Monday)
to `6` (Sunday). A week is returned as:

```jsonc
{
	"weekStartDate": "2026-10-26",
	"days": [
		{
			"dayOfWeek": 0,
			"day": "Monday",
			"date": "2026-10-26",
			"entryId": "…",
			"recipe": {/* recipe */}
		},
		{ "dayOfWeek": 1, "day": "Tuesday", "date": "2026-10-27", "entryId": null, "recipe": null }
		// … always seven days
	]
}
```

`GET /api/v1/plans` — requires `plans:read`. Query parameter (optional): `week`, any `YYYY-MM-DD`
date; returns the week containing it. Defaults to the current week.

```bash
curl -H "Authorization: Bearer sk_live_xxx" \
  "https://mealplanner.example.com/api/v1/plans?week=2026-10-29"
```

`PUT /api/v1/plans/{week}/days/{day}` — requires `plans:write`. `{week}` must be a Monday. Body:
`{ "recipeId": "…" }`. Sets (or replaces) that day's dinner and returns the updated week. `404` if
the recipe doesn't exist.

`DELETE /api/v1/plans/{week}/days/{day}` — requires `plans:write`. Clears that day and returns the
updated week. `404` if nothing was planned.

### Suggestions

`POST /api/v1/suggestions` — requires `suggest:write`. Runs the same Gemini dinner suggestion as the
Suggest page. Body: `{ "items": ["chicken", "rice", "broccoli"] }` (1-15 pantry item names). Returns
`200` with an array of suggestions (`name`, `description`, `ingredients`, `steps`,
`prepTimeMinutes`, `servings`). Nothing is saved: save one with `POST /api/v1/recipes`, then plan it
with `PUT /api/v1/plans/…`.

Each call spends AI tokens, so this endpoint has its own limit of **10 requests per minute per key**
(`429 rate_limited` with a `Retry-After` header), on top of the general per-key limit.
