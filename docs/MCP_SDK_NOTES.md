# MCP SDK Notes

Date: 2026-03-21

## Decision

For this release, the Founder OS MCP server is implemented as a minimal JSON-RPC service over HTTP transport (`/mcp`) to guarantee compatibility and deterministic behavior in this repository without introducing unverified SDK assumptions.

## What was evaluated

- Existing codebase had no MCP SDK dependency.
- Runtime is CommonJS/Node server-centric and currently stable.
- Requirement includes a fallback path when exact MCP SDK support is uncertain.

## Why this approach now

- Keeps release risk low and implementation transparent.
- Provides stable tool contract for VS Code and backup demo client.
- Avoids dependency lock-in to an unverified package/API variant at release time.

## Future upgrade path

- Replace `server/mcp/server.js` transport with official Node MCP SDK transport once package/API is fully verified in this repo context.
- Keep existing tool handlers in `server/mcp/tools/*` unchanged.
