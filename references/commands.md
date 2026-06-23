# pass-cli command reference

Exhaustive reference for `pass-cli` subcommands and their flags. When a flag set
here looks incomplete for a niche subcommand, confirm with `pass-cli <cmd> --help`
— the binary is the source of truth and the published docs lag it.

## Contents
- [Conventions](#conventions)
- [Session & account](#session--account) — `login` `logout` `info` `test` `user`
- [Vaults](#vaults) — `vault`
- [Items](#items) — `item` (see also `references/item-types.md`)
- [Sharing & invites](#sharing--invites) — `share` `invite`
- [Passwords & TOTP](#passwords--totp) — `password` `totp`
- [Tokens for automation](#tokens-for-automation) — `pat` `agent`
- [SSH agent](#ssh-agent) — `ssh-agent`
- [Secret injection](#secret-injection) — `run` `inject` (details in `references/automation.md`)
- [Settings & maintenance](#settings--maintenance) — `settings` `update` `support` `completions`

## Conventions

- **Vault selector** (mutually exclusive): `--share-id ID` or `--vault-name NAME`.
  Omit both to use the configured default vault.
- **Item selector** (mutually exclusive): `--item-id ID` or `--item-title TITLE`.
  Exactly one is required (unless a `pass://` URI is given).
- **`--output human|json`** is available on most read commands. `human` is the
  default unless changed via `settings set default-format`.
- IDs are stable; names are case-sensitive and may collide. Prefer IDs in scripts.

## Session & account

### `login`
Authenticate and create a local session.
- `pass-cli login` — browser-based web login (default; only mode supporting SSO + U2F hardware keys).
- `pass-cli login --interactive [USERNAME]` — password + TOTP + extra password; no SSO/U2F.
- `pass-cli login --personal-access-token "pst_xxxx::TOKENKEY"` — token login (CI/headless).
  Prefer the env var `PROTON_PASS_PERSONAL_ACCESS_TOKEN` over the flag.

### `logout`
End the session and wipe local data.
- `pass-cli logout` — remote + local cleanup.
- `pass-cli logout --force` — local-only cleanup; **does not** invalidate the session server-side. Use only when the network blocks a normal logout.

### `info`
`pass-cli info` — show release track, user ID, username, email for the current session.

### `test`
`pass-cli test` — ping the API with the current session. No output of note; rely on the **exit code** as a guard in scripts: `if pass-cli test; then …; fi`.

### `user`
`pass-cli user info [--output human|json]` — account email, plan, storage usage.

## Vaults

```bash
pass-cli vault list [--output human|json]
pass-cli vault create --name NAME
pass-cli vault update (--share-id ID | --vault-name NAME) --name NEW_NAME
pass-cli vault delete (--share-id ID | --vault-name NAME)
pass-cli vault share  (--share-id ID | --vault-name NAME) EMAIL [--role viewer|editor|manager]
pass-cli vault transfer (--share-id ID | --vault-name NAME) MEMBER_SHARE_ID   # transfer ownership
pass-cli vault member list   (--share-id ID | --vault-name NAME) [--output human|json]
pass-cli vault member update (--share-id ID | --vault-name NAME) ...           # change a member's role
pass-cli vault member remove (--share-id ID | --vault-name NAME) ...           # revoke a member
```

Roles: `viewer` (read-only), `editor` (create/modify), `manager` (full control incl. sharing); the creator is the owner. **`vault delete` and `vault share` are destructive/exfiltrating — confirm first.**

`vault list` is how you discover the **share ID** for a vault, which most item commands and all sharing commands need.

## Items

Full per-type creation flags and templates live in **`references/item-types.md`**. Summary of the item subcommands:

```bash
pass-cli item list [VAULT_NAME] [--share-id ID] [--output human|json]
pass-cli item create <TYPE> [OPTIONS]      # TYPE: note login alias credit-card identity ssh-key wifi custom
pass-cli item view   [OPTIONS] [URI]       # by selectors, or a pass://share/item[/field] URI
pass-cli item update  (vault sel) (item sel) --field NAME=VALUE [--field NAME=VALUE]...
pass-cli item delete  --share-id ID --item-id ID        # PERMANENT, no undo
pass-cli item trash   (vault sel) (item sel)            # recoverable
pass-cli item untrash (vault sel) (item sel)            # restore from trash
pass-cli item move     ...                              # move item to another vault
pass-cli item share   --share-id ID --item-id ID EMAIL [--role viewer|editor|manager]
pass-cli item totp    [OPTIONS] [URI]                   # generate TOTP code(s) for an item
pass-cli item attachment download [OPTIONS]
pass-cli item alias create [(--share-id ID | --vault-name NAME)] --prefix PREFIX [--output human|json]
pass-cli item member ...                                # manage members on an individually-shared item
```

### `item list`
List items in a vault. With a default vault + default format set, `pass-cli item list` works with no args.
```bash
pass-cli item list "Personal Vault"
pass-cli item list --share-id "abc123def" --output json
```

### `item view`
Read an item or a single field. Three addressing styles (mutually exclusive):
```bash
pass-cli item view --share-id ID --item-id ID                      # by IDs
pass-cli item view --vault-name "MyVault" --item-title "MyItem"    # by names
pass-cli item view "pass://abc123def/item456/password"            # by URI (here, just the password field)
pass-cli item view --share-id ID --item-id ID --field username     # single field via flag
pass-cli item view --share-id ID --item-id ID --output json        # full item as JSON
```
Use `--field` / a `/field` URI to get exactly one value for `$(...)` capture — this avoids printing the whole item.

### `item update`
Modify standard or custom fields; multiple `--field` allowed.
```bash
pass-cli item update --item-id ID --field "password=newpass"
pass-cli item update --vault-name "Work" --item-title "GitHub" \
  --field "username=newuser" --field "email=new@example.com"
```
- Standard login fields: `title username password email url note`.
- Unknown field names are **created as custom fields**.
- For items with named sections, target a specific section with `Section.field`
  (e.g. `--field "Production.password=..."`). An unqualified name updates the
  first match across sections.
- **Cannot** change date/TOTP fields — use another Proton Pass client for those.
- Overwrites silently; confirm before running. Output reports each updated/created field.

### `item delete` / `trash` / `untrash`
`delete` is permanent and unrecoverable — always confirm and prefer `trash` when the user just wants it out of the way.
```bash
pass-cli item delete --share-id ID --item-id ID    # gone forever
```

### `item totp`
Generate TOTP codes for an item that has TOTP fields.
```bash
pass-cli item totp --item-title "WithTOTPs"
pass-cli item totp "pass://TOTP export/WithTOTPs"              # all TOTP fields
pass-cli item totp "pass://TOTP export/WithTOTPs/TOTP 1"       # one field
pass-cli item totp "pass://…/WithTOTPs/TOTP 1" --output=json | jq -r '."TOTP 1"'
```
(There is also a top-level `totp` command; `item totp` is the documented path.)

### `item share`
Share a single item with another user. Exfiltrating — confirm first.
```bash
pass-cli item share --share-id ID --item-id ID colleague@company.com --role editor
```

### `item alias create`
Create a Proton email alias item. Resulting address is `PREFIX.SUFFIX`.
```bash
pass-cli item alias create --vault-name "Personal" --prefix "newsletter" --output json
```

## Sharing & invites

```bash
pass-cli share list [--output human|json]          # all access relationships you have
pass-cli invite list [--output human|json]
pass-cli invite accept --invite-token TOKEN
pass-cli invite reject --invite-token TOKEN
```

Sharing best practices (apply these when advising the user):
- Start at the **least** privilege (`viewer`) and raise only when needed.
- Use `manager` sparingly — only for trusted administrators.
- Review vault members and roles regularly; remove access that's no longer needed.
- Keep a record of *why* each share exists (principle of least privilege + access documentation).

## Passwords & TOTP

`password` works **without** logging in.
```bash
pass-cli password generate random [--length N] [--numbers true|false] [--uppercase true|false] [--symbols true|false]
pass-cli password generate passphrase [--count N] [--separator CHAR] [--capitalize true|false] [--numbers true|false]
pass-cli password score PASSWORD [--output human|json]
```
On `item create login`, generate inline instead:
- `--generate-password[=SETTINGS]` where SETTINGS is `"length,uppercase,symbols"`, e.g. `--generate-password="20,true,true"`.
- `--generate-passphrase[=WORD_COUNT]`, e.g. `--generate-passphrase="5"`.

## Tokens for automation

See `references/automation.md` for full workflows. Quick reference:

### `personal-access-token` (alias `pat`)
```bash
pass-cli pat create --name NAME --expiration <1d|1w|1m|3m|6m|1y> [--output json]
pass-cli pat list
pass-cli pat delete (--pat-id ID | --pat-name NAME)
pass-cli pat renew  (--pat-id ID | --pat-name NAME) --expiration <…>
pass-cli pat access grant  (--pat-id ID | --pat-name NAME) (--share-id ID | --vault-name NAME) [--item-id ID | --item-title TITLE] [--role viewer|editor|manager]
pass-cli pat access revoke (--pat-id ID | --pat-name NAME) --share-id ID
pass-cli pat access list-access
```
The token value is shown **once** at creation — capture it immediately. Expiration is mandatory.

### `agent` — scoped, **audited** access for AI agents/automation
Agents are PATs with mandatory audit logging. Audited actions (item view/create/update/trash/untrash/move, vault update) require the env var `PROTON_PASS_AGENT_REASON="why"`, which is stored encrypted.
```bash
pass-cli agent create NAME --expiration <…> [--vault NAME]...   # outputs token + instructions once
pass-cli agent list [--output json]
pass-cli agent delete NAME
pass-cli agent renew  NAME --expiration <…>
pass-cli agent access grant  NAME (--share-id ID | --vault-name NAME) [--item-id ID | --item-title TITLE] [--role …]
pass-cli agent access revoke NAME --share-id ID
pass-cli agent monitor [NAME] [--limit N] [--output json]       # read the audit log
pass-cli agent instructions                                     # emit a Markdown usage guide
```

## SSH agent

```bash
pass-cli ssh-agent load  [--share-id ID | --vault-name NAME]    # load keys into an existing agent (needs SSH_AUTH_SOCK)
pass-cli ssh-agent start [--share-id ID | --vault-name NAME] [--socket-path PATH] [--refresh-interval SECONDS] [--create-new-identities VAULT]
pass-cli ssh-agent daemon start [--pid-file PATH] [--log-file PATH]
pass-cli ssh-agent daemon status
pass-cli ssh-agent daemon stop
pass-cli ssh-agent debug [--vault-name NAME | --item-title TITLE] [--output json]
```
Passphrases for imported keys can be stored in a Hidden custom field named `Password` or `Passphrase`; the agent uses it automatically. See `references/item-types.md` for creating/importing SSH-key items.

## Secret injection

Covered in depth in `references/automation.md`.
```bash
pass-cli run [--env-file FILE]... [--no-masking] -- COMMAND [ARGS...]   # inject pass:// values from env into a subprocess
pass-cli inject [-i IN] [-o OUT] [-f] [--file-mode 0600]               # render a template with {{ pass://… }} references
```

## Settings & maintenance

```bash
pass-cli settings view
pass-cli settings set default-vault (--vault-name NAME | --share-id ID)
pass-cli settings unset default-vault
pass-cli settings set default-format <human|json>
pass-cli settings unset default-format
```
`default-vault` applies to item list/view/totp/create/move/trash/untrash/update; `default-format` applies to item list/view/totp. Per-command flags override.

```bash
pass-cli update [--yes] [--set-track <stable|beta>]   # manual/script installs only — NOT for Homebrew/package managers
pass-cli support                                       # contact/help
pass-cli completions <bash|zsh|fish>                  # shell completions (hidden subcommand)
```
Auto-update check runs every ~3 days; disable with `PROTON_PASS_NO_UPDATE_CHECK`.
