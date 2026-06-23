#!/usr/bin/env bash
# fetch-totp.sh — fetch the current TOTP (2FA) code for an item.
#
# Fill in: PASS_REF — a pass://VAULT/ITEM reference (all fields) or
#          pass://VAULT/ITEM/FIELD for a specific TOTP field.
# Read-only: this only generates codes; it never changes the vault.
# Note: TOTP fields themselves cannot be created/edited via the CLI — use
#       another Proton Pass client to add them. This just reads the codes.
set -euo pipefail

PASS_REF="${PASS_REF:-pass://Work/AWS Console}"   # <-- edit me (item, or item/field)
FIELD="${FIELD:-}"                                 # optional specific TOTP field name

if ! pass-cli test >/dev/null 2>&1; then
  echo "No valid Proton Pass session — run 'pass-cli login' first." >&2
  exit 1
fi

if [[ -n "$FIELD" ]]; then
  # Get one field's code as a bare value (handy for piping into a login flow).
  pass-cli item totp "$PASS_REF" --output=json | jq -r --arg f "$FIELD" '.[$f]'
else
  # Show all TOTP codes on the item (human-readable).
  pass-cli item totp "$PASS_REF"
fi
# TOTP codes are short-lived (typically 30s) — fetch immediately before use.
