/**
 * MCP tools for Tags management.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db.js";
import { newId } from "../utils/uuid.js";
import { nowRfc3339 } from "../utils/datetime.js";
import { paginationSchema } from "../utils/pagination.js";

export function registerTagsTools(server: McpServer): void {
  // ── san_tags_list ───────────────────────────────────────────────────
  server.tool(
    "san_tags_list",
    "列出所有标签 (List all tags with hierarchy)",
    paginationSchema,
    async ({ limit, offset }) => {
      try {
        const db = getDb();
        const rows = db
          .prepare(
            `SELECT id, name, name_en, color, parent_id, use_count, is_builtin, created_at
             FROM tags
             ORDER BY use_count DESC, name ASC
             LIMIT ? OFFSET ?`
          )
          .all(limit, offset);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(rows, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ── san_tags_create ─────────────────────────────────────────────────
  server.tool(
    "san_tags_create",
    "创建新标签 (Create a new tag)",
    {
      name: z.string().describe("标签名称"),
      name_en: z.string().optional().describe("英文名称"),
      color: z.string().optional().describe("标签颜色 (hex, e.g. #FF6B6B)"),
      parent_id: z.string().optional().describe("父标签 ID"),
    },
    async ({ name, name_en, color, parent_id }) => {
      try {
        const db = getDb();
        const id = newId();
        const now = nowRfc3339();

        db.prepare(
          `INSERT INTO tags (id, name, name_en, color, parent_id, use_count, is_builtin, created_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
        ).run(id, name, name_en ?? null, color ?? null, parent_id ?? null, now);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ id, name, name_en, color, parent_id, created_at: now }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
