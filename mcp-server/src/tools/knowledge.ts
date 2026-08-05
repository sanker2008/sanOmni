/**
 * MCP tools for the Knowledge Base domain (sanKnow).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db.js";
import { newId } from "../utils/uuid.js";
import { nowRfc3339 } from "../utils/datetime.js";
import { paginationSchema } from "../utils/pagination.js";

export function registerKnowledgeTools(server: McpServer): void {
  // ── san_know_list_projects ──────────────────────────────────────────
  server.tool(
    "san_know_list_projects",
    "列出所有知识库项目 (List all knowledge base projects)",
    paginationSchema,
    async ({ limit, offset }) => {
      try {
        const db = getDb();
        const rows = db
          .prepare(
            `SELECT id, name, root_path, last_indexed_at, created_at, updated_at
             FROM knowledge_projects
             ORDER BY updated_at DESC
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

  // ── san_know_search ─────────────────────────────────────────────────
  server.tool(
    "san_know_search",
    "搜索知识库条目 (Search knowledge entries by keyword)",
    {
      ...paginationSchema,
      query: z.string().describe("搜索关键词"),
      project_id: z.string().optional().describe("限定到某个知识库项目"),
    },
    async ({ query, project_id, limit, offset }) => {
      try {
        const db = getDb();
        const pattern = `%${query}%`;
        let sql = `SELECT e.id, e.title, e.entry_type, e.source_path, e.source_url,
                          substr(e.content, 1, 300) AS content_preview,
                          p.name AS project_name, e.updated_at
                   FROM knowledge_entries e
                   JOIN knowledge_projects p ON e.project_id = p.id
                   WHERE (e.title LIKE ? OR e.content LIKE ?)`;
        const params: any[] = [pattern, pattern];

        if (project_id) {
          sql += ` AND e.project_id = ?`;
          params.push(project_id);
        }

        sql += ` ORDER BY e.updated_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const rows = db.prepare(sql).all(...params);
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

  // ── san_know_create_entry ───────────────────────────────────────────
  server.tool(
    "san_know_create_entry",
    "创建本地知识库条目（不会同步到云端） (Create a local knowledge entry; not cloud-synced)",
    {
      project_id: z.string().describe("所属知识库项目 ID"),
      title: z.string().describe("条目标题"),
      content: z.string().describe("条目内容"),
      entry_type: z.string().describe("条目类型 (e.g. note, code, doc)"),
      source_path: z.string().optional().describe("来源文件路径"),
      source_url: z.string().optional().describe("来源 URL"),
    },
    async ({ project_id, title, content, entry_type, source_path, source_url }) => {
      try {
        const db = getDb();
        const id = newId();
        const now = nowRfc3339();

        db.prepare(
          `INSERT INTO knowledge_entries
           (id, project_id, title, content, entry_type, source_path, source_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, project_id, title, content, entry_type, source_path ?? null, source_url ?? null, now, now);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ id, project_id, title, entry_type, created_at: now }, null, 2),
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
