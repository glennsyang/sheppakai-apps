---
name: restore-db-backup
description: Restore a Database Backup GitHub Actions artifact (a zip containing a gpg-encrypted SQL dump) into the local dev SQLite database for the budget, synapse, or mealplanner app. Use when the user has downloaded a db-backup-<app>-*.zip and wants to restore/reset their local dev db from it, or asks to "restore the backup", "load prod data locally", or similar for any of these three apps.
---

# Restore DB backup

All three apps share one `Database Backup` GitHub Actions workflow
(`.github/workflows/backup-database.yml`, dispatched with an `app` input): it dumps that
app's production SQLite db, gzips it, and GPG-encrypts it with the app environment's
`BACKUP_ENCRYPTION_PASSPHRASE` before uploading it as a `db-backup-<app>-<timestamp>`
artifact containing one `backup-<timestamp>.sql.gz.gpg` file. See
`apps/budget/docs/BACKUP_RESTORE.md` for the full backup/restore design.

This skill fetches that artifact, decrypts, decompresses, and restores the dump into the
app's local dev db in one step.

## Running it

```bash
<skill-dir>/scripts/restore-db-backup.sh --app <budget|synapse|mealplanner> [--zip <path>]
```

Replace `<skill-dir>` with this skill's own base directory (shown when the skill loads).
The script finds the monorepo root from its own location and restores into `apps/<app>`.

By default the script uses `gh` to find the newest unexpired `db-backup-<app>-*` artifact
and downloads it directly — no manual step in the Actions UI needed. It filters by
artifact name, not by latest run, because one workflow serves every app. It falls back to
the newest `db-backup-<app>-*.zip` in `~/Downloads` if `gh` isn't installed/authed, or has
no matching artifact. Pass `--zip <path>` to force using a specific
zip (e.g. one downloaded manually) instead of fetching via `gh`.

**Run it twice.** The first run (no `--yes`) is a dry run: it unzips, decrypts, decompresses,
saves the resulting `.sql` file into `~/Downloads/SheppakaiBudget-Backups/`, and prints
what it *would* do to the local db without touching it. Show that output to the user and
confirm before re-running with `--yes` — replacing a local dev db is reversible (see
below) but still worth a beat before doing it, especially if they weren't expecting it to
wipe out uncommitted local test data.

```bash
<skill-dir>/scripts/restore-db-backup.sh --app budget --yes
```

With `--yes`, it backs up the existing local db alongside itself
(`<db>.backup-<timestamp>`) before replacing it — never deletes without a copy — then
restores the dump into a fresh db file, runs `PRAGMA integrity_check`, and prints a row
count per table so you can eyeball that the restore looks sane. Table names come from
`sqlite_master` at runtime rather than being hardcoded, since the three apps have
different schemas.

## Where things come from

Each app's own `apps/<app>/.env` supplies both `DATABASE_URL` (the local db path, relative
to the app directory) and `BACKUP_ENCRYPTION_PASSPHRASE` — the script reads them from there
rather than hardcoding per-app values, so an app's local db path or passphrase changing
doesn't require touching this skill. If either is missing from that `.env`, the script fails
fast with a clear error rather than guessing.

## The decrypted `.sql` file is sensitive

The dump contains full production data — password hashes, live session tokens, all
financial/personal records. It's written unencrypted to
`~/Downloads/SheppakaiBudget-Backups/<app>-backup-<timestamp>.sql` (that folder name is
intentionally shared across all three apps, each file prefixed by app name). Don't
upload, paste, or otherwise move that file anywhere else. It's fine to periodically clear
out old ones — the underlying encrypted `.zip` in `~/Downloads` is what to keep for
long-term retention.
