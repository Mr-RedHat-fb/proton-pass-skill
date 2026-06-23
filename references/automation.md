# Automation & scripting with pass-cli

How to use `pass-cli` non-interactively: secret references, injecting secrets into
processes and config files, scoped tokens, and machine-readable output. This is
the heart of "scripting against pass-cli."

## Contents
- [Secret references (`pass://`)](#secret-references-pass)
- [`run` — inject secrets into a subprocess](#run--inject-secrets-into-a-subprocess)
- [`inject` — render a template file](#inject--render-a-template-file)
- [Reading single values into shell variables](#reading-single-values-into-shell-variables)
- [JSON output + jq](#json-output--jq)
- [Personal Access Tokens (PATs)](#personal-access-tokens-pats)
- [Agent tokens (audited)](#agent-tokens-audited)
- [Guarded automation patterns](#guarded-automation-patterns)

## Secret references (`pass://`)

A `pass://` reference resolves to exactly one secret value:

```
pass://VAULT/ITEM/FIELD
```

Rules (these trip people up — internalize them):
- **All three components are mandatory.** No `pass://vault/item` shorthand.
- **A trailing slash invalidates the reference.**
- **Name resolution is case-sensitive** (vault and item names). Standard field
  matching may be case-insensitive, but don't rely on it.
- **Spaces need no escaping** inside the reference, e.g. `pass://Work/GitHub Account/password`.
- **Sections** are addressed as `Section.field`, e.g. `pass://Infra/Prod DB/Primary.password`.
- Both `VAULT` and `ITEM` can be names *or* IDs; IDs are unambiguous and
  preferred in committed scripts.

Where references are consumed:
- Directly: `pass-cli item view "pass://…/field"` prints the value.
- With `run`: put the reference in an **env var value**.
- With `inject`: wrap it in `{{ }}` inside a template file.

## `run` — inject secrets into a subprocess

`run` resolves `pass://` references found in environment variable *values*,
exports the resolved secrets, and executes a command — without ever writing the
secrets to disk.

```bash
pass-cli run [--env-file FILE]... [--no-masking] -- COMMAND [ARGS...]
```

- The env var holds the reference; `run` substitutes the real value for the child:
  ```bash
  export DB_PASSWORD='pass://Production/Database/password'
  pass-cli run -- ./my-app          # my-app sees DB_PASSWORD = the real password
  ```
- `--env-file FILE` loads vars from a file (repeatable; processed in order):
  ```bash
  pass-cli run --env-file .env --env-file .env.prod -- ./my-app
  ```
- Secrets are **masked** in the child's stdout/stderr by default; `--no-masking`
  disables that (use only when masking corrupts legitimate output).
- Everything after `--` is the command and its arguments.

## `inject` — render a template file

`inject` replaces handlebars-style `{{ pass://… }}` references in a template and
writes the rendered result.

```bash
pass-cli inject [-i|--in-file FILE] [-o|--out-file FILE] [-f|--force] [--file-mode 0600]
```

- Reads stdin / writes stdout when `-i`/`-o` are omitted.
- Only references **inside `{{ }}`** are resolved; a bare `pass://` is left as-is.
- `--force` overwrites an existing output file; `--file-mode` sets output perms
  (default `0600`, i.e. owner-only — appropriate for files containing secrets).

Template `config.yaml.template`:
```yaml
database:
  host: db.example.com
  password: {{ pass://Production/Database/password }}
api:
  key: {{ pass://Production/API/key }}
```
```bash
pass-cli inject -i config.yaml.template -o config.yaml --force
```

**Prefer `run` over `inject` when you can** — `run` keeps secrets in memory only,
while `inject` writes them to a file on disk. If you must `inject`, keep the
output `0600`, treat it as sensitive, and delete it when done.

## Reading single values into shell variables

```bash
TOKEN=$(pass-cli item view "pass://Work/GitHub Account/password")
API_KEY=$(pass-cli item view --item-id "$ID" --field "api_key")
```
Logs go to stderr, so `$(...)` capture stays clean. Avoid `echo`-ing captured
secrets; pass them straight to the consumer.

## JSON output + jq

Set JSON globally or per command, then parse:
```bash
pass-cli settings set default-format json
pass-cli item list --vault-name "Work" | jq -r '.[].title'
pass-cli vault list --output json | jq -r '.[] | "\(.name)\t\(.shareId)"'
pass-cli item totp "pass://…/Item/TOTP 1" --output=json | jq -r '."TOTP 1"'
```
Commands supporting `--output json` include: `vault list`, `item list/view/totp`,
`user info`, `share list`, `invite list`, `agent list/renew/monitor`,
`pat list/renew`, `password score`, `ssh-agent debug`.

## Personal Access Tokens (PATs)

Use a PAT for unattended, non-agent automation (CI, cron). Scope it tightly.

```bash
# 1. Create (token shown ONCE — capture it now). Expiration is mandatory.
pass-cli pat create --name "ci-runner" --expiration 3m --output json

# 2. Grant least-privilege access to just what's needed.
pass-cli pat access grant --pat-name "ci-runner" --vault-name "CI Secrets" --role viewer

# 3. Authenticate with it (env var preferred over --flag).
PROTON_PASS_PERSONAL_ACCESS_TOKEN="pst_xxxx::TOKENKEY" pass-cli login

# Maintenance
pass-cli pat list
pass-cli pat access list-access
pass-cli pat renew  --pat-name "ci-runner" --expiration 3m
pass-cli pat access revoke --pat-name "ci-runner" --share-id "shareXYZ"
pass-cli pat delete --pat-name "ci-runner"
```
Valid `--expiration` values: `1d 1w 1m 3m 6m 1y`.

## Agent tokens (audited)

An `agent` is a PAT **with mandatory audit logging** — the right choice when an
AI assistant or autonomous job touches the vault, because every sensitive action
is recorded.

```bash
pass-cli agent create my-agent --expiration 3m --vault "Production"   # token + setup shown ONCE
pass-cli agent access grant my-agent --vault-name "Production" --role viewer

# Audited actions REQUIRE a reason string (stored encrypted):
PROTON_PASS_AGENT_REASON="Nightly backup of prod DB" \
  pass-cli item view --vault-name "Production" --item-title "DB password" --field password

pass-cli agent monitor my-agent --output json    # read the audit trail
pass-cli agent instructions                       # emit a ready-made usage guide
```
Audited operations: item view/create/update/trash/untrash/move and vault update.
If you forget `PROTON_PASS_AGENT_REASON`, those actions fail — set it per
invocation describing *why*.

## Guarded automation patterns

Always guard a script on session validity, and choose JSON for parsing:
```bash
#!/usr/bin/env bash
set -euo pipefail

if ! pass-cli test >/dev/null 2>&1; then
  echo "No valid Proton Pass session — run 'pass-cli login' first." >&2
  exit 1
fi

# Read what you need, do work, don't print secrets.
db_pw="$(pass-cli item view 'pass://Production/Database/password')"
DB_PASSWORD="$db_pw" ./run-migration.sh
```

For app startup, prefer wrapping the process so secrets never hit disk:
```bash
export DATABASE_URL='pass://Production/App/database_url'
export REDIS_URL='pass://Production/App/redis_url'
exec pass-cli run -- ./server
```
