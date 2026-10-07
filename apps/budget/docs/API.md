# External API (`/api/v1`)

A small JSON API for driving sheppakai-budget from outside the web UI. Authentication,
the response envelope, error codes, CORS and what's out of scope are shared with synapse and
documented in [docs/API_CONVENTIONS.md](../../../docs/API_CONVENTIONS.md). This file covers
what's specific to budget.

## Keys

Created and revoked by an admin from **Admin → API Keys** (`/admin/api-keys`).

## Scopes

| Scope                           | Grants                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `transactions:read`             | `GET /api/v1/transactions`                                                              |
| `transactions:write`            | `POST /api/v1/transactions`                                                             |
| `budgets:read`                  | `GET /api/v1/budgets`                                                                   |
| `categories:read`               | `GET /api/v1/categories`                                                                |
| `dashboard:read`                | `GET /api/v1/dashboard`                                                                 |
| `income:read`                   | `GET /api/v1/income`                                                                    |
| `income:write`                  | `POST /api/v1/income`                                                                   |
| `recurring:read`                | `GET /api/v1/recurring`                                                                 |
| `recurring:markPaid`            | `PATCH /api/v1/recurring/:id`                                                           |
| `windowCleaningCustomers:read`  | `GET /api/v1/window-cleaning/customers`                                                 |
| `windowCleaningCustomers:write` | `POST /api/v1/window-cleaning/customers`, `PATCH /api/v1/window-cleaning/customers/:id` |
| `windowCleaningJobs:read`       | `GET /api/v1/window-cleaning/jobs`                                                      |
| `windowCleaningJobs:write`      | `POST /api/v1/window-cleaning/jobs`                                                     |
| `contributions:write`           | `POST /api/v1/savings/goals/:id/contributions`                                          |

## Endpoints

### `GET /api/v1/transactions`

Requires `transactions:read`. Query parameters (all optional):

- `startDate` / `endDate` — `YYYY-MM-DD`, must be given together
- `categoryId`
- `limit` — only applies when no date range is given; 1-200, default 50

```bash
curl -H "Authorization: Bearer sk_live_xxx" \
  "https://budget.example.com/api/v1/transactions?startDate=2026-08-01&endDate=2026-08-31"
```

### `POST /api/v1/transactions`

Requires `transactions:write`. Body:

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{
    "amount": 42.50,
    "payee": "Grocery Store",
    "notes": "Weekly shop",
    "date": "2026-08-12",
    "categoryId": "cat_123",
    "excludedFromBudget": false
  }' \
  "https://budget.example.com/api/v1/transactions"
```

Returns `201` with the created transaction (including its resolved category and owner) on
success. Every write — successful or failed — is recorded in an internal audit log with the
key that made it, so activity from an external tool is traceable if something looks wrong.

### `GET /api/v1/budgets`

Requires `budgets:read`. Query parameters:

- `year` — required
- `month` — optional; when omitted, returns the whole year's budgets

```bash
curl -H "Authorization: Bearer sk_live_xxx" \
  "https://budget.example.com/api/v1/budgets?year=2026&month=8"
```

### `GET /api/v1/categories`

Requires `categories:read`. No parameters.

```bash
curl -H "Authorization: Bearer sk_live_xxx" "https://budget.example.com/api/v1/categories"
```

### `GET /api/v1/dashboard`

Requires `dashboard:read`. The same summary numbers the Dashboard page computes (totals,
budget progress, spending trends, savings goals). Query parameters:

- `mode` — `monthly` (default) or `yearly`
- `month` / `year` — for `mode=monthly`
- `year` / `view` (`current` or `full`) — for `mode=yearly`

```bash
curl -H "Authorization: Bearer sk_live_xxx" \
  "https://budget.example.com/api/v1/dashboard?mode=monthly&month=8&year=2026"
```

### `GET /api/v1/income`

Requires `income:read`. Query parameters (all optional):

- `startDate` / `endDate` — `YYYY-MM-DD`, must be given together
- `month` / `year` — `year` is required when `month` is given
- `limit` — only applies when no date range or month/year is given; 1-200, default 50

```bash
curl -H "Authorization: Bearer sk_live_xxx" \
  "https://budget.example.com/api/v1/income?month=8&year=2026"
```

### `POST /api/v1/income`

Requires `income:write`. Body:

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{
    "name": "Freelance payment",
    "description": "Invoice #42",
    "date": "2026-08-12",
    "amount": 500
  }' \
  "https://budget.example.com/api/v1/income"
```

### `GET /api/v1/recurring`

Requires `recurring:read`. No parameters — returns every recurring expense.

```bash
curl -H "Authorization: Bearer sk_live_xxx" "https://budget.example.com/api/v1/recurring"
```

### `PATCH /api/v1/recurring/:id`

Requires `recurring:markPaid` — a narrower scope than a general write, so a key can be
issued that only toggles paid status. Body:

```bash
curl -X PATCH -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{ "paid": true }' \
  "https://budget.example.com/api/v1/recurring/rec_123"
```

Returns `404` (`not_found`) if the id doesn't exist.

### `GET /api/v1/window-cleaning/customers`

Requires `windowCleaningCustomers:read`. No parameters — returns every active (non-deleted)
customer.

```bash
curl -H "Authorization: Bearer sk_live_xxx" \
  "https://budget.example.com/api/v1/window-cleaning/customers"
```

### `POST /api/v1/window-cleaning/customers`

Requires `windowCleaningCustomers:write`. Body:

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "address": "123 Main St",
    "city": "Vancouver"
  }' \
  "https://budget.example.com/api/v1/window-cleaning/customers"
```

### `PATCH /api/v1/window-cleaning/customers/:id`

Requires `windowCleaningCustomers:write`. A full replace of the editable fields (matches
the UI's update behavior), not a partial patch. Returns `404` (`not_found`) if the id
doesn't exist.

```bash
curl -X PATCH -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "address": "456 Elm St",
    "city": "Vancouver"
  }' \
  "https://budget.example.com/api/v1/window-cleaning/customers/cust_123"
```

### `GET /api/v1/window-cleaning/jobs`

Requires `windowCleaningJobs:read`. Query parameters (all optional, applied in this
priority order):

- `customerId` — jobs for one customer
- `month` / `year` — `year` is required when `month` is given
- `year` — a whole year's jobs
- (none) — every job

```bash
curl -H "Authorization: Bearer sk_live_xxx" \
  "https://budget.example.com/api/v1/window-cleaning/jobs?customerId=cust_123"
```

### `POST /api/v1/window-cleaning/jobs`

Requires `windowCleaningJobs:write`. Body:

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_123",
    "jobDate": "2026-08-12",
    "amountCharged": 120,
    "tip": 20
  }' \
  "https://budget.example.com/api/v1/window-cleaning/jobs"
```

### `POST /api/v1/savings/goals/:id/contributions`

Requires `contributions:write`. Body:

```bash
curl -X POST -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "date": "2026-08-12",
    "description": "Monthly deposit"
  }' \
  "https://budget.example.com/api/v1/savings/goals/goal_123/contributions"
```

Returns `404` (`not_found`) if the goal id doesn't exist.
