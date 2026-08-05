/**
 * MCP tools for Vendors & Models management.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb } from "../db.js";
import { paginationSchema } from "../utils/pagination.js";

export function registerVendorsTools(server: McpServer): void {
  // ── san_vendors_list ────────────────────────────────────────────────
  server.tool(
    "san_vendors_list",
    "列出所有 AI 厂商和模型 (List all vendors with their models)",
    paginationSchema,
    async ({ limit, offset }) => {
      try {
        const db = getDb();

        const vendors = db
          .prepare(
            `SELECT id, name, path, icon, sort_order, is_active, created_at, updated_at
             FROM vendors
             WHERE is_active = 1
             ORDER BY sort_order ASC, name ASC
             LIMIT ? OFFSET ?`
          )
          .all(limit, offset) as any[];

        if (vendors.length === 0) {
          return {
            content: [{ type: "text" as const, text: "[]" }],
          };
        }

        const vendorPlaceholders = vendors.map(() => "?").join(", ");
        const models = db
          .prepare(
            `SELECT id, vendor_id, name, path, version, description, sort_order, is_active
             FROM models
             WHERE is_active = 1 AND vendor_id IN (${vendorPlaceholders})
             ORDER BY sort_order ASC, name ASC`
          )
          .all(...vendors.map((vendor) => vendor.id)) as any[];

        // Group models under their vendor
        const modelsByVendor = new Map<string, any[]>();
        for (const m of models) {
          const list = modelsByVendor.get(m.vendor_id) ?? [];
          list.push(m);
          modelsByVendor.set(m.vendor_id, list);
        }

        const result = vendors.map((v) => ({
          ...v,
          models: modelsByVendor.get(v.id) ?? [],
        }));

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
