#!/usr/bin/env node

/**
 * MCP stdio transport for Founder OS.
 *
 * Reads newline-delimited JSON-RPC messages from stdin,
 * routes them through the same handler used by the HTTP server,
 * and writes JSON-RPC responses to stdout.
 *
 * Usage:
 *   node server/mcp/mcpStdioTransport.js
 *   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node server/mcp/mcpStdioTransport.js
 *
 * VS Code MCP config (settings.json):
 *   "mcp": {
 *     "servers": {
 *       "founder-os": {
 *         "command": "node",
 *         "args": ["server/mcp/mcpStdioTransport.js"],
 *         "cwd": "/path/to/ai-founder-os"
 *       }
 *     }
 *   }
 */

const readline = require("readline");
const { handleJsonRpcRequest, notionProvider } = require("./mcpCore");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});

function send(response) {
    process.stdout.write(JSON.stringify(response) + "\n");
}

async function processLine(line) {
    const trimmed = line.trim();
    if (!trimmed) {
        return;
    }

    let body;
    try {
        body = JSON.parse(trimmed);
    } catch {
        send({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error: invalid JSON" },
        });
        return;
    }

    const response = await handleJsonRpcRequest(body);
    send(response);
}

async function main() {
    await notionProvider.validateConfiguredSchemas();

    process.stderr.write(`[founder-os] MCP stdio transport ready\n`);

    rl.on("line", (line) => {
        processLine(line).catch((error) => {
            send({
                jsonrpc: "2.0",
                id: null,
                error: { code: -32603, message: error?.message || "Internal error" },
            });
        });
    });

    rl.on("close", () => {
        process.exit(0);
    });
}

main().catch((error) => {
    process.stderr.write(`[founder-os] Startup failed: ${error?.message}\n`);
    process.exit(1);
});
