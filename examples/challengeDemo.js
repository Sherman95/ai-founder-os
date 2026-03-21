const readline = require("readline");
const env = require("dotenv").config() && process.env;

const MCP_PORT = Number(env.MCP_PORT || 7337);
const endpoint = `http://localhost:${MCP_PORT}/mcp`;

async function rpc(method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }
  return json.result;
}

function waitForEnter(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  const ideaPageId = process.argv[2] || env.DEMO_IDEA_PAGE_ID;
  if (!ideaPageId) {
    throw new Error("Provide ideaPageId as first argument or set DEMO_IDEA_PAGE_ID in env");
  }

  console.log("MCP endpoint:", endpoint);

  const health = await rpc("tools/call", { name: "founder.health", arguments: {} });
  console.log("founder.health =>", health);

  const runResult = await rpc("tools/call", {
    name: "founder.run_idea",
    arguments: { ideaPageId },
  });
  console.log("founder.run_idea =>", runResult);

  console.log("\nHuman step required:");
  console.log("1) Go to Notion output DB (Competitors/Roadmap/Marketing)");
  console.log("2) Mark one row Needs Review = checked");
  console.log("3) Fill Correction Notes with the requested correction");

  await waitForEnter("\nPress ENTER after you finish the review edits in Notion... ");

  const reviews = await rpc("tools/call", {
    name: "founder.list_reviews",
    arguments: { ideaPageId, limit: 25 },
  });
  console.log("founder.list_reviews =>", reviews);

  const apply = await rpc("tools/call", {
    name: "founder.apply_corrections",
    arguments: { ideaPageId, limit: 10 },
  });
  console.log("founder.apply_corrections =>", apply);

  console.log("\nUpdated rows:", apply.updated);
  if (Array.isArray(apply.errors) && apply.errors.length) {
    console.log("Errors:", apply.errors);
  }
}

main().catch((error) => {
  console.error("Challenge demo failed:", error.message);
  process.exit(1);
});
