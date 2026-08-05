import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db.js";
import { newId } from "../utils/uuid.js";
import { nowRfc3339 } from "../utils/datetime.js";
import { paginationSchema } from "../utils/pagination.js";

/**
 * Register all MCP tools for Work Characters (sanCharacters).
 */
export function registerCharactersTools(server: McpServer): void {
  // 1. san_characters_list
  server.tool(
    "san_characters_list",
    "List characters for a work (excluding soft-deleted characters), ordered by display order",
    {
      ...paginationSchema,
      work_id: z.string().describe("ID of the work to list characters for"),
    },
    async ({ work_id, limit, offset }) => {
      try {
        const db = getDb();
        const characters = db
          .prepare(
            `SELECT c.*, w.name AS work_name, ip.name AS ip_name
             FROM characters c
             LEFT JOIN works w ON c.work_id = w.id
             LEFT JOIN ip_assets ip ON c.ip_id = ip.id
             WHERE c.work_id = ? AND c.deleted_at IS NULL
             ORDER BY c.display_order ASC, c.created_at ASC
             LIMIT ? OFFSET ?`
          )
          .all(work_id, limit, offset);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(characters, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing characters: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 2. san_characters_get
  server.tool(
    "san_characters_get",
    "Get detailed character information including linked work name and IP asset name",
    {
      character_id: z.string().describe("ID of the character to retrieve"),
    },
    async ({ character_id }) => {
      try {
        const db = getDb();
        const character = db
          .prepare(
            `SELECT c.*, w.name AS work_name, ip.name AS ip_name
             FROM characters c
             LEFT JOIN works w ON c.work_id = w.id
             LEFT JOIN ip_assets ip ON c.ip_id = ip.id
             WHERE c.id = ? AND c.deleted_at IS NULL`
          )
          .get(character_id);

        if (!character) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Character with ID '${character_id}' not found`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(character, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting character: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 3. san_characters_create
  server.tool(
    "san_characters_create",
    "Create a new local character in a work (not cloud-synced)",
    {
      work_id: z.string().describe("ID of the work this character belongs to"),
      name: z.string().describe("Name of the character"),
      character_type: z
        .string()
        .optional()
        .describe("Role/type of character: protagonist, supporting, antagonist, guest, cameo, other"),
      description: z.string().optional().describe("Description or background story of the character"),
      appearance_info: z.string().optional().describe("Appearance details and visual features"),
      ip_id: z.string().optional().describe("ID of an associated IP asset if linked"),
      ip_relation_note: z.string().optional().describe("Note describing relationship to the linked IP asset"),
    },
    async ({
      work_id,
      name,
      character_type,
      description,
      appearance_info,
      ip_id,
      ip_relation_note,
    }) => {
      try {
        const db = getDb();

        // Verify work exists and is not soft deleted
        const work = db
          .prepare("SELECT id FROM works WHERE id = ? AND deleted_at IS NULL")
          .get(work_id);
        if (!work) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Work with ID '${work_id}' not found`,
              },
            ],
            isError: true,
          };
        }

        // Get max display_order for characters in this work
        const maxOrderRow = db
          .prepare(
            `SELECT MAX(display_order) AS max_order
             FROM characters
             WHERE work_id = ? AND deleted_at IS NULL`
          )
          .get(work_id) as { max_order: number | null } | undefined;

        const display_order = (maxOrderRow?.max_order ?? -1) + 1;
        const id = newId();
        const now = nowRfc3339();

        db.prepare(
          `INSERT INTO characters (
            id, work_id, name, character_type, description,
            appearance_info, ip_id, ip_relation_note, display_order,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          work_id,
          name,
          character_type ?? null,
          description ?? null,
          appearance_info ?? null,
          ip_id ?? null,
          ip_relation_note ?? null,
          display_order,
          now,
          now
        );

        // Retrieve created character with joined work and IP asset names
        const createdCharacter = db
          .prepare(
            `SELECT c.*, w.name AS work_name, ip.name AS ip_name
             FROM characters c
             LEFT JOIN works w ON c.work_id = w.id
             LEFT JOIN ip_assets ip ON c.ip_id = ip.id
             WHERE c.id = ?`
          )
          .get(id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(createdCharacter, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating character: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 4. san_characters_update
  server.tool(
    "san_characters_update",
    "Update an existing local character (not cloud-synced)",
    {
      character_id: z.string().describe("ID of the character to update"),
      name: z.string().optional().describe("Updated character name"),
      character_type: z
        .string()
        .optional()
        .describe("Updated character role/type (protagonist, supporting, antagonist, guest, cameo, other)"),
      description: z.string().optional().describe("Updated description"),
      appearance_info: z.string().optional().describe("Updated appearance details"),
      ip_id: z.string().optional().describe("Updated IP asset ID (or null/empty to unlink)"),
      ip_relation_note: z.string().optional().describe("Updated IP relation note"),
      display_order: z.number().optional().describe("Updated display order position"),
    },
    async ({
      character_id,
      name,
      character_type,
      description,
      appearance_info,
      ip_id,
      ip_relation_note,
      display_order,
    }) => {
      try {
        const db = getDb();

        const existing = db
          .prepare("SELECT id FROM characters WHERE id = ? AND deleted_at IS NULL")
          .get(character_id);

        if (!existing) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Character with ID '${character_id}' not found`,
              },
            ],
            isError: true,
          };
        }

        const now = nowRfc3339();
        const updates: string[] = ["updated_at = ?"];
        const params: any[] = [now];

        if (name !== undefined) {
          updates.push("name = ?");
          params.push(name);
        }
        if (character_type !== undefined) {
          updates.push("character_type = ?");
          params.push(character_type);
        }
        if (description !== undefined) {
          updates.push("description = ?");
          params.push(description);
        }
        if (appearance_info !== undefined) {
          updates.push("appearance_info = ?");
          params.push(appearance_info);
        }
        if (ip_id !== undefined) {
          updates.push("ip_id = ?");
          params.push(ip_id);
        }
        if (ip_relation_note !== undefined) {
          updates.push("ip_relation_note = ?");
          params.push(ip_relation_note);
        }
        if (display_order !== undefined) {
          updates.push("display_order = ?");
          params.push(display_order);
        }

        params.push(character_id);

        db.prepare(
          `UPDATE characters SET ${updates.join(", ")} WHERE id = ?`
        ).run(...params);

        const updatedCharacter = db
          .prepare(
            `SELECT c.*, w.name AS work_name, ip.name AS ip_name
             FROM characters c
             LEFT JOIN works w ON c.work_id = w.id
             LEFT JOIN ip_assets ip ON c.ip_id = ip.id
             WHERE c.id = ?`
          )
          .get(character_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(updatedCharacter, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating character: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 5. san_characters_delete
  server.tool(
    "san_characters_delete",
    "Soft delete a local character (not cloud-synced)",
    {
      character_id: z.string().describe("ID of the character to delete"),
    },
    async ({ character_id }) => {
      try {
        const db = getDb();

        const existing = db
          .prepare("SELECT id FROM characters WHERE id = ? AND deleted_at IS NULL")
          .get(character_id);

        if (!existing) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Character with ID '${character_id}' not found`,
              },
            ],
            isError: true,
          };
        }

        const now = nowRfc3339();
        db.prepare(
          "UPDATE characters SET deleted_at = ?, updated_at = ? WHERE id = ?"
        ).run(now, now, character_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  id: character_id,
                  message: `Character with ID '${character_id}' soft deleted successfully`,
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
              text: `Error deleting character: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
