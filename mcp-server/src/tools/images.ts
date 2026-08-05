/**
 * MCP tools for Image queries (read-only).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db.js";
import { paginationSchema } from "../utils/pagination.js";

export function registerImagesTools(server: McpServer): void {
  // ── san_images_list ─────────────────────────────────────────────────
  server.tool(
    "san_images_list",
    "查询图片列表 (Query images with optional filters)",
    {
      ...paginationSchema,
      status: z
        .string()
        .optional()
        .describe("筛选状态: inbox, tagged, archived"),
      model_id: z.string().optional().describe("按模型 ID 筛选"),
      vendor_id: z.string().optional().describe("按厂商 ID 筛选"),
      search: z.string().optional().describe("搜索 prompt 关键词"),
    },
    async ({ status, model_id, vendor_id, search, limit, offset }) => {
      try {
        const db = getDb();
        const conditions: string[] = [];
        const params: any[] = [];

        if (status) {
          conditions.push("i.status = ?");
          params.push(status);
        }
        if (model_id) {
          conditions.push("i.primary_model_id = ?");
          params.push(model_id);
        }
        if (vendor_id) {
          conditions.push("i.storage_vendor_id = ?");
          params.push(vendor_id);
        }
        if (search) {
          conditions.push("i.prompt LIKE ?");
          params.push(`%${search}%`);
        }

        const whereClause =
          conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const sql = `
          SELECT i.id, i.filename, i.relative_path, i.absolute_path,
                 i.status, i.prompt, i.width, i.height, i.format,
                 i.has_watermark, i.watermark_removed,
                 v.name AS vendor_name, m.name AS model_name,
                 i.imported_at, i.archived_at
          FROM images i
          LEFT JOIN vendors v ON i.storage_vendor_id = v.id
          LEFT JOIN models m ON i.primary_model_id = m.id
          ${whereClause}
          ORDER BY i.imported_at DESC
          LIMIT ? OFFSET ?`;

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

  // ── san_images_get ──────────────────────────────────────────────────
  server.tool(
    "san_images_get",
    "获取图片详情 (Get image detail with model/vendor info and prompt groups)",
    {
      image_id: z.string().describe("图片 ID"),
    },
    async ({ image_id }) => {
      try {
        const db = getDb();

        const image = db
          .prepare(
            `SELECT i.*,
                    v.name AS vendor_name, v.path AS vendor_path,
                    m.name AS model_name, m.path AS model_path
             FROM images i
             LEFT JOIN vendors v ON i.storage_vendor_id = v.id
             LEFT JOIN models m ON i.primary_model_id = m.id
             WHERE i.id = ?`
          )
          .get(image_id);

        if (!image) {
          return {
            content: [{ type: "text" as const, text: `Error: Image not found: ${image_id}` }],
            isError: true,
          };
        }

        // Get associated prompt groups
        const groups = db
          .prepare(
            `SELECT pg.id, pg.name, pg.prompt, pg.category,
                    r.role, r.is_cover, r.sort_order
             FROM image_prompt_group_relations r
             JOIN prompt_groups pg ON r.prompt_group_id = pg.id
             WHERE r.image_id = ?`
          )
          .all(image_id);

        // Get associated tags
        const tags = db
          .prepare(
            `SELECT t.id, t.name, t.name_en, t.color
             FROM image_tag_relations itr
             JOIN tags t ON itr.tag_id = t.id
             WHERE itr.image_id = ?`
          )
          .all(image_id);

        const result = { ...(image as any), prompt_groups: groups, tags };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
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
