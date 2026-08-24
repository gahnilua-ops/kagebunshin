import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3456/mcp"));
const client = new Client(
  { name: "kai9000-sim", version: "1.0.0" },
  { capabilities: {} }
);

try {
  await client.connect(transport);
  console.log("== CONNECT OK ==");

  const tools = await client.listTools();
  console.log("== TOOLS ==");
  for (const t of tools.tools) {
    console.log(`  - ${t.name}: ${t.description.split(":")[0]}`);
  }

  const res = await client.callTool({ name: "kagebunshin_scan", arguments: {} });
  console.log("== TOOL CALL (missing required arg, expect isError) ==");
  console.log(JSON.stringify(res.content?.[0]?.text ?? res, null, 2).slice(0, 300));
  console.log("isError:", res.isError);

  await client.close();
  console.log("== SESSION CLOSED OK ==");
} catch (err) {
  console.error("FAILED:", err);
  process.exit(1);
}

