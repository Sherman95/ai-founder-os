const env = require("dotenv").config() && process.env;

const MCP_PORT = Number(env.MCP_PORT || 7337);
const endpoint = `http://localhost:${MCP_PORT}/mcp`;

async function rpc(method, params) {
  const body = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }

  return json.result;
}

async function main() {
  const ideaPageId = process.argv[2];

  console.log("MCP endpoint:", endpoint);
  console.log("tools/list");
  console.log(await rpc("tools/list", {}));

  console.log("founder.health");
  console.log(await rpc("tools/call", { name: "founder.health", arguments: {} }));

  console.log("founder.list_ideas_to_run");
  console.log(await rpc("tools/call", { name: "founder.list_ideas_to_run", arguments: {} }));

  if (ideaPageId) {
    console.log("founder.run_idea");
    console.log(
      await rpc("tools/call", {
        name: "founder.run_idea",
        arguments: { ideaPageId },
      })
    );
  }
}

main().catch((error) => {
  console.error("MCP demo failed:", error.message);
  process.exit(1);
});
