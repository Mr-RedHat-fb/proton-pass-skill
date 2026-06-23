---
name: proton-pass-cli
description: >-
  Use the Proton Pass CLI (pass-cli) to manage Proton Pass vaults, items, and
  secrets from the terminal — listing/viewing/creating/updating items, reading
  passwords/TOTP/SSH keys, and wiring secrets into scripts, CI, and app configs
  via pass:// references, `run`, and `inject`. Trigger this skill whenever the
  user mentions pass-cli, Proton Pass, a Proton vault, a `pass://` secret
  reference, or asks to fetch/store/rotate a credential, API key, SSH key, or
  TOTP code in Proton Pass — even if they don't name the tool explicitly.
  Also use it when scripting against pass-cli or building custom item types.
---

# Proton Pass CLI (`pass-cli`)

`pass-cli` is Proton's official command-line client for **Proton Pass**, their
end-to-end-encrypted password manager. It manages vaults and items (logins,
notes, cards, identities, aliases, SSH keys, Wi-Fi, and free-form *custom*
items) and — most importantly for automation — injects secrets into processes
and config files using a `pass://vault/item/field` reference syntax.

This skill teaches you to **run pass-cli correctly** and to **script against
it**. It bundles ready-to-fill scaffolds in `scaffolds/` for the most common
jobs and for arbitrary custom items.

## If a guardrailed MCP server is available, prefer it for *using* secrets

This repo also ships a stdio **MCP server** (`mcp-server/`) wrapping the same
`pass-cli` with an audited `reason`, a read-only vault-scoped token, and tools
(`inject`, `run`, `ssh_agent_load`) that consume a secret **without ever
returning its value to the model**. If you're an agent and that server is
connected (`mcp__proton-pass-secrets__*`):

- **Use the MCP tools when the task only needs to *use* a secret** — render a
  config (`inject`), run a command/deploy (`run`), load an SSH key
  (`ssh_agent_load`). The value stays out of the transcript and the access is
  logged to Proton's encrypted audit log.
- **Use *this* skill's raw `pass-cli` for *managing* the vault** — rotation,
  sharing, TOTP, custom item types, PAT/agent-token lifecycle, bulk ops, and
  anything the server's tool surface doesn't cover.

In one line: **MCP = safely *using* secrets · this skill = *managing* the vault.**

## When you're working with this skill

1. **Confirm the tool exists first.** Run `pass-cli --version`. If it's missing,
   read `references/auth-and-config.md` (Installation) and offer to install it —
   don't assume a package manager.
2. **Confirm there's a session.** `pass-cli test` pings the API with the current
   session and returns a non-zero exit code if you're logged out. Use it as the
   guard before any vault operation. If it fails, see Authentication below.
3. **Pick the right reference file** (see map below) instead of guessing flags.
4. **When the docs are thin, ask the binary.** The published docs lag the actual
   CLI surface. For exact flags on under-documented subcommands (especially
   `item create <type>`, `item move/trash/untrash`, top-level `totp`), run
   `pass-cli <command> --help` and trust that over memory.

## Safety — this is a password manager, act like it

Treat the vault as production data the user cares deeply about. The default
posture is **read freely, confirm before you change or expose anything.**

- **Read operations are safe** to run on your own: `list`, `view`, `totp`,
  `info`, `test`, `user info`, `vault list`, `share list`, `password generate`,
  `password score`. Run these to gather context.
- **Confirm with the user before** anything that mutates or exfiltrates:
  `item delete` (permanent — there is no undo), `item update` (overwrites
  fields), `item trash`/`move`, `vault delete`/`vault update`, and **any
  sharing** (`vault share`, `item share`, `pat/agent access grant`). State
  exactly what will change before you run it.
- **Never print a secret unless the user asked for that specific value.** When
  you need one value, fetch just that field (`--field` or a
  `pass://.../field` URI), not the whole item. Avoid dumping an entire vault to
  the terminal.
- **Keep secrets out of shell history and argv.** Other users/processes can see
  command arguments. Prefer `--from-template -` (stdin), `--generate-password`,
  env-var files, and `pass-cli run`/`inject` over pasting a literal
  `--password "hunter2"` on the command line. If a literal secret on the command
  line is unavoidable, say so and let the user run it.
- **Least privilege for automation.** When creating tokens for CI or agents,
  scope them to the minimum vault/role and always set an expiration. See
  `references/automation.md`.

## Reference map — read the file that matches the task

| You need to… | Read |
|--------------|------|
| Log in, configure env vars, key storage, fix keyring/headless errors | `references/auth-and-config.md` |
| Find the exact subcommand/flags for vaults, items, sharing, settings | `references/commands.md` |
| Create a specific item type (login, card, identity, ssh-key, wifi, **custom**) or use templates | `references/item-types.md` |
| Script it: `pass://` references, `run`, `inject`, PATs, agent tokens, output as JSON | `references/automation.md` |
| Start from a working example for a common job | `scaffolds/` (see below) |

## Scaffolds — start from these, don't write from scratch

`scaffolds/scripts/` holds runnable shell scripts you can copy and adapt;
`scaffolds/templates/` holds JSON item templates for `item create --from-template`.

| Scaffold | Use it when |
|----------|-------------|
| `scripts/inject-secrets-ci.sh` | Wire vault secrets into an app/CI step via `run`/`inject` with a scoped PAT |
| `scripts/read-secret.sh` | Safely read one field into a shell variable |
| `scripts/bulk-create-logins.sh` | Create many login items from a CSV/list |
| `scripts/rotate-password.sh` | Generate + set a new password and report old/new |
| `scripts/share-vault.sh` | Share a vault with teammates at least-privilege roles |
| `scripts/ssh-key-setup.sh` | Generate/import an SSH key and load it via the SSH agent |
| `scripts/fetch-totp.sh` | Read the current TOTP/2FA code for an item (read-only) |
| `scripts/download-attachments.sh` | Download an attachment from an item |
| `scripts/bulk-create-aliases.sh` | Create several Proton email aliases at once |
| `templates/login.json` | Standard login item |
| `templates/custom-item.json` | Free-form custom item with named sections + hidden fields — the "imagination is the limit" case |

When you adapt a scaffold, read its header comment first — each documents the
placeholders to fill and the safety notes for that workflow.

## Core mental model

- **Addressing things two ways.** Almost every command accepts either a *vault*
  by `--share-id ID` **or** `--vault-name NAME` (mutually exclusive), and an
  *item* by `--item-id ID` **or** `--item-title TITLE` (mutually exclusive).
  IDs are stable and unambiguous; names are friendlier but case-sensitive and
  can collide. Prefer IDs in scripts, names in interactive use. Get IDs from
  `vault list` / `item list`.
- **`pass://` secret references.** The single most useful concept:
  `pass://VAULT/ITEM/FIELD` resolves to one secret value. All three parts are
  mandatory, a trailing slash breaks it, and name matching is case-sensitive.
  Use it with `item view`, in env vars consumed by `run`, and inside `{{ }}` in
  templates consumed by `inject`. Full rules in `references/automation.md`.
- **Defaults reduce typing.** `settings set default-vault` and
  `settings set default-format json` let you omit `--share-id/--vault-name` and
  `--output` on item commands. Per-command flags always override.
- **Machine-readable output.** Pass `--output json` (or set it as the default)
  on read commands and parse with `jq`. Logs go to **stderr**, so stdout stays
  clean for piping.

## Authentication in brief

Establish a session once; it persists in a session directory (see
`references/auth-and-config.md` for paths and overrides).

- **Interactive desktop:** `pass-cli login` (browser/SSO/U2F) or
  `pass-cli login --interactive user@proton.me` (password + TOTP + extra
  password; no SSO/U2F).
- **Headless / CI:** authenticate with a Personal Access Token —
  `PROTON_PASS_PERSONAL_ACCESS_TOKEN=pst_xxx::KEY pass-cli login`. On servers
  without a secure keyring you may need `PROTON_PASS_KEY_PROVIDER=fs` (writes the
  key to disk in plaintext — acceptable only in controlled CI, never on shared
  hosts). Details and troubleshooting in `references/auth-and-config.md`.
- Check state with `pass-cli info`; end with `pass-cli logout`.

## Quick command index

Top-level commands: `login` `logout` `info` `test` `user` `vault` `item`
`share` `invite` `password` `totp` `personal-access-token`(alias `pat`)
`agent` `ssh-agent` `run` `inject` `settings` `update` `support`.

The two you'll reach for constantly:

```bash
# Read one secret (just the value, nothing else)
pass-cli item view "pass://Work/GitHub/password"

# List items as JSON for scripting
pass-cli item list --vault-name "Work" --output json
```

For everything else, open `references/commands.md`.
