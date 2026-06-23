# Authentication, installation & configuration

Everything about getting `pass-cli` installed, logged in, and configured —
including the environment variables and the keyring/headless pitfalls that cause
most real-world failures.

## Contents
- [Installation](#installation)
- [Authentication modes](#authentication-modes)
- [Credential environment variables](#credential-environment-variables)
- [Session & key storage](#session--key-storage)
- [Other environment variables](#other-environment-variables)
- [Troubleshooting](#troubleshooting)

## Installation

Platforms: macOS (x86_64 + arm64), Linux (x86_64 + aarch64), Windows (x86_64 only).

**Official install script (recommended).**
```bash
# Linux / macOS  (needs curl + jq)
curl -fsSL https://proton.me/download/pass-cli/install.sh | bash
```
```powershell
# Windows (PowerShell)
Invoke-WebRequest -Uri https://proton.me/download/pass-cli/install.ps1 -OutFile install.ps1; .\install.ps1
```
The script auto-detects the platform, downloads the latest release, verifies
integrity, and adds the binary to PATH.

**Homebrew (macOS/Linux):** install via the official tap. Note: updates are then
managed by Homebrew — the built-in `pass-cli update` and track switching do
**not** apply to brew installs.

**Manual binary:** download the platform binary from the releases page, verify the
SHA256, `chmod +x`, and place it on PATH.

**From source (Rust stable):** `cargo build --release` → `target/release/pass-cli`.

Verify: `pass-cli --version`. Shell completions: `pass-cli completions <bash|zsh|fish>`.

## Authentication modes

1. **Web login (default, recommended).** `pass-cli login` prints a URL for
   browser auth. The only mode supporting **SSO** and **U2F hardware keys**.
2. **Interactive login.** `pass-cli login --interactive [USERNAME]`
   (e.g. `pass-cli login --interactive user@proton.me`). Prompts walk through
   password → 2FA (TOTP) → extra password (if set) → initial vault setup →
   permission check. Supports TOTP and the Proton "extra password" but **not**
   SSO/U2F.
3. **Personal Access Token (headless / CI).**
   ```bash
   PROTON_PASS_PERSONAL_ACCESS_TOKEN="pst_xxxx...xxxx::TOKENKEY" pass-cli login
   # or (less safe — visible in argv):
   pass-cli login --personal-access-token "pst_xxxx...xxxx::TOKENKEY"
   ```
   Create the token with `pass-cli pat create` (see `references/automation.md`).

Verify/teardown: `pass-cli info` (who am I), `pass-cli test` (session valid?),
`pass-cli logout` (remote+local), `pass-cli logout --force` (local only).

## Credential environment variables

Used by interactive/token login. **Resolution order for each: direct env value →
file named by the `*_FILE` variant → interactive prompt.** Restrict any
credential file to mode `600`.

| Variable | `*_FILE` variant | Purpose |
|----------|------------------|---------|
| `PROTON_PASS_PASSWORD` | `PROTON_PASS_PASSWORD_FILE` | Account password |
| `PROTON_PASS_TOTP` | `PROTON_PASS_TOTP_FILE` | 2FA TOTP code |
| `PROTON_PASS_EXTRA_PASSWORD` | `PROTON_PASS_EXTRA_PASSWORD_FILE` | Proton "extra password" |
| `PROTON_PASS_PERSONAL_ACCESS_TOKEN` | — | PAT/agent token login |

## Session & key storage

**Session directory** (override with `PROTON_PASS_SESSION_DIR`):
- macOS: `~/Library/Application Support/proton-pass-cli/.session/`
- Linux: `~/.local/share/proton-pass-cli/.session/`
- Windows: not stated in docs.

**Encryption-key backend** — `PROTON_PASS_KEY_PROVIDER`:
- `keyring` (default): OS secure store (Keychain / Windows Credential Manager /
  Linux keyring). The Linux *kernel* keyring clears on reboot — set
  `PROTON_PASS_LINUX_KEYRING=dbus` for persistence on desktops.
- `fs`: key written to `<session-dir>/local.key` (perms 0600). **The key sits in
  plaintext next to the encrypted data** — acceptable only in controlled CI,
  never on a shared host.
- `env`: set `PROTON_PASS_KEY_PROVIDER=env` and supply
  `PROTON_PASS_ENCRYPTION_KEY=...`. Generate one with:
  ```bash
  dd if=/dev/urandom bs=1 count=2048 2>/dev/null | sha256sum | awk '{print $1}'
  ```
  Note: env vars are visible to other processes on the host.

## Other environment variables

| Variable | Effect |
|----------|--------|
| `PASS_LOG_LEVEL` | `trace\|debug\|info\|warn\|error\|off`; logs go to **stderr** |
| `PROTON_PASS_NO_UPDATE_CHECK` | Suppress the ~3-day update check |
| `PROTON_PASS_DISABLE_TELEMETRY` | Disable anonymized telemetry (on by default; no secrets sent) |
| `PROTON_PASS_AGENT_REASON` | Required "reason" string for agent-audited actions (stored encrypted) |
| `PROTON_PASS_SSH_KEY_PASSWORD` / `_FILE` | Passphrase for SSH key generate/import |

## Troubleshooting

- **Keyring errors in Docker/SSH/headless** (`Client feature`, `NoStorageAccess`,
  D-Bus errors): there's no secure keyring. Run `pass-cli logout --force`, then
  set `PROTON_PASS_KEY_PROVIDER=fs` (plaintext key on disk — controlled CI only)
  or, on a desktop, `PROTON_PASS_LINUX_KEYRING=dbus`. Remember the kernel keyring
  clears on reboot.
- **`logout --force` left the session active in account settings.** Expected — it
  only cleans up locally. Use plain `logout` when the network allows.
- **Windows install blocked** by PowerShell execution policy: `Set-ExecutionPolicy
  RemoteSigned`. To use `ssh-agent` on Windows, disable the built-in OpenSSH agent.
- **`pass-cli update` does nothing** on Homebrew/package-manager installs — update
  through the package manager instead.
- **Token "lost".** PAT/agent tokens are shown only once at creation. If lost,
  delete and recreate the token.
- **Logs polluting output.** They're on stderr by design; redirect with `2>/dev/null`
  if you only want stdout for piping.
