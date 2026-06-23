#!/usr/bin/env node
// Proton Pass secrets — local stdio MCP server wrapping pass-cli.
//
// SECURITY MODEL
//  - Reads use the read-only agent PAT session (auto-login from config.patFile).
//  - Writes use the operator's account session (default session dir; must `pass-cli login`).
//  - Prefer `inject` / `run`: they consume secrets WITHOUT returning values to the model.
//  - `get_field` DOES return a plaintext secret into the conversation — last resort, audited.
//  - Every secret access carries a mandatory `reason` (stored in Proton's encrypted audit log).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { readPass, writePass, accountPass, jsonOut, config } from "./lib/pass.mjs";
import { resolveEnvValue, resolveTemplate } from "./lib/resolve.mjs";

const server = new McpServer(
  { name: "proton-pass-secrets", version: "0.1.0" },
  {
    instructions:
      "Read/manage secrets from Proton Pass via pass-cli. Prefer `inject` and `run` so " +
      "secret values never enter the conversation; use `get_field` only when the value " +
      "itself is genuinely needed. All secret access requires a `reason` (audited). " +
      `The read token sees only granted vaults — Fleet, ssh, Wifi+network, Backups (default: ${config.defaultVault}). ` +
      "Personal/financial vaults are NOT visible to the agent by design.",
  }
);

const ok = (text) => ({ content: [{ type: "text", text }] });
const fail = (text) => ({ content: [{ type: "text", text }], isError: true });
const reasonField = z.string().min(3).describe("Why this secret is being accessed — stored in Proton's encrypted audit log.");

// ---------- READ TOOLS (agent session) ----------

server.registerTool(
  "list_vaults",
  {
    title: "List vaults",
    description: "List Proton Pass vaults the agent can see (names + ids). No secrets returned.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => {
    const r = await readPass(["vault", "list", "--output", "json"]);
    if (r.code !== 0) return fail(r.stderr || "vault list failed");
    const j = jsonOut(r);
    const vaults = (j?.vaults || []).map((v) => ({ name: v.name, vault_id: v.vault_id, share_id: v.share_id }));
    return ok(JSON.stringify(vaults, null, 2));
  }
);

server.registerTool(
  "list_items",
  {
    title: "List items in a vault",
    description: "List item titles + types in a vault. No secret values returned.",
    inputSchema: {
      vault: z.string().optional().describe(`Vault name (default: ${config.defaultVault}).`),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ vault }) => {
    const v = vault || config.defaultVault;
    const r = await readPass(["item", "list", v, "--output", "json"]);
    if (r.code !== 0) return fail(r.stderr || "item list failed");
    const j = jsonOut(r);
    const items = ((j?.items || j) || []).map((i) => ({
      title: i.title ?? i.name,
      type: i.item_type ?? i.type,
    }));
    return ok(JSON.stringify({ vault: v, items }, null, 2));
  }
);

server.registerTool(
  "get_field",
  {
    title: "Get a secret field (EXPOSES value)",
    description:
      "Return a single field's plaintext value (password, username, totp, custom, ...). " +
      "WARNING: the value enters the conversation. Prefer `inject`/`run` when the value " +
      "only needs to reach a file or a command. Requires a reason (audited).",
    inputSchema: {
      vault: z.string().describe("Vault name."),
      item: z.string().describe("Item title."),
      field: z.string().describe("Field name: password, username, email, url, note, totp, or a custom field."),
      reason: reasonField,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ vault, item, field, reason }) => {
    const r = await readPass(
      ["item", "view", "--vault-name", vault, "--item-title", item, "--field", field],
      { reason }
    );
    if (r.code !== 0) return fail(r.stderr || "item view failed");
    return ok(r.stdout.replace(/\n$/, ""));
  }
);

server.registerTool(
  "inject",
  {
    title: "Inject secrets into a template (no value exposure)",
    description:
      "Resolve {{ pass://vault/item/field }} references in a template and write the result to a file " +
      "(mode 0600 by default). Friendly refs by vault NAME / item TITLE are accepted (auto-rewritten to ids). " +
      "Returns only success + output path — secret values are NOT returned.",
    inputSchema: {
      out_file: z.string().describe("Output file path to write the rendered result to."),
      template: z.string().optional().describe("Inline template text (use this OR in_file)."),
      in_file: z.string().optional().describe("Path to a template file (use this OR template)."),
      force: z.boolean().optional().describe("Overwrite out_file without prompting."),
      file_mode: z.string().optional().describe("Octal file mode, e.g. \"0600\"."),
      reason: reasonField,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ out_file, template, in_file, force, file_mode, reason }) => {
    if (!template && !in_file) return fail("Provide either `template` or `in_file`.");
    if (template && in_file) return fail("Provide only one of `template` / `in_file`.");
    let src;
    try {
      src = template != null ? template : readFileSync(in_file, "utf8");
      src = await resolveTemplate(src); // rewrite name refs -> id refs
    } catch (e) {
      return fail(`Template/ref error: ${e.message}`);
    }
    // Always feed via stdin so name-resolution applies to both inline and file templates.
    const args = ["inject", "--out-file", out_file];
    if (force) args.push("--force");
    if (file_mode) args.push("--file-mode", file_mode);
    const r = await readPass(args, { reason, input: src });
    if (r.code !== 0) return fail(r.stderr || "inject failed");
    return ok(`Rendered secrets into ${out_file}` + (file_mode ? ` (mode ${file_mode})` : " (mode 0600)") + ".");
  }
);

server.registerTool(
  "run",
  {
    title: "Run a command with secrets as env vars (masked)",
    description:
      "Run a command with pass:// references resolved into environment variables. " +
      "Secrets are masked in output by default. Values do not enter the conversation unless no_masking=true.",
    inputSchema: {
      command: z.array(z.string()).min(1).describe("Command and args, e.g. [\"./deploy.sh\",\"--prod\"]."),
      env: z
        .record(z.string())
        .optional()
        .describe(
          "Env vars whose values may be pass:// refs (by vault NAME / item TITLE; auto-rewritten to ids), " +
            "e.g. {\"DB_PASSWORD\":\"pass://Server/db/password\"}."
        ),
      env_file: z.array(z.string()).optional().describe("Paths to .env files containing pass:// refs (later overrides earlier)."),
      no_masking: z.boolean().optional().describe("Disable masking — ONLY if you must see resolved output. Risky."),
      reason: reasonField,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ command, env, env_file, no_masking, reason }) => {
    const args = ["run"];
    for (const f of env_file || []) args.push("--env-file", f);
    if (no_masking) args.push("--no-masking");
    args.push("--", ...command);
    let extraEnv = {};
    try {
      for (const [k, v] of Object.entries(env || {})) extraEnv[k] = await resolveEnvValue(v);
    } catch (e) {
      return fail(`Ref error: ${e.message}`);
    }
    const r = await readPass(args, { reason, extraEnv });
    const body = `exit=${r.code}\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`;
    return r.code === 0 ? ok(body) : fail(body);
  }
);

server.registerTool(
  "ssh_agent_load",
  {
    title: "Load vault SSH keys into ssh-agent",
    description:
      "Load SSH key items from a vault into the running ssh-agent (uses SSH_AUTH_SOCK). " +
      "Returns a load summary; private keys are not exposed.",
    inputSchema: {
      vault: z.string().optional().describe("Vault to load keys from (default: ssh)."),
      ssh_auth_sock: z.string().optional().describe("Override SSH_AUTH_SOCK path."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ vault, ssh_auth_sock }) => {
    const sock = ssh_auth_sock || process.env.SSH_AUTH_SOCK;
    if (!sock) return fail("No SSH_AUTH_SOCK available. Start an ssh-agent first (eval $(ssh-agent)) or pass ssh_auth_sock.");
    const args = ["ssh-agent", "load", "--vault-name", vault || "ssh"];
    const r = await readPass(args, { sshAuthSock: sock });
    if (r.code !== 0) return fail(r.stderr || "ssh-agent load failed");
    return ok(r.stdout || "Loaded.");
  }
);

// ---------- AUDIT (account session) ----------

server.registerTool(
  "agent_monitor",
  {
    title: "Read an agent's audit log",
    description: "Show the encrypted access audit log for an agent token (requires account session).",
    inputSchema: {
      agent_name: z.string().describe("Agent name, e.g. \"stash\" or \"Agent-creds\"."),
      limit: z.number().int().positive().optional().describe("Max records (default 100)."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ agent_name, limit }) => {
    const args = ["agent", "monitor", agent_name, "--output", "json"];
    if (limit) args.push("--limit", String(limit));
    const r = await accountPass(args);
    if (r.code !== 0) return fail(r.stderr || "agent monitor failed");
    return ok(r.stdout);
  }
);

// ---------- WRITE TOOLS (account session) ----------

server.registerTool(
  "create_login",
  {
    title: "Create a login item",
    description:
      "Create a new login item in a vault (account session required). " +
      "Use generate_password to avoid passing a plaintext password as an argument.",
    inputSchema: {
      vault: z.string().describe("Vault name."),
      title: z.string().describe("Item title."),
      username: z.string().optional(),
      email: z.string().optional(),
      password: z.string().optional().describe("Plaintext password (prefer generate_password)."),
      generate_password: z.boolean().optional().describe("Generate a strong random password instead of supplying one."),
      url: z.array(z.string()).optional().describe("One or more URLs."),
      reason: reasonField,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ vault, title, username, email, password, generate_password, url, reason }) => {
    const args = ["item", "create", "login", "--vault-name", vault, "--title", title];
    if (username) args.push("--username", username);
    if (email) args.push("--email", email);
    if (generate_password) args.push("--generate-password");
    else if (password) args.push("--password", password);
    for (const u of url || []) args.push("--url", u);
    const r = await writePass(args, { reason });
    if (r.code !== 0) return fail(r.stderr || "create login failed");
    return ok(`Created login "${title}" in ${vault}.\n${r.stdout}`.trim());
  }
);

server.registerTool(
  "import_ssh_key",
  {
    title: "Import an SSH private key file",
    description: "Import an SSH key from a local private-key file into a vault (account session required).",
    inputSchema: {
      vault: z.string().describe("Vault name (typically \"ssh\")."),
      title: z.string().describe("Item title (e.g. host name)."),
      private_key_path: z.string().describe("Absolute path to the private key file."),
      reason: reasonField,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ vault, title, private_key_path, reason }) => {
    const args = [
      "item", "create", "ssh-key", "import",
      "--from-private-key", private_key_path,
      "--title", title,
      "--vault-name", vault,
    ];
    const r = await writePass(args, { reason });
    if (r.code !== 0) return fail(r.stderr || "ssh-key import failed");
    return ok(`Imported SSH key "${title}" into ${vault}.`);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("[proton-pass-secrets] MCP server ready (stdio)\n");
