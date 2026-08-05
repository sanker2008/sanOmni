import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db.js";
import { newId } from "../utils/uuid.js";
import { nowRfc3339 } from "../utils/datetime.js";
import { paginationSchema } from "../utils/pagination.js";

/**
 * Register all tools for the Prompt Template domain (sanPrompt / prompt_groups).
 */
export function registerPromptGroupsTools(server: McpServer): void {
  // 1. san_prompt_list
  server.tool(
    "san_prompt_list",
    "List all prompt groups with optional filtering by category or search term",
    {
      ...paginationSchema,
      category: z
        .string()
        .optional()
        .describe("Filter by category (e.g., 'Product & Ecommerce')"),
      search: z
        .string()
        .optional()
        .describe("Search term matching name, prompt, or description"),
    },
    async ({ category, search, limit, offset }) => {
      try {
        const db = getDb();
        let sql = `
          SELECT pg.id, pg.prompt, pg.negative_prompt, pg.name, pg.description,
                 pg.template_schema, pg.category, pg.tags, pg.price, pg.is_published,
                 pg.publish_status, pg.remote_slug, pg.remote_url, pg.last_published_at,
                 pg.created_at, pg.updated_at,
                 (SELECT COUNT(*) FROM image_prompt_group_relations ipgr WHERE ipgr.prompt_group_id = pg.id) as image_count
          FROM prompt_groups pg
          WHERE 1=1
        `;
        const params: (string | number)[] = [];

        if (category) {
          sql += " AND pg.category = ?";
          params.push(category);
        }

        if (search) {
          sql += " AND (pg.name LIKE ? OR pg.prompt LIKE ? OR pg.description LIKE ?)";
          const term = `%${search}%`;
          params.push(term, term, term);
        }

        sql += " ORDER BY pg.created_at DESC LIMIT ? OFFSET ?";
        params.push(limit, offset);

        const groups = db.prepare(sql).all(...params);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(groups, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing prompt groups: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 2. san_prompt_get
  server.tool(
    "san_prompt_get",
    "Get prompt group detail with associated images",
    {
      group_id: z.string().describe("ID of the prompt group to retrieve"),
    },
    async ({ group_id }) => {
      try {
        const db = getDb();
        const group = db
          .prepare("SELECT * FROM prompt_groups WHERE id = ?")
          .get(group_id) as any;

        if (!group) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Prompt group with ID '${group_id}' not found.`,
              },
            ],
            isError: true,
          };
        }

        const images = db
          .prepare(
            `SELECT
               i.id,
               i.filename,
               i.original_filename,
               i.relative_path,
               i.absolute_path,
               i.primary_model_id,
               i.status,
               i.width,
               i.height,
               i.file_size,
               i.created_at as image_created_at,
               ipgr.role,
               ipgr.is_cover,
               ipgr.sort_order,
               ipgr.caption,
               ipgr.variant_key,
               ipgr.variant_json,
               ipgr.is_sync_enabled,
               ipgr.sync_status,
               ipgr.remote_url as relation_remote_url
             FROM images i
             INNER JOIN image_prompt_group_relations ipgr ON i.id = ipgr.image_id
             WHERE ipgr.prompt_group_id = ?
             ORDER BY ipgr.sort_order ASC, i.created_at DESC`
          )
          .all(group_id);

        const result = {
          ...group,
          images: images || [],
          image_count: images ? images.length : 0,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving prompt group '${group_id}': ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 3. san_prompt_create
  server.tool(
    "san_prompt_create",
    "Create a new prompt group in the local database (not cloud-synced)",
    {
      prompt: z.string().describe("Prompt text"),
      name: z.string().optional().describe("Name of the prompt group"),
      negative_prompt: z.string().optional().describe("Negative prompt text"),
      description: z.string().optional().describe("Description of the prompt group"),
      template_schema: z
        .string()
        .optional()
        .describe("JSON template schema string for parameters"),
      category: z
        .string()
        .optional()
        .describe("Category (defaults to 'Product & Ecommerce')"),
      tags: z
        .string()
        .optional()
        .describe("JSON array string of tags (defaults to '[]')"),
      price: z.number().optional().describe("Price (defaults to 4.99)"),
    },
    async ({
      prompt,
      name,
      negative_prompt,
      description,
      template_schema,
      category,
      tags,
      price,
    }) => {
      try {
        const db = getDb();
        const id = newId();
        const now = nowRfc3339();

        const cat = category ?? "Product & Ecommerce";
        const tagStr = tags ?? "[]";
        const pr = price ?? 4.99;
        const is_published = 0;
        const publish_status = "draft";

        db.prepare(
          `INSERT INTO prompt_groups (
            id, prompt, negative_prompt, name, description,
            template_schema, category, tags, price,
            is_published, publish_status, remote_slug, remote_url,
            last_published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          prompt,
          negative_prompt ?? null,
          name ?? null,
          description ?? null,
          template_schema ?? null,
          cat,
          tagStr,
          pr,
          is_published,
          publish_status,
          null,
          null,
          null,
          now,
          now
        );

        const createdGroup = db
          .prepare("SELECT * FROM prompt_groups WHERE id = ?")
          .get(id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(createdGroup, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating prompt group: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 4. san_prompt_update
  server.tool(
    "san_prompt_update",
    "Update an existing local prompt group (not cloud-synced)",
    {
      group_id: z.string().describe("ID of the prompt group to update"),
      prompt: z.string().optional().describe("Updated prompt text"),
      negative_prompt: z.string().optional().describe("Updated negative prompt text"),
      name: z.string().optional().describe("Updated name"),
      description: z.string().optional().describe("Updated description"),
      template_schema: z
        .string()
        .optional()
        .describe("Updated template schema string"),
      category: z.string().optional().describe("Updated category"),
      tags: z.string().optional().describe("Updated tags JSON string"),
      price: z.number().optional().describe("Updated price"),
      is_published: z
        .union([z.boolean(), z.number()])
        .optional()
        .describe("Published status (boolean or 0/1 integer)"),
      publish_status: z
        .string()
        .optional()
        .describe("Publish status ('draft', 'published', etc.)"),
      remote_slug: z.string().optional().describe("Remote slug"),
      remote_url: z.string().optional().describe("Remote URL"),
      last_published_at: z
        .string()
        .optional()
        .describe("Last published RFC3339 timestamp"),
    },
    async ({
      group_id,
      prompt,
      negative_prompt,
      name,
      description,
      template_schema,
      category,
      tags,
      price,
      is_published,
      publish_status,
      remote_slug,
      remote_url,
      last_published_at,
    }) => {
      try {
        const db = getDb();
        const existing = db
          .prepare("SELECT id FROM prompt_groups WHERE id = ?")
          .get(group_id);

        if (!existing) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Prompt group with ID '${group_id}' not found.`,
              },
            ],
            isError: true,
          };
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (prompt !== undefined) {
          updates.push("prompt = ?");
          params.push(prompt);
        }
        if (negative_prompt !== undefined) {
          updates.push("negative_prompt = ?");
          params.push(negative_prompt);
        }
        if (name !== undefined) {
          updates.push("name = ?");
          params.push(name);
        }
        if (description !== undefined) {
          updates.push("description = ?");
          params.push(description);
        }
        if (template_schema !== undefined) {
          updates.push("template_schema = ?");
          params.push(template_schema);
        }
        if (category !== undefined) {
          updates.push("category = ?");
          params.push(category);
        }
        if (tags !== undefined) {
          updates.push("tags = ?");
          params.push(tags);
        }
        if (price !== undefined) {
          updates.push("price = ?");
          params.push(price);
        }
        if (is_published !== undefined) {
          updates.push("is_published = ?");
          params.push(
            typeof is_published === "boolean"
              ? is_published
                ? 1
                : 0
              : is_published
          );
        }
        if (publish_status !== undefined) {
          updates.push("publish_status = ?");
          params.push(publish_status);
        }
        if (remote_slug !== undefined) {
          updates.push("remote_slug = ?");
          params.push(remote_slug);
        }
        if (remote_url !== undefined) {
          updates.push("remote_url = ?");
          params.push(remote_url);
        }
        if (last_published_at !== undefined) {
          updates.push("last_published_at = ?");
          params.push(last_published_at);
        }

        if (updates.length === 0) {
          const currentGroup = db
            .prepare("SELECT * FROM prompt_groups WHERE id = ?")
            .get(group_id);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(currentGroup, null, 2),
              },
            ],
          };
        }

        const now = nowRfc3339();
        updates.push("updated_at = ?");
        params.push(now);

        params.push(group_id);

        const sql = `UPDATE prompt_groups SET ${updates.join(", ")} WHERE id = ?`;
        db.prepare(sql).run(...params);

        const updatedGroup = db
          .prepare("SELECT * FROM prompt_groups WHERE id = ?")
          .get(group_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(updatedGroup, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating prompt group '${group_id}': ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 5. san_prompt_delete
  server.tool(
    "san_prompt_delete",
    "Hard delete a local prompt group by ID (not cloud-synced)",
    {
      group_id: z.string().describe("ID of the prompt group to hard delete"),
    },
    async ({ group_id }) => {
      try {
        const db = getDb();
        const existing = db
          .prepare("SELECT id FROM prompt_groups WHERE id = ?")
          .get(group_id);

        if (!existing) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Prompt group with ID '${group_id}' not found.`,
              },
            ],
            isError: true,
          };
        }

        db.prepare("DELETE FROM prompt_groups WHERE id = ?").run(group_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Prompt group '${group_id}' hard deleted successfully`,
                  group_id,
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
              text: `Error deleting prompt group '${group_id}': ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
