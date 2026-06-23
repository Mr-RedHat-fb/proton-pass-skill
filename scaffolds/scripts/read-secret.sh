#!/usr/bin/env bash
# read-secret.sh — safely read ONE secret field from Proton Pass into a variable.
#
# Fill in: PASS_REF (a full pass://VAULT/ITEM/FIELD reference).
# Safety: reads a single field (never the whole item); never echoes the value.
#         Logs go to stderr, so $(...) capture stays clean.
set -euo pipefail

PASS_REF="${PASS_REF:-pass://Work/GitHub Account/password}"   # <-- edit me

# Guard: bail out clearly if there's no valid session.
if ! pass-cli test >/dev/null 2>&1; then
  echo "No valid Proton Pass session — run 'pass-cli login' first." >&2
  exit 1
fi

secret="$(pass-cli item view "$PASS_REF")"

# Use $secret here. Pass it to the consumer directly; don't print it.
# Example: log in to something without exposing the value in argv/history:
#   printf '%s' "$secret" | some-tool login --password-stdin
echo "Fetched secret for: $PASS_REF (value hidden)" >&2
