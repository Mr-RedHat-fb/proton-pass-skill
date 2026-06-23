// Thin, safe wrapper around the pass-cli binary.
// Two session modes:
//   - read  -> agent PAT session (isolated session dir), lazy auto-login from PAT file
//   - write -> account session (default session dir; operator must `pass-cli login` first)
// SECURITY: never logs stdout (may contain secrets). Only logs subcommand + exit code.

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dirname, "..", "config.json"), "utf8"));

const PASS = cfg.passCliPath || "pass-cli";
const AGENT_SESSION_DIR = cfg.agentSessionDir || "/tmp/pass-agent-mcp";
const PAT_FILE = cfg.patFile;

export const config = cfg;

const PAT_RE = /pst_[A-Za-z0-9]+::[A-Za-z0-9_-]+/;

function readPat() {
  if (!PAT_FILE) throw new Error("config.patFile not set; cannot authenticate read (agent) session");
  const m = readFileSync(PAT_FILE, "utf8").match(PAT_RE);
  if (!m) throw new Error(`No PAT (pst_...::...) found in ${PAT_FILE}`);
  return m[0];
}

// Low-level exec. opts: { write, reason, input, sshAuthSock }
function exec(args, opts = {}) {
  const env = { ...process.env, ...(opts.extraEnv || {}) };
  if (opts.reason) env.PROTON_PASS_AGENT_REASON = opts.reason;
  if (opts.sshAuthSock) env.SSH_AUTH_SOCK = opts.sshAuthSock;
  if (opts.write) {
    delete env.PROTON_PASS_SESSION_DIR; // account session lives in the default dir
  } else {
    env.PROTON_PASS_SESSION_DIR = AGENT_SESSION_DIR;
  }
  return new Promise((resolve) => {
    const child = execFile(PASS, args, { env, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof err.code === "number" ? err.code : err ? 1 : 0;
      process.stderr.write(`[pass] ${args[0]}${args[1] ? " " + args[1] : ""} exit=${code}\n`);
      resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
    });
    if (opts.input != null) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
  });
}

function isAuthError(r) {
  const s = (r.stderr || "") + (r.stdout || "");
  return /authenticated|requires an authenticated|no session|session.*expired/i.test(s);
}

// Authenticate the agent (read-only) session using the PAT from the configured file.
// PAT is passed via env, never argv, so it never shows in process listings.
function loginAgent() {
  const pat = readPat();
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      PROTON_PASS_SESSION_DIR: AGENT_SESSION_DIR,
      PROTON_PASS_PERSONAL_ACCESS_TOKEN: pat,
    };
    execFile(PASS, ["login"], { env }, (err) => {
      process.stderr.write(`[pass] agent login exit=${err ? (err.code ?? 1) : 0}\n`);
      resolve();
    });
  });
}

// Run a READ command under the agent session, auto-logging-in once on auth failure.
export async function readPass(args, opts = {}) {
  let r = await exec(args, { ...opts, write: false });
  if (r.code !== 0 && isAuthError(r)) {
    await exec(["logout", "--force"], { write: false });
    await loginAgent();
    r = await exec(args, { ...opts, write: false });
  }
  return r;
}

// Run a WRITE command under the account session. Verifies an account session exists first.
export async function writePass(args, opts = {}) {
  const info = await exec(["info", "--output", "json"], { write: true });
  const isAccount = /"email"|"username"/i.test(info.stdout) && !/\[Agent\]/.test(info.stdout);
  if (info.code !== 0 || !isAccount) {
    return {
      code: 1,
      stdout: "",
      stderr:
        "No writable account session. Agent PATs are read-only. In your own shell run:\n" +
        "  pass-cli login            # web, or: pass-cli login --interactive <email>\n" +
        "then retry. (Account session lives in the default session dir.)",
    };
  }
  return exec(args, { ...opts, write: true });
}

// Account-session command that is NOT a secret write but needs account privileges
// (e.g. agent monitor / agent list). Same auth requirement as writePass.
export const accountPass = writePass;

export function jsonOut(r) {
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}
