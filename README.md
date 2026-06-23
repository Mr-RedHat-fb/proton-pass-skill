# proton-pass-cli — a Claude Code skill

A [Claude Code](https://claude.com/claude-code) **skill** that teaches the agent to
drive [Proton Pass CLI (`pass-cli`)](https://github.com/protonpass/pass-cli)
correctly — managing vaults, items, and secrets from the terminal, and wiring
those secrets into scripts, CI, and app configs.

It bundles condensed command references, a safety posture tuned for "this is a
password manager," and ready-to-fill scaffolds for the most common jobs (plus
arbitrary custom items).

## What it covers

- **Running `pass-cli`**: listing/viewing/creating/updating items; reading
  passwords, TOTP codes, SSH keys; vaults, sharing, settings.
- **Scripting against it**: `pass://VAULT/ITEM/FIELD` references, `run`,
  `inject`, Personal Access Tokens, agent tokens, JSON output + `jq`.
- **Custom items**: free-form items with named sections and hidden fields —
  whatever combination of fields you can imagine.

## Two layers — using vs. managing secrets

This repo ships **two complementary tools** for the same vault:

- **`SKILL.md` + `scaffolds/` + `references/`** — the **CLI manual**: how to *manage*
  the vault (create/rotate/share items, TOTP, SSH keys, custom types, CI wiring).
- **`mcp-server/`** — a guardrailed **stdio MCP server** wrapping the same `pass-cli`
  with an audited `reason`, a read-only vault-scoped token, and `inject`/`run` tools
  that consume secrets **without returning the value to the model**.

**Precedence for agents:** if a task only needs to *use* a secret (render a config,
run a command, load an SSH key), prefer the **MCP tools** — they keep the value out of
the transcript and log who read what. Use the **CLI skill** for *managing* the vault.
See [`mcp-server/README.md`](./mcp-server/README.md) to install it.

## Install

Clone into your Claude Code skills directory:

```bash
git clone https://github.com/Mr-RedHat-fb/proton-pass-skill \
  ~/.claude/skills/proton-pass-cli
```

Claude Code discovers the skill automatically via the frontmatter in
`SKILL.md`. It triggers whenever you mention `pass-cli`, Proton Pass, a Proton
vault, a `pass://` reference, or ask to fetch/store/rotate a credential, API
key, SSH key, or TOTP code — even without naming the tool.

> This skill does **not** bundle `pass-cli` itself. Install the binary from the
> [upstream project](https://github.com/protonpass/pass-cli).

## Layout

```
SKILL.md                     # entry point: workflow, safety, mental model, index
references/
  auth-and-config.md         # login, env vars, key storage, headless/keyring fixes
  commands.md                # full subcommand/flag reference
  item-types.md              # per-type creation incl. custom items + templates
  automation.md              # pass:// refs, run, inject, PATs, agents, jq
scaffolds/
  scripts/                   # runnable, copy-and-adapt shell scripts
  templates/                 # JSON item templates for --from-template
mcp-server/                  # guardrailed stdio MCP server (audited, vault-scoped)
```

## Scaffolds

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
| `templates/custom-item.json` | Free-form custom item with named sections + hidden fields |

Each scaffold's header comment documents its placeholders and safety notes.

## Safety posture

The skill treats the vault as production data: **read freely, confirm before
changing or exposing anything.** Reads (`list`, `view`, `totp`, `info`, `test`,
`vault list`, …) run without prompting; mutations and any sharing
(`item delete`/`update`, `vault delete`/`update`/`share`, token grants) require
explicit confirmation first. Secrets are fetched a single field at a time and
kept out of shell history and `argv`.

## License

[BSD-2-Clause](./LICENSE).

`pass-cli` itself is a separate project under its own license; see upstream.
