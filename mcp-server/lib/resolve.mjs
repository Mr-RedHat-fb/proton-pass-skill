// Rewrite friendly pass:// refs (by vault NAME / item TITLE) into id-based refs
// (pass://<share_id>/<item_id>/field), because `run`/`inject` resolution only accepts
// share-id/item-id — name lookup fails there ("Share with id <name> not found").
// `item view` (used by get_field) resolves names fine, so this is only for run/inject.

import { readPass, jsonOut } from "./pass.mjs";

// Proton share/item ids are long base64url strings (often ending in ==). Names/titles are short.
const ID_RE = /^[A-Za-z0-9_-]{40,}={0,2}$/;

const itemCache = new Map(); // vault name -> [{ title, id, share_id }]

async function itemsFor(vault) {
  if (itemCache.has(vault)) return itemCache.get(vault);
  const r = await readPass(["item", "list", vault, "--output", "json"]);
  if (r.code !== 0) throw new Error(`Cannot list items in vault "${vault}": ${(r.stderr || "").trim()}`);
  const j = jsonOut(r) || {};
  const items = (j.items || j || []).map((i) => ({ title: i.title ?? i.name, id: i.id, share_id: i.share_id }));
  itemCache.set(vault, items);
  return items;
}

// Resolve a single whole pass:// ref. If already id-based, returned unchanged.
export async function resolveOne(ref) {
  const body = ref.slice("pass://".length);
  const parts = body.split("/");
  if (parts.length < 3) return ref;
  const [a, b, ...rest] = parts;
  const field = rest.join("/");
  if (ID_RE.test(a) && ID_RE.test(b)) return ref; // already ids
  const items = await itemsFor(a);
  const it = items.find((x) => x.title === b);
  if (!it) throw new Error(`Item "${b}" not found in vault "${a}"`);
  if (!it.share_id || !it.id) throw new Error(`Item "${b}" in "${a}" missing share_id/id`);
  return `pass://${it.share_id}/${it.id}/${field}`;
}

// For run env values: only rewrite when the ENTIRE value is a single ref, to avoid
// mangling embedded refs like "postgres://u:pass://.../pw@host" (use ids for those).
export async function resolveEnvValue(val) {
  const t = String(val).trim();
  if (/^pass:\/\/\S+$/.test(t)) return resolveOne(t);
  return val;
}

// For inject templates: resolve refs inside {{ pass://... }} handlebars.
export async function resolveTemplate(text) {
  const matches = [...text.matchAll(/\{\{\s*(pass:\/\/[^}\s]+)\s*\}\}/g)];
  let out = text;
  for (const m of matches) {
    const resolved = await resolveOne(m[1]);
    if (resolved !== m[1]) out = out.split(m[0]).join(`{{ ${resolved} }}`);
  }
  return out;
}
