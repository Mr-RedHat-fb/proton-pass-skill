#!/usr/bin/env bash
# download-attachments.sh — download an attachment from an item.
#
# Fill in: SHARE_ID, ITEM_ID, ATTACHMENT_ID. Get SHARE_ID from `vault list`,
# ITEM_ID from `item list --output json`, and the attachment id by viewing the
# item as JSON (`item view ... --output json`).
# Read-only with respect to the vault; it writes the downloaded file locally.
#
# NOTE: the exact flags for `item attachment download` are thinly documented —
# if this errors, run `pass-cli item attachment download --help` and adjust.
set -euo pipefail

SHARE_ID="${SHARE_ID:-abc123def}"        # <-- edit me
ITEM_ID="${ITEM_ID:-item456}"            # <-- edit me
ATTACHMENT_ID="${ATTACHMENT_ID:-att789}" # <-- edit me (from item view --output json)

if ! pass-cli test >/dev/null 2>&1; then
  echo "No valid Proton Pass session — run 'pass-cli login' first." >&2
  exit 1
fi

# Discover available attachments on the item:
echo "Item details (look for attachment ids):" >&2
pass-cli item view --share-id "$SHARE_ID" --item-id "$ITEM_ID" --output json | jq '.attachments? // .files? // .' >&2

echo "Downloading attachment $ATTACHMENT_ID …" >&2
pass-cli item attachment download \
  --share-id "$SHARE_ID" --item-id "$ITEM_ID" --attachment-id "$ATTACHMENT_ID"

echo "Done. Treat downloaded files as sensitive; delete when no longer needed." >&2
