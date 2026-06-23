#!/usr/bin/env bash
# rotate-password.sh — generate a fresh password and set it on an existing item.
#
# Fill in: VAULT and ITEM (by title). LENGTH is optional.
# Safety: this OVERWRITES the item's password (item update). Confirm with the user
#         before running. It prints neither the old nor the new password by
#         default — flip SHOW_NEW=1 only if the user explicitly wants to see it.
#
# ⚠ ARGV EXPOSURE (pass-cli limitation, verified via `pass-cli item update --help`):
#   `item update` only accepts `--field name=value` on the command line — there is no
#   stdin / --from-template / --generate-password path for *updates*. So the new
#   password is briefly visible in process arguments (`ps`, /proc/<pid>/cmdline) while
#   the update runs. There is no pass-cli-level fix — the real mitigation is systemic:
#   mount /proc with `hidepid=2` so other users can't read another process's argv (closes
#   argv leaks host-wide). Failing that, on a SHARED host rotate via a Proton Pass GUI
#   client; on a single-user box the exposure window is brief and local-only.
set -euo pipefail

VAULT="${VAULT:-Work}"              # <-- edit me
ITEM="${ITEM:-GitHub Account}"     # <-- edit me (item title)
LENGTH="${LENGTH:-24}"
SHOW_NEW="${SHOW_NEW:-0}"

if ! pass-cli test >/dev/null 2>&1; then
  echo "No valid Proton Pass session — run 'pass-cli login' first." >&2
  exit 1
fi

echo "About to rotate the password for: $VAULT / $ITEM" >&2
echo "This overwrites the existing password and cannot be undone via the CLI." >&2

new_pw="$(pass-cli password generate random --length "$LENGTH" --symbols true --uppercase true)"

# The new value lands in argv here — unavoidable with `item update` (see header caveat).
pass-cli item update --vault-name "$VAULT" --item-title "$ITEM" \
  --field "password=$new_pw"

echo "Password rotated for $VAULT / $ITEM." >&2
if [[ "$SHOW_NEW" == "1" ]]; then
  printf 'New password: %s\n' "$new_pw"
else
  echo "(new value hidden; set SHOW_NEW=1 to print it, or read it back with item view)" >&2
fi
# Remember to update the password on the actual service this item logs into.
