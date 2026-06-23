// Smoke test: spawn the server over stdio, list tools, call a read tool.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const transport = new StdioClientTransport({ command: "node", args: [join(root, "index.mjs")] });
const client = new Client({ name: "smoke", version: "0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

const vaults = await client.callTool({ name: "list_vaults", arguments: {} });
console.log("list_vaults ->", vaults.isError ? "ERROR" : "OK");
console.log(vaults.content[0].text);

const items = await client.callTool({ name: "list_items", arguments: { vault: "ssh" } });
console.log("list_items(ssh) ->", items.isError ? "ERROR" : "OK");
console.log(items.content[0].text);

await client.close();
process.exit(0);
