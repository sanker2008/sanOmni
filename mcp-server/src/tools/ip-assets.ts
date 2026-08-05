import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db.js";
import { newId } from "../utils/uuid.js";
import { nowRfc3339 } from "../utils/datetime.js";
import { paginationSchema } from "../utils/pagination.js";

/**
 * Register tools for managing IP Assets (sanIP domain).
 */
export function registerIpAssetTools(server: McpServer): void {
  // 1. san_ip_list
  server.tool(
    "san_ip_list",
    "List all IP assets. Returns id, name, avatar_path, description, created_at.",
    paginationSchema,
    async ({ limit, offset }) => {
      try {
        const db = getDb();
        const assets = db
          .prepare(
            `SELECT id, name, avatar_path, description, created_at
             FROM ip_assets
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`
          )
          .all(limit, offset);

        return {
          content: [{ type: "text", text: JSON.stringify(assets, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing IP assets: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 2. san_ip_get
  server.tool(
    "san_ip_get",
    "Get IP asset detail including character sheets, creations, sticker packs (with emojis), and relations.",
    {
      ip_id: z.string().describe("The ID of the IP asset to fetch"),
    },
    async ({ ip_id }) => {
      try {
        const db = getDb();
        const asset = db
          .prepare("SELECT * FROM ip_assets WHERE id = ?")
          .get(ip_id);

        if (!asset) {
          return {
            content: [
              {
                type: "text",
                text: `Error: IP asset with id '${ip_id}' not found.`,
              },
            ],
            isError: true,
          };
        }

        const characterSheets = db
          .prepare(
            `SELECT * FROM ip_character_sheets
             WHERE ip_id = ?
             ORDER BY sort_order ASC, created_at ASC`
          )
          .all(ip_id);

        const creations = db
          .prepare(
            `SELECT * FROM ip_creations
             WHERE ip_id = ?
             ORDER BY created_at DESC`
          )
          .all(ip_id);

        const stickerPacks = db
          .prepare(
            `SELECT * FROM ip_sticker_packs
             WHERE ip_id = ?
             ORDER BY created_at ASC`
          )
          .all(ip_id) as any[];

        const emojis = db
          .prepare(
            `SELECT * FROM ip_emojis
             WHERE ip_id = ?
             ORDER BY sort_order ASC, created_at ASC`
          )
          .all(ip_id) as any[];

        const stickerPacksWithEmojis = stickerPacks.map((pack) => ({
          ...pack,
          emojis: emojis.filter((emoji) => emoji.pack_id === pack.id),
        }));

        const relations = db
          .prepare(
            `SELECT * FROM ip_relations
             WHERE ip_a_id = ? OR ip_b_id = ?
             ORDER BY created_at ASC`
          )
          .all(ip_id, ip_id);

        const result = {
          ...(asset as object),
          character_sheets: characterSheets,
          creations,
          sticker_packs: stickerPacksWithEmojis,
          relations,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting IP asset: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 3. san_ip_create
  server.tool(
    "san_ip_create",
    "Create a new IP asset.",
    {
      name: z.string().describe("Name of the IP asset"),
      description:
        z.string().optional().describe("Description of the IP asset"),
      inspiration:
        z.string().optional().describe("Inspiration for the IP asset"),
    },
    async ({ name, description, inspiration }) => {
      try {
        const db = getDb();
        const id = newId();
        const now = nowRfc3339();

        let pathSlug = name
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, "")
          .replace(/[\s_-]+/g, "-")
          .replace(/^-+|-+$/g, "");

        let path = pathSlug || id;
        const existing = db
          .prepare("SELECT id FROM ip_assets WHERE path = ?")
          .get(path);
        if (existing) {
          path = `${pathSlug ? pathSlug + "-" : ""}${id.slice(0, 8)}`;
        }

        db.prepare(
          `INSERT INTO ip_assets (id, name, path, avatar_path, inspiration, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          name,
          path,
          null,
          inspiration ?? null,
          description ?? null,
          now,
          now
        );

        const newAsset = db
          .prepare("SELECT * FROM ip_assets WHERE id = ?")
          .get(id);

        return {
          content: [{ type: "text", text: JSON.stringify(newAsset, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating IP asset: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 4. san_ip_update
  server.tool(
    "san_ip_update",
    "Update an existing IP asset.",
    {
      ip_id: z.string().describe("The ID of the IP asset to update"),
      name: z.string().optional().describe("New name of the IP asset"),
      description:
        z.string().optional().describe("New description of the IP asset"),
      inspiration:
        z.string().optional().describe("New inspiration for the IP asset"),
    },
    async ({ ip_id, name, description, inspiration }) => {
      try {
        const db = getDb();
        const existing = db
          .prepare("SELECT * FROM ip_assets WHERE id = ?")
          .get(ip_id) as any;

        if (!existing) {
          return {
            content: [
              {
                type: "text",
                text: `Error: IP asset with id '${ip_id}' not found.`,
              },
            ],
            isError: true,
          };
        }

        const updatedName = name !== undefined ? name : existing.name;
        const updatedDescription =
          description !== undefined ? description : existing.description;
        const updatedInspiration =
          inspiration !== undefined ? inspiration : existing.inspiration;
        const now = nowRfc3339();

        db.prepare(
          `UPDATE ip_assets
           SET name = ?, description = ?, inspiration = ?, updated_at = ?
           WHERE id = ?`
        ).run(updatedName, updatedDescription, updatedInspiration, now, ip_id);

        const updatedAsset = db
          .prepare("SELECT * FROM ip_assets WHERE id = ?")
          .get(ip_id);

        return {
          content: [
            { type: "text", text: JSON.stringify(updatedAsset, null, 2) },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating IP asset: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 5. san_ip_delete
  server.tool(
    "san_ip_delete",
    "Delete an IP asset.",
    {
      ip_id: z.string().describe("The ID of the IP asset to delete"),
    },
    async ({ ip_id }) => {
      try {
        const db = getDb();
        const existing = db
          .prepare("SELECT id FROM ip_assets WHERE id = ?")
          .get(ip_id);

        if (!existing) {
          return {
            content: [
              {
                type: "text",
                text: `Error: IP asset with id '${ip_id}' not found.`,
              },
            ],
            isError: true,
          };
        }

        db.prepare("DELETE FROM ip_assets WHERE id = ?").run(ip_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `IP asset ${ip_id} deleted successfully`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting IP asset: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
