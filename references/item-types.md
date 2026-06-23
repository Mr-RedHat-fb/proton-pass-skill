# Item types, fields & templates

How to create each kind of Proton Pass item, how fields and sections work, and
how to build **custom items** of any shape. For the exact, current flag list of
a given type, also run `pass-cli item create <type> --help` — the published docs
under-document several types.

## Contents
- [The eight item types](#the-eight-item-types)
- [Two ways to create: flags vs. templates](#two-ways-to-create-flags-vs-templates)
- [Login items](#login-items)
- [SSH-key items](#ssh-key-items)
- [Alias items](#alias-items)
- [Fields, sections & the qualified `Section.field` form](#fields-sections--the-qualified-sectionfield-form)
- [Custom items — imagination is the limit](#custom-items--imagination-is-the-limit)
- [Reading fields back](#reading-fields-back)

## The eight item types

`pass-cli item create <TYPE>` accepts:

| TYPE | What it stores |
|------|----------------|
| `login` | Username/email/password/URLs (+ TOTP if added via another client) |
| `note` | A secure free-text note |
| `alias` | A Proton email alias (see also `item alias create`) |
| `credit-card` | Card number, expiry, CVV, cardholder |
| `identity` | Personal/address/contact/work detail fields |
| `ssh-key` | An SSH key pair (generate or import) |
| `wifi` | Wi-Fi network credentials |
| `custom` | Arbitrary sections + fields — define any structure you like |

`login`, `ssh-key`, and `alias` have documented flags below. `note`,
`credit-card`, `identity`, and `wifi` are best created with `--get-template` →
edit JSON → `--from-template`, because their per-field flags are thinly
documented; inspect the template the binary emits and fill it in.

## Two ways to create: flags vs. templates

1. **Flags** — fastest for simple items:
   ```bash
   pass-cli item create login --vault-name "Work" --title "GitHub" \
     --username "me" --generate-password --url "https://github.com"
   ```
2. **Templates** — best for complex/custom items, reproducibility, and scripting.
   Every `create` subcommand supports:
   - `--get-template` — print the JSON skeleton for that type to stdout.
   - `--from-template FILE` — create from a JSON file, or `--from-template -` to
     read JSON from **stdin** (keeps secrets out of argv and shell history).
   ```bash
   pass-cli item create login --get-template > login.json     # inspect the shape
   # …edit login.json…
   pass-cli item create login --from-template login.json --vault-name "Work"
   # or stream it without a file:
   echo '{"title":"Test","username":"u","password":"p","urls":["https://x"]}' \
     | pass-cli item create login --from-template - --share-id "abc123def"
   ```
   **Always run `--get-template` for a type before hand-writing its JSON** — it's
   the authoritative schema and avoids guessing field names.

## Login items

`pass-cli item create login [OPTIONS]`

| Flag | Meaning |
|------|---------|
| `--share-id ID` / `--vault-name NAME` | Target vault (mutually exclusive) |
| `--title TITLE` | Title (required unless using a template) |
| `--username USER` / `--email EMAIL` | Identity fields (optional) |
| `--password PASS` | Literal password (avoid — prefer generation/stdin) |
| `--generate-password[=SETTINGS]` | Generate; SETTINGS = `"length,uppercase,symbols"`, e.g. `="20,true,true"` |
| `--generate-passphrase[=WORD_COUNT]` | Generate a passphrase, e.g. `="5"` |
| `--url URL` | Associated URL (repeatable) |
| `--get-template` / `--from-template FILE\|-` | Template I/O |

Login template JSON:
```json
{
  "title": "Item Title",
  "username": "optional_username",
  "email": "optional_email@example.com",
  "password": "optional_password",
  "urls": ["https://example.com", "https://app.example.com"]
}
```

## SSH-key items

`pass-cli item create ssh-key <generate|import>`

**Generate:**
```bash
pass-cli item create ssh-key generate --title "GitHub Deploy Key" \
  [--share-id ID | --vault-name NAME] \
  [--key-type ed25519|rsa2048|rsa4096]   # default ed25519
  [--comment "text"] [--password]        # --password = passphrase-protect
```
**Import:**
```bash
pass-cli item create ssh-key import --from-private-key ~/.ssh/id_ed25519 \
  --title "My SSH Key" [--share-id ID | --vault-name NAME] [--password]
```
Passphrase for generate/import can come from `PROTON_PASS_SSH_KEY_PASSWORD` or
`PROTON_PASS_SSH_KEY_PASSWORD_FILE` instead of an interactive prompt.

Recommendation: keys stored in Pass are already encrypted at rest, so a passphrase
is optional **unless** you'll export the key for use outside Pass. To import a
passphrase-protected key, the cleanest path is to strip the passphrase first
(`ssh-keygen -p -f COPY -N ""` on a copy), import the copy, then securely delete
it (`shred -u` on Linux). The `ssh-agent` integration will auto-use a passphrase
stored as a Hidden custom field named `Password` or `Passphrase`.

## Alias items

```bash
pass-cli item alias create [--share-id ID | --vault-name NAME] --prefix PREFIX [--output json]
```
The created address is `PREFIX.SUFFIX` (suffix assigned by Proton).

## Fields, sections & the qualified `Section.field` form

- **Standard login fields:** `title username password email url note`.
- **Custom fields:** any name you use in `item update --field NAME=VALUE` that
  isn't a standard field is created as a custom field.
- **Sections:** custom, ssh-key, wifi, and identity items can group fields into
  named sections. When two sections share a field name, address the right one
  with `Section.field`:
  ```bash
  pass-cli item update --item-id ID \
    --field "Staging.password=..." \
    --field "Production.password=..."
  ```
  An unqualified name updates the first match found across sections.
- **Hidden fields** hold secret values (passphrases, API keys). Create/update
  them like any custom field; the SSH agent specifically looks for Hidden
  `Password`/`Passphrase`.
- **Not editable via CLI:** date fields and TOTP fields — use another Proton Pass
  client to change those.

## Custom items — imagination is the limit

A `custom` item is a free-form container: you define your own sections, each with
your own fields (plain text or hidden). This models anything — a database
credential set, a cloud service account, a server with bastion + app + DB
secrets, an IoT device, a software license, etc.

**Workflow:**
1. Get the schema the binary expects:
   ```bash
   pass-cli item create custom --get-template > custom.json
   ```
2. Shape the JSON: name the item, add sections, add fields (mark secrets as
   hidden). See `scaffolds/templates/custom-item.json` for a fully-worked example
   you can copy and adapt — it shows multiple sections and hidden fields.
3. Create it from the file or stdin:
   ```bash
   pass-cli item create custom --from-template custom.json --vault-name "Infra"
   # or, to keep secrets out of disk/argv:
   cat custom.json | pass-cli item create custom --from-template - --vault-name "Infra"
   ```
4. Later, tweak fields with the qualified form:
   ```bash
   pass-cli item update --vault-name "Infra" --item-title "Prod DB cluster" \
     --field "Primary.password=$(pass-cli password generate random --length 32)"
   ```

Because the exact custom-item JSON schema isn't fully documented, **always start
from `--get-template`** and match its structure rather than inventing keys.

## Reading fields back

```bash
pass-cli item view --vault-name "Infra" --item-title "Prod DB cluster" --output json   # whole item
pass-cli item view "pass://Infra/Prod DB cluster/Primary.password"                      # one section field
pass-cli item view --item-id ID --field "api_key"                                       # one custom field
```
Prefer single-field reads when you only need one value — don't dump the whole
item to the terminal unless asked.
