#!/usr/bin/env bash
# share-vault.sh — share a vault with teammates at least-privilege roles.
#
# Fill in: VAULT and the MEMBERS list ("email:role" pairs).
# Roles: viewer (read-only) < editor (create/modify) < manager (full control).
# Safety: sharing GRANTS ACCESS to your secrets — confirm the recipient list and
#         roles with the user before running. Start everyone at viewer and raise
#         only on request (principle of least privilege).
set -euo pipefail

VAULT="${VAULT:-Team Project}"   # <-- edit me

# email:role pairs — default everyone to viewer.
MEMBERS=(
  "alice@company.com:viewer"    # <-- edit me
  "bob@company.com:viewer"      # <-- edit me
)

if ! pass-cli test >/dev/null 2>&1; then
  echo "No valid Proton Pass session — run 'pass-cli login' first." >&2
  exit 1
fi

echo "About to share vault \"$VAULT\" with:" >&2
printf '  %s\n' "${MEMBERS[@]}" >&2

for entry in "${MEMBERS[@]}"; do
  email="${entry%%:*}"
  role="${entry##*:}"
  echo "Sharing with $email as $role" >&2
  pass-cli vault share --vault-name "$VAULT" "$email" --role "$role"
done

echo "Current members:" >&2
pass-cli vault member list --vault-name "$VAULT"
# Review members monthly and remove access that's no longer needed.
