#!/usr/bin/env bash
# Non-interactive launchd entry point: fixed tools, command-backed Vault credential retrieval.
set -euo pipefail
set +x
export PATH="${HOME}/bin:/opt/homebrew/bin:/usr/bin:/bin"
export PG_BIN="/opt/homebrew/opt/postgresql@17/bin"
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  SUPABASE_DB_URL="$("${HOME}/bin/zsvault" get sasha_supabase_db_url)"
  export SUPABASE_DB_URL
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# launchd runs this at 03:15 and again at 12:15. The second run is the retry for a 03:15 run that
# failed (after a restart ZS Vault stays locked until Devin unlocks it, and launchd cannot read the
# keychain). Skip when a dump younger than 20 hours already exists.
if "${ROOT}/scripts/check-backup-staleness.sh" "${HOME}/Backups/supabase/meal-companion" 20 >/dev/null 2>&1; then
  echo "skip: a backup from the last 20 hours exists"
  exit 0
fi
"${ROOT}/scripts/backup.sh"
/usr/bin/python3 "${ROOT}/scripts/backup-storage.py"
"${ROOT}/scripts/check-backup-staleness.sh"
