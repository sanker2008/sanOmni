#!/usr/bin/env node
/**
 * SanOmni MCP Server — entry point.
 *
 * Exposes sanIP, sanPrompt, sanWorks, sanKnow, and supporting
 * data operations as MCP tools over stdio transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeDb } from "./db.js";

// Tool registration functions from each domain
import { registerIpAssetTools } from "./tools/ip-assets.js";
import { registerPromptGroupsTools } from "./tools/prompt-groups.js";
import { registerWorksTools } from "./tools/works.js";
import { registerCharactersTools } from "./tools/characters.js";
import { registerChaptersTools } from "./tools/chapters.js";
import { registerKnowledgeTools } from "./tools/knowledge.js";
import { registerTagsTools } from "./tools/tags.js";
import { registerVendorsTools } from "./tools/vendors.js";
import { registerImagesTools } from "./tools/images.js";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "sanomni",
    version: "1.0.0",
  });

  // ── Register all domain tools ───────────────────────────────────────
  registerIpAssetTools(server);
  registerPromptGroupsTools(server);
  registerWorksTools(server);
  registerCharactersTools(server);
  registerChaptersTools(server);
  registerKnowledgeTools(server);
  registerTagsTools(server);
  registerVendorsTools(server);
  registerImagesTools(server);

  // ── Start stdio transport ───────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  process.on("SIGINT", () => {
    closeDb();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    closeDb();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal: MCP server failed to start", err);
  process.exit(1);
});
