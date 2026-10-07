# External API conventions (`/api/v1`)

Shared rules for the JSON APIs that `budget` and `synapse` expose to tools outside the web UI,
such as a personal AI assistant, a script or a future mobile client. Each app's own endpoint
list and scopes are in its `docs/API.md`:

- [apps/budget/docs/API.md](../apps/budget/docs/API.md)
- [apps/synapse/docs/API.md](../apps/synapse/docs/API.md)

The shared code is in `packages/shared`: `bearer-token.ts` parses the header and
`api-response.ts` builds the response envelope.

## Authentication

Every request must include:

```
Authorization: Bearer <key>
```

- The key is **only** ever read from the `Authorization` header. It is never accepted as a
  query parameter, and a browser session cookie is never accepted as a fallback. The two
  auth paths are fully independent.
- Keys are created and revoked by an admin in the app's web UI (each app's `API.md` says
  where). The plaintext key is shown exactly once, at creation time. Only a hash is stored,
  so if you lose a key, revoke it and create a new one.
- Each key is scoped to a specific set of permissions and can optionally expire. Give a key
  only the scopes for the endpoints it will call.
- Each key has its own rate limit. Requests beyond it return `429`.
- Every write, successful or failed, is recorded in an internal audit log with the key that
  made it, so you can trace what an external tool did.

## Response shape

Every response is one of exactly two shapes:

```jsonc
// Success
{ "data": /* endpoint-specific payload */ }

// Failure
{ "error": { "code": "some_code", "message": "Human-readable explanation" } }
```

| HTTP status | `error.code`                                             | Meaning                                                                                                                                                                              |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 401         | `missing_header` / `invalid_scheme` / `malformed_header` | No `Authorization` header, wrong scheme, or malformed value                                                                                                                          |
| 401         | `invalid_api_key`                                        | Key doesn't exist, is disabled, expired, or lacks the scope the endpoint requires (deliberately indistinguishable from an unknown key, so a caller can't probe which reason applies) |
| 404         | `not_found`                                              | The record named by the URL doesn't exist (in synapse, also when it belongs to another user)                                                                                         |
| 429         | `rate_limited`                                           | This key's rate limit or request quota was exceeded. Wait and retry                                                                                                                  |
| 400         | `validation_failed`                                      | Request body or query parameters failed validation                                                                                                                                   |
| 400         | `invalid_json`                                           | Request body wasn't valid JSON                                                                                                                                                       |
| 500         | `internal_error`                                         | Something went wrong server-side; check the server logs                                                                                                                              |

This is the JSON form of the form-action contract in
[ERROR_HANDLING_POLICY.md](./ERROR_HANDLING_POLICY.md).

## Common query parameters

- `startDate` / `endDate`: `YYYY-MM-DD`, and must be given together.
- `limit`: 1–200, default 50.

## CORS

No `Access-Control-Allow-Origin` header is ever returned. The API is for server-to-server or
script use (curl, a backend job, an assistant's tool call), not for browser JavaScript on
another site.

## Out of scope

- OAuth2/third-party app authorization. API keys are enough for a single-user "give my own
  tool a key" setup.
- Write access to user/auth-management endpoints.
- Webhooks.
