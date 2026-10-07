#!/usr/bin/env bash
# Unzip -> gpg-decrypt -> gunzip -> restore a Database Backup workflow artifact
# into one app's local dev SQLite db. See ../SKILL.md for usage.
set -euo pipefail

DOWNLOADS="$HOME/Downloads"
SQL_ARCHIVE_DIR="$DOWNLOADS/SheppakaiBudget-Backups"
MONO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"

APPLY=0
APP=""
ZIP_ARG=""

usage() {
  cat <<'EOF'
Usage: restore-db-backup.sh --app <budget|synapse|mealplanner> [--zip <path>] [--yes]

  --app    Which app's local dev db (apps/<app>) to restore into.
  --zip    Path to the backup zip. Defaults to downloading the latest
           db-backup-<app>-* artifact via `gh` (falls back to the newest
           db-backup-<app>-*.zip in ~/Downloads if `gh` isn't available or
           has no unexpired artifact for that app).
  --yes    Actually perform the restore (back up + replace the local db).
           Without this flag, the script only unzips/decrypts and prints
           what it WOULD do -- run it once without --yes, review, then
           re-run with --yes.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --app|--repo) APP="$2"; shift 2 ;;
    --zip) ZIP_ARG="$2"; shift 2 ;;
    --yes) APPLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [ -z "$APP" ]; then
  echo "Error: --app is required." >&2
  usage >&2
  exit 1
fi

case "$APP" in
  budget|synapse|mealplanner) ;;
  *) echo "Error: unrecognized --app '$APP' (expected budget, synapse or mealplanner)." >&2; exit 1 ;;
esac
REPO_PATH="$MONO_ROOT/apps/$APP"
REPO_NAME="$APP"

ENV_FILE="$REPO_PATH/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: no .env file at $ENV_FILE" >&2
  exit 1
fi

read_env_var() {
  local key="$1"
  grep -m1 "^${key}=" "$ENV_FILE" | cut -d= -f2- || true
}

DATABASE_URL="$(read_env_var DATABASE_URL)"
PASSPHRASE="$(read_env_var BACKUP_ENCRYPTION_PASSPHRASE)"

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi
if [ -z "$PASSPHRASE" ]; then
  echo "Error: BACKUP_ENCRYPTION_PASSPHRASE not set in $ENV_FILE" >&2
  exit 1
fi

DB_PATH="$REPO_PATH/$DATABASE_URL"

echo "Repo:     $REPO_NAME ($REPO_PATH)"
echo "Local db: $DB_PATH"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

SOURCE_DIR=""
if [ -n "$ZIP_ARG" ]; then
  ZIP_PATH="$ZIP_ARG"
elif command -v gh >/dev/null 2>&1; then
  # One "Database Backup" workflow serves every app, so pick the newest
  # artifact named for this app rather than the newest run.
  echo "Looking up latest db-backup-$APP-* artifact..."
  ARTIFACT="$(cd "$MONO_ROOT" && gh api "repos/{owner}/{repo}/actions/artifacts?per_page=100" \
    --jq "[.artifacts[] | select(.expired | not) | select(.name | startswith(\"db-backup-$APP-\"))][0] | select(. != null) | \"\\(.workflow_run.id) \\(.name)\"" 2>/dev/null || true)"
  if [ -n "$ARTIFACT" ]; then
    RUN_ID="${ARTIFACT%% *}"
    ARTIFACT_NAME="${ARTIFACT#* }"
    SOURCE_DIR="$WORKDIR/gh-artifact"
    mkdir -p "$SOURCE_DIR"
    echo "Downloading $ARTIFACT_NAME from run $RUN_ID..."
    if ! (cd "$MONO_ROOT" && gh run download "$RUN_ID" --name "$ARTIFACT_NAME" --dir "$SOURCE_DIR") 2>/dev/null; then
      echo "Warning: gh run download failed; falling back to a local zip in $DOWNLOADS." >&2
      SOURCE_DIR=""
    fi
  else
    echo "Warning: no unexpired db-backup-$APP-* artifact found via gh; falling back to a local zip in $DOWNLOADS." >&2
  fi
else
  echo "Warning: gh CLI not found; falling back to a local zip in $DOWNLOADS." >&2
fi

if [ -z "$SOURCE_DIR" ]; then
  if [ -z "${ZIP_PATH:-}" ]; then
    ZIP_PATH="$(ls -t "$DOWNLOADS"/db-backup-"$APP"-*.zip 2>/dev/null | head -1 || true)"
    if [ -z "$ZIP_PATH" ]; then
      echo "Error: no db-backup-$APP-*.zip found in $DOWNLOADS. Pass --zip explicitly, or install/auth gh to fetch automatically." >&2
      exit 1
    fi
  fi
  if [ ! -f "$ZIP_PATH" ]; then
    echo "Error: zip not found: $ZIP_PATH" >&2
    exit 1
  fi
  echo "Zip:      $ZIP_PATH"
  SOURCE_DIR="$WORKDIR/unzipped"
  mkdir -p "$SOURCE_DIR"
  echo "Unzipping..."
  unzip -q "$ZIP_PATH" -d "$SOURCE_DIR"
fi
echo ""

GPG_FILE="$(find "$SOURCE_DIR" -name '*.gpg' | head -1)"
if [ -z "$GPG_FILE" ]; then
  echo "Error: no .gpg file found in $SOURCE_DIR" >&2
  exit 1
fi

GZ_FILE="$WORKDIR/$(basename "$GPG_FILE" .gpg)"
echo "Decrypting $(basename "$GPG_FILE")..."
gpg --batch --yes --pinentry-mode loopback \
  --passphrase "$PASSPHRASE" \
  --decrypt --output "$GZ_FILE" "$GPG_FILE" 2>/dev/null

SQL_FILE="${GZ_FILE%.gz}"
echo "Decompressing..."
gunzip -c "$GZ_FILE" > "$SQL_FILE"

mkdir -p "$SQL_ARCHIVE_DIR"
ARCHIVED_SQL="$SQL_ARCHIVE_DIR/${REPO_NAME}-$(basename "$SQL_FILE")"
cp "$SQL_FILE" "$ARCHIVED_SQL"
echo "Saved decrypted dump to $ARCHIVED_SQL"
echo ""

if [ "$APPLY" -ne 1 ]; then
  echo "Dry run (no --yes passed). Would now:"
  if [ -f "$DB_PATH" ]; then
    echo "  1. Back up $DB_PATH -> ${DB_PATH}.backup-$(date +%Y%m%d-%H%M%S)"
  else
    echo "  1. (no existing db at $DB_PATH to back up)"
  fi
  echo "  2. Replace $DB_PATH with a fresh db restored from $ARCHIVED_SQL"
  echo ""
  echo "Re-run with --yes to apply."
  exit 0
fi

mkdir -p "$(dirname "$DB_PATH")"
if [ -f "$DB_PATH" ]; then
  BACKUP_DB="${DB_PATH}.backup-$(date +%Y%m%d-%H%M%S)"
  cp "$DB_PATH" "$BACKUP_DB"
  echo "Backed up existing db to $BACKUP_DB"
  rm -f "$DB_PATH"
fi

echo "Restoring..."
sqlite3 "$DB_PATH" < "$ARCHIVED_SQL"

echo ""
echo "Integrity check:"
sqlite3 "$DB_PATH" "PRAGMA integrity_check;"

echo ""
echo "Row counts:"
TABLES="$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")"
while IFS= read -r table; do
  [ -z "$table" ] && continue
  count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM \"$table\";")"
  printf '  %-30s %s\n' "$table" "$count"
done <<< "$TABLES"

echo ""
echo "Restore complete: $DB_PATH"
