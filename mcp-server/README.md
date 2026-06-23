# proton-pass-secrets (MCP)

Local **stdio** MCP server wrapping [`pass-cli`](https://protonpass.github.io/pass-cli/)
(Proton Pass). Lets Claude read, inject, and run-with secrets, plus manage SSH keys —
with every secret access carrying an audited `reason`.

## Security model

| Path | Session | Notes |
|------|---------|-------|
| **Reads** (`list_*`, `get_field`, `inject`, `run`, `ssh_agent_load`) | read-only **agent PAT** session in an isolated session dir; auto-login from `config.patFile` | |
| **Writes** (`create_login`, `import_ssh_key`) + `agent_monitor` | operator's **account session** (default session dir) | requires `pass-cli login` in your own shell; agent PATs are read-only (`NotAllowed`) |

- **Prefer `inject` / `run`** — they consume secrets *without returning values to the model*.
- **`get_field` exposes a plaintext value into the conversation** — last resort only.
- Server **never logs secret values** (only `subcommand exit=N` to stderr).
- Every secret-touching tool requires a `reason` → stored in Proton's encrypted audit log
  (inspect via `agent_monitor`).

## Tools

`list_vaults`, `list_items`, `get_field`, `inject`, `run`, `ssh_agent_load`,
`agent_monitor`, `create_login`, `import_ssh_key`.

## pass:// reference gotcha (handled automatically)

`item view` (→ `get_field`) resolves refs by **name**. But `run`/`inject` resolution only
accepts **share-id/item-id** — a name ref fails with `Share with id <name> not found`.
This server transparently rewrites friendly `pass://VaultName/ItemTitle/field` refs into
id-based refs (via a cached `item list`) before calling `run`/`inject`, so you can use names.

Caveat: for **embedded** refs inside a larger string (e.g.
`postgres://u:pass://.../pw@host`) the auto-rewrite is skipped — use id-based refs there.

## Config

Copy the example and edit the paths for your machine:

```bash
cp config.example.json config.json   # config.json is git-ignored — it points at your PAT file
```

`config.json` holds **paths only, no secret value**:

```json
{
  "passCliPath": "/path/to/pass-cli",
  "agentSessionDir": "/tmp/pass-agent-<name>",
  "patFile": "/path/to/agent-pat-instructions.md",
  "defaultVault": "Fleet"
}
```

The agent PAT is extracted (regex `pst_…::…`) from `patFile` at read time — so the token
itself never lives in this repo nor in the launch config.

## Install / register

```bash
npm install
claude mcp add -s user proton-pass-secrets -- node "$PWD/index.mjs"
```

Test: `node test/smoke.mjs`.

## Notes

- Keep `config.json` paths machine-correct (or switch to env-var overrides) when sharing
  across hosts. Only `config.example.json` ships; the real `config.json` is git-ignored.
- This server lives alongside the [`proton-pass-cli` skill](../SKILL.md) in this repo: the
  **MCP server is the guardrailed runtime for *using* secrets**, the **skill is the manual
  for *managing* the vault**.
