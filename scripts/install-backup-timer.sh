#!/usr/bin/env bash
# Installs (or reinstalls) the launchd timer that runs scripts/backup.sh nightly.
#   scripts/install-backup-timer.sh          install
#   scripts/install-backup-timer.sh render   print the plist rendered for $HOME and this checkout (touches nothing)
set -euo pipefail

LABEL="com.zs.smc-backup"
SELF_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${SELF_DIR}/launchd/${LABEL}.plist"
DEST="${HOME}/Library/LaunchAgents/${LABEL}.plist"

# launchd does not expand ~ or $HOME, so the template holds __HOME__ and __REPO__
# and this fills in absolute paths for whichever Mac and checkout this is.
esc() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/[\\&|]/\\&/g'; }
render_plist() {
  sed -e "s|__HOME__|$(esc "${HOME}")|g" -e "s|__REPO__|$(esc "${SELF_DIR}")|g" "${SRC}"
}
# Every path the job runs must exist before launchd is pointed at it.
check_plist() {
  if grep -q '__[A-Z]*__' "$1"; then echo "unrendered placeholder left in $1" >&2; return 1; fi
  plutil -lint "$1" >/dev/null
  local pb=/usr/libexec/PlistBuddy arg
  for i in 0 1; do
    arg=$($pb -c "Print :ProgramArguments:${i}" "$1")
    [ -e "${arg}" ] || { echo "program path not found: ${arg}" >&2; return 1; }
  done
}

[ -f "${SRC}" ] || { echo "no such plist: ${SRC}" >&2; exit 1; }

if [ "${1:-}" = "render" ]; then render_plist; exit 0; fi

umask 077
[ -x /opt/homebrew/opt/postgresql@17/bin/pg_dump ] || { echo "PostgreSQL 17 tools are required" >&2; exit 1; }
[ -x "${HOME}/bin/zsvault" ] || { echo "ZS Vault is required for unattended credentials" >&2; exit 1; }

mkdir -p "${HOME}/Library/LaunchAgents" "${HOME}/Library/Logs"
TMP="${DEST}.tmp.$$"
trap 'rm -f "${TMP}"' EXIT
render_plist > "${TMP}"
check_plist "${TMP}"
chmod 600 "${TMP}"
mv "${TMP}" "${DEST}"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${DEST}"
launchctl print "gui/$(id -u)/${LABEL}" >/dev/null

echo
echo "installed ${LABEL}. verify with:"
echo "  launchctl kickstart -k gui/\$(id -u)/${LABEL} && ls ~/Backups/supabase/meal-companion"
