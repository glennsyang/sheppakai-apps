# Sheppakai Budget

Sheppakai Budget is a full-stack personal finance and small business management app built as a portfolio project. It combines household budgeting with business workflows in one clean interface: track spending, monitor goals, manage recurring items, and stay on top of day-to-day financial decisions.

## Features ✨

- **Authentication** — Invite-only (admin-created accounts, `ALLOWED_EMAILS` allowlist), sign in, sign out, email verification, and password reset
- **Dashboard** — Visual overview of income, expenses, and budget progress
- **Budget Management** — Set monthly budgets per category, see over-budget alerts
- **Transactions** — Filterable expense/income table by date and category
- **Income Tracking** — Log and manage multiple income sources
- **Savings Goals** — Create and track savings goals with contribution history
- **Recurring Expenses** — Configure and auto-reset recurring monthly expenses
- **Receipts** — Separate tracking for fuel and business receipts
- **Window Cleaning** — Customer management and job tracking for a window cleaning business
- **Weekly Email Summaries** — Automated weekly financial summary emails
- **Admin Dashboard** — User management, archived goals, deleted customer recovery, API key management
- **External API** — Scoped, revocable API keys for driving the app from external tools (see [API.md](./docs/API.md))
- **Dark Mode** — Full light/dark theme support
- **PWA** — Installable as a standalone app with offline support
- **Error Monitoring** — Sentry integration

## Tech Stack

| Layer          | Technology              |
| -------------- | ----------------------- |
| Framework      | SvelteKit 2 / Svelte 5  |
| Styling        | Tailwind CSS 4          |
| UI Components  | bits-ui / shadcn-svelte |
| Forms          | Superforms + Zod        |
| Database       | SQLite via Drizzle ORM  |
| Authentication | Better Auth             |
| Email          | Brevo                   |
| Charts         | Layerchart (D3-based)   |
| Monitoring     | Sentry                  |
| Testing        | Vitest + Playwright     |
| Linting        | Oxlint + Oxfmt          |

## What This Project Demonstrates

- Building and shipping a production-style SvelteKit application end to end
- Designing reusable UI systems with component-driven architecture
- Modeling real-world financial workflows in a relational database
- Implementing authentication, validation, and robust form handling
- Maintaining code quality with automated formatting, linting, and tests

## Running Locally

This project is developer-ready and runs locally with a standard Node setup.

### Prerequisites

- **Node.js 22.23.3** (required for better-sqlite3 compatibility)
  - Optional with nvm: `nvm use 22.23.3`
- **pnpm 10** (this repo is a pnpm workspace; `corepack enable` picks the pinned version)

### Installation

1. **Install dependencies** (from the repo root)

   ```bash
   pnpm install
   ```

2. **Create your env file** (from `apps/budget`)

   ```bash
   cp .env.example .env
   ```

3. **Run database migrations**

   ```bash
   pnpm db:migrate
   ```

4. **Start the dev server**

   ```bash
   pnpm dev
   ```

   From the repo root, `pnpm --filter sheppakai-budget dev` does the same.

5. **Open http://localhost:5173**

### Common Scripts

Run these from `apps/budget`:

```bash
pnpm fmt              # Format code with Oxfmt
pnpm lint             # Run Oxlint and static analysis checks
pnpm check:all        # Format, lint, and test in one pass
pnpm db:generate      # Generate Drizzle schema types
pnpm db:migrate       # Run database migrations
pnpm db:studio        # Open Drizzle Studio (database browser)
pnpm test             # Run unit tests
```

## Additional Documentation

- [API.md](./docs/API.md) for the external `/api/v1` JSON API
- [ENVIRONMENT.md](./docs/ENVIRONMENT.md) for every environment variable the app uses
- Repo-wide docs in [`docs/`](../../docs/) at the repo root: backup and restore, CSP, Sentry,
  error handling, API conventions and shared environment variables
