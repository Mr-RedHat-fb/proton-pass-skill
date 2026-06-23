#!/usr/bin/env bash
# bulk-create-aliases.sh — create several Proton email aliases at once.
#
# Fill in: VAULT and the PREFIXES list. Each alias becomes PREFIX.SUFFIX
# (the suffix is assigned by Proton). Output is captured as JSON so you get
# the resulting addresses.
set -euo pipefail

VAULT="${VAULT:-Personal}"     # <-- edit me

PREFIXES=(                     # <-- edit me (one alias per prefix)
  "newsletter"
  "shopping"
  "forum-signup"
)

if ! pass-cli test >/dev/null 2>&1; then
  echo "No valid Proton Pass session — run 'pass-cli login' first." >&2
  exit 1
fi

for prefix in "${PREFIXES[@]}"; do
  echo "Creating alias for prefix: $prefix" >&2
  pass-cli item alias create --vault-name "$VAULT" --prefix "$prefix" --output json \
    | jq -r '"  created: " + (.email // .address // "?" )'
done

echo "Done. List them with: pass-cli item list --vault-name \"$VAULT\"" >&2
