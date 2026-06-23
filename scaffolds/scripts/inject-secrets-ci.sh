#!/usr/bin/env bash
# inject-secrets-ci.sh — run an app/CI step with secrets pulled from Proton Pass,
# authenticated by a scoped, expiring Personal Access Token. Secrets stay in
# memory (via `pass-cli run`) and are never written to disk.
#
# One-time setup (run by a human, not in CI):
#   pass-cli pat create --name "ci-runner" --expiration 3m --output json
#   pass-cli pat access grant --pat-name "ci-runner" --vault-name "CI Secrets" --role viewer
#   # store the printed token in your CI provider's secret store as PROTON_PASS_PERSONAL_ACCESS_TOKEN
#
# In CI, set these from the CI secret store, then run this script:
#   PROTON_PASS_PERSONAL_ACCESS_TOKEN  (the pst_...::KEY token)
#   PROTON_PASS_KEY_PROVIDER=fs        (no OS keyring on CI runners; key on disk in the ephemeral job)
set -euo pipefail

: "${PROTON_PASS_PERSONAL_ACCESS_TOKEN:?set the CI secret PROTON_PASS_PERSONAL_ACCESS_TOKEN}"
export PROTON_PASS_KEY_PROVIDER="${PROTON_PASS_KEY_PROVIDER:-fs}"

# Authenticate (token comes from the env var above).
pass-cli login
trap 'pass-cli logout --force >/dev/null 2>&1 || true' EXIT   # clean up local session on exit

# Map each app env var to a pass:// reference; `run` substitutes real values.
export DATABASE_URL='pass://CI Secrets/App/database_url'
export API_KEY='pass://CI Secrets/App/api_key'

# Run the actual step. Everything after `--` is your command.
exec pass-cli run -- "$@"
# Example call:  ./inject-secrets-ci.sh ./deploy.sh
