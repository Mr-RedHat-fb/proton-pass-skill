#!/usr/bin/env bash
# ssh-key-setup.sh — generate (or import) an SSH key into Proton Pass and load it
# into your SSH agent so you can use it immediately.
#
# Fill in: VAULT, TITLE. Choose MODE=generate or MODE=import (+ IMPORT_KEY path).
# Safety: generated keys are encrypted at rest in Pass, so a passphrase is
#         optional unless you'll export the key. For import, prefer stripping the
#         passphrase from a COPY first (see references/item-types.md).
set -euo pipefail

VAULT="${VAULT:-Development Keys}"      # <-- edit me
TITLE="${TITLE:-GitHub Deploy Key}"    # <-- edit me
MODE="${MODE:-generate}"               # generate | import
KEY_TYPE="${KEY_TYPE:-ed25519}"        # ed25519 | rsa2048 | rsa4096
IMPORT_KEY="${IMPORT_KEY:-$HOME/.ssh/id_ed25519}"   # used when MODE=import

if ! pass-cli test >/dev/null 2>&1; then
  echo "No valid Proton Pass session — run 'pass-cli login' first." >&2
  exit 1
fi

case "$MODE" in
  generate)
    echo "Generating $KEY_TYPE key \"$TITLE\" in vault \"$VAULT\"" >&2
    pass-cli item create ssh-key generate \
      --vault-name "$VAULT" --title "$TITLE" --key-type "$KEY_TYPE"
    ;;
  import)
    [[ -f "$IMPORT_KEY" ]] || { echo "Key not found: $IMPORT_KEY" >&2; exit 1; }
    echo "Importing $IMPORT_KEY as \"$TITLE\" into vault \"$VAULT\"" >&2
    pass-cli item create ssh-key import \
      --from-private-key "$IMPORT_KEY" --vault-name "$VAULT" --title "$TITLE"
    ;;
  *)
    echo "MODE must be 'generate' or 'import'" >&2; exit 1 ;;
esac

# Load all SSH keys from this vault into your running ssh-agent.
# Requires SSH_AUTH_SOCK to point at an agent (e.g. `eval "$(ssh-agent -s)"`).
if [[ -n "${SSH_AUTH_SOCK:-}" ]]; then
  echo "Loading keys from vault into the SSH agent…" >&2
  pass-cli ssh-agent load --vault-name "$VAULT"
else
  echo "SSH_AUTH_SOCK not set; start an agent then run: pass-cli ssh-agent load --vault-name \"$VAULT\"" >&2
fi
