# Database Backup and Restore

How to back up and restore the production SQLite database of any of the three apps
(`budget`, `synapse`, `mealplanner`).

## Quick reference

| Task                            | Command                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Trigger a backup                | `gh workflow run backup-database.yml -f app=<app>`                                                    |
| List recent backup runs         | `gh run list --workflow=backup-database.yml --limit 5`                                                |
| Download a backup               | `gh run download <run-id>`                                                                            |
| Restore a backup into local dev | Use the `restore-db-backup` Claude skill (`.claude/skills/restore-db-backup/`)                        |
| Emergency prod dump             | `flyctl ssh console -a <fly-app> -C "sqlite3 <db-path> .dump" > emergency-$(date +%Y%m%d-%H%M%S).sql` |
| Prod integrity check            | `flyctl ssh console -a <fly-app> -C "sqlite3 <db-path> 'PRAGMA integrity_check;'"`                    |

### Per-app values

| `app`         | Fly app                 | DB path in the container   |
| ------------- | ----------------------- | -------------------------- |
| `budget`      | `sheppakai-budget`      | `/data/sheppakaibudget.db` |
| `synapse`     | `synapse-dev`           | `/data/synapse.db`         |
| `mealplanner` | `sheppakai-mealplanner` | `/data/db.sqlite`          |

The workflow's "Resolve Fly app and database path" step is the source of truth for this
table.

## How backups work

One workflow, `.github/workflows/backup-database.yml`, serves all three apps.

- **Trigger**: manual only (`workflow_dispatch`), with a required `app` input. There is no
  schedule, so trigger one before deployments or big data changes.
- **Steps**: `flyctl ssh` dumps the database with `sqlite3 .dump`, then the dump is gzipped
  and GPG-encrypted (AES256) before upload. The workflow fails closed if the passphrase
  isn't set, so an unencrypted dump is never uploaded.
- **Artifact**: `db-backup-<app>-YYYY-MM-DD-HHMMSS`, containing one
  `backup-YYYY-MM-DD-HHMMSS.sql.gz.gpg` file.
- **Retention**: 5 days. Download any backup you want to keep longer.

### Required secrets

Both are secrets on the app's **GitHub Actions environment** (`budget`, `synapse` or
`mealplanner`). They are not Fly secrets and not app runtime env vars. See
[ENVIRONMENT.md](./ENVIRONMENT.md).

- `FLY_API_TOKEN`: lets `flyctl` pull the dump off the production machine.
- `BACKUP_ENCRYPTION_PASSPHRASE`: symmetric passphrase for the GPG encryption. Generate it
  with `openssl rand -base64 32` and set it with
  `gh secret set BACKUP_ENCRYPTION_PASSPHRASE --env <app>`. The same value must be in the
  app's local `.env` for the restore skill to decrypt.

### Failure monitoring

- A failed run opens a `[Automated] Database Backup Failure (<app>)` issue labelled
  `backup-failure`, assigned to whoever triggered it. The issue body contains only the run
  link, branch, commit, actor and timestamp. It never includes log output.
- The next successful backup for that app closes the issue with a comment.

## Downloading and decrypting a backup

```bash
# Find the run and download its artifact
gh run list --workflow=backup-database.yml --limit 5
gh run download <run-id>

# Decrypt, then decompress
printf '%s' "$BACKUP_ENCRYPTION_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback \
  --passphrase-fd 0 --decrypt --output backup.sql.gz backup-YYYY-MM-DD-HHMMSS.sql.gz.gpg
gunzip backup.sql.gz   # -> backup.sql
```

The decrypted `.sql` file holds full production data: password hashes, live session tokens
and every record. Keep it local, never commit it, and delete it when you're done.

## Restoring

### To local development

Use the `restore-db-backup` skill. It downloads the newest artifact for the app, decrypts
it with the passphrase from `apps/<app>/.env`, backs up your current local db, restores
the dump, runs `PRAGMA integrity_check` and prints row counts per table.

To do it by hand:

```bash
cd apps/<app>
cp <local-db> <local-db>.backup      # keep a copy first
rm <local-db>
sqlite3 <local-db> < backup.sql
sqlite3 <local-db> 'PRAGMA integrity_check;'
```

`<local-db>` is the path in that app's `DATABASE_URL` in `apps/<app>/.env`.

### To production (Fly.io)

⚠️ This overwrites the production database. Take a fresh dump first (step 2).

```bash
FLY_APP=<fly-app>   # see "Per-app values"
DB_PATH=<db-path>

# 1. Upload the SQL dump to the machine
cat backup.sql | flyctl ssh console -a "$FLY_APP" -C "cat > /tmp/restore.sql"

# 2. Dump the current production database, in case you need to roll back
flyctl ssh console -a "$FLY_APP" -C "sqlite3 $DB_PATH .dump" \
  > pre-restore-$(date +%Y%m%d-%H%M%S).sql

# 3. Build the restored db next to the live one, then check it
flyctl ssh console -a "$FLY_APP" -C "sh -c 'sqlite3 $DB_PATH.restore < /tmp/restore.sql'"
flyctl ssh console -a "$FLY_APP" -C "sqlite3 $DB_PATH.restore 'PRAGMA integrity_check;'"

# 4. Swap it in. Move the WAL/SHM files aside too (every app runs in WAL mode),
#    then restart straight away so the app reopens the new file.
flyctl ssh console -a "$FLY_APP" -C "sh -c 'mv $DB_PATH $DB_PATH.old; for s in -wal -shm; do [ -f $DB_PATH\$s ] && mv $DB_PATH\$s $DB_PATH.old\$s; done; mv $DB_PATH.restore $DB_PATH'"
flyctl apps restart "$FLY_APP"

# 5. Clean up once the app is healthy
flyctl ssh console -a "$FLY_APP" -C "rm /tmp/restore.sql"
```

`$DB_PATH.old` stays on the volume as a rollback copy. Delete it once you're confident in
the restore.

Alternative: build the db locally (`sqlite3 restored.db < backup.sql`), then upload it with
`flyctl ssh sftp shell -a "$FLY_APP"` → `put restored.db <db-path>`, and restart.

## Recovery targets

- **RTO**: under 30 minutes from deciding to restore (download about 2 min, restore 5–10 min,
  verification 5 min).
- **RPO**: the time since the last backup you triggered. Backups are manual only, so trigger
  one before deployments or big data changes.

## Restore testing

Test a restore every month, so you know the backups actually work:

1. Trigger a backup for each app, or pick a recent run.
2. Run the `restore-db-backup` skill against it. It covers decrypt, restore, integrity check
   and row counts.
3. Check that the row counts look right and the newest records are recent.
4. Optionally, run `pnpm --filter <app> dev` against the restored db and click through a few
   pages.

`apps/budget/scripts/test-restore.sh` and `apps/budget/scripts/check-backup-health.sh` are
older budget-only helpers. `test-restore.sh` takes a decrypted `.sql` or `.sql.gz` file and
queries budget's tables, so it won't work for the other apps.

## Troubleshooting

| Symptom                                          | Likely cause and fix                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `Backup file is empty or does not exist`         | Fly connectivity or an expired `FLY_API_TOKEN`. Check the run logs and `flyctl status -a <fly-app>`.      |
| `BACKUP_ENCRYPTION_PASSPHRASE secret is not set` | Set it on the app's GitHub environment (see "Required secrets").                                          |
| `gpg: decryption failed: Bad session key`        | Wrong passphrase. Check it matches the one on the app's GitHub environment.                               |
| `database is locked` during a restore            | You restored straight into the live file. Restore into `$DB_PATH.restore` and swap it in, as shown above. |
| `near line X: syntax error`                      | The dump is truncated or corrupt. Try another backup, or take a fresh one.                                |

## Security

- **This repo is public, so anyone with a GitHub account can download its Actions artifacts.**
  Only the GPG encryption protects the backups, so keep `BACKUP_ENCRYPTION_PASSPHRASE` long
  and random and never reuse it.
- Workflow run logs are public too. Don't add steps that echo database contents or secrets.
  GitHub masks registered secrets, but not values derived from them.
- Never commit backup files, encrypted or not.
- Rotate `FLY_API_TOKEN` if you think it has leaked. It gives SSH access to production.
