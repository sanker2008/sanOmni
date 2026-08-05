import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db.js";
import { newId } from "../utils/uuid.js";
import { nowRfc3339 } from "../utils/datetime.js";
import { paginationSchema } from "../utils/pagination.js";
import { workStructureModeSchema } from "../utils/works.js";

const WORK_TYPES = [
  "tv_series",
  "movie",
  "short_drama",
  "novel",
  "drama",
  "animation",
  "game",
  "comic",
  "image",
  "song",
  "album",
  "screenplay",
  "other",
] as const;

/**
 * Register all tools for the Works domain (sanWorks).
 */
export function registerWorksTools(server: McpServer): void {
  // 1. san_works_list
  server.tool(
    "san_works_list",
    "List all works with optional filtering by type, status, or search term",
    {
      ...paginationSchema,
      work_type: z
        .string()
        .optional()
        .describe("Filter by work type (e.g., tv_series, movie, animation, novel, etc.)"),
      status: z.string().optional().describe("Filter by work status"),
      search: z
        .string()
        .optional()
        .describe("Search term to filter works by name, description, producer, or director/author"),
    },
    async ({ work_type, status, search, limit, offset }) => {
      try {
        const db = getDb();
        let sql = `
          SELECT id, name, path, work_type, structure_mode, description, release_date, producer, director_author, status, cover_path, created_at, updated_at
          FROM works
          WHERE deleted_at IS NULL
        `;
        const params: (string | number)[] = [];

        if (work_type) {
          sql += " AND work_type = ?";
          params.push(work_type);
        }

        if (status) {
          sql += " AND status = ?";
          params.push(status);
        }

        if (search) {
          sql += " AND (name LIKE ? OR description LIKE ? OR producer LIKE ? OR director_author LIKE ?)";
          const term = `%${search}%`;
          params.push(term, term, term, term);
        }

        sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
        params.push(limit, offset);

        const works = db.prepare(sql).all(...params);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(works, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing works: ${error.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 2. san_works_get
  server.tool(
    "san_works_get",
    "Get detailed work information including tags and character count",
    {
      work_id: z.string().describe("ID of the work to retrieve"),
    },
    async ({ work_id }) => {
      try {
        const db = getDb();
        const work = db
          .prepare(
            `SELECT id, name, path, work_type, structure_mode, description, release_date, producer, director_author, status, cover_path, created_at, updated_at
             FROM works
             WHERE id = ? AND deleted_at IS NULL`
          )
          .get(work_id);

        if (!work) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Work with ID '${work_id}' not found.`,
              },
            ],
            isError: true,
          };
        }

        const tags = db
          .prepare(
            `SELECT t.id, t.name, t.name_en, t.color, t.parent_id, t.use_count, t.is_builtin, t.created_at
             FROM tags t
             INNER JOIN work_tags wt ON t.id = wt.tag_id
             WHERE wt.work_id = ?`
          )
          .all(work_id);

        const charResult = db
          .prepare(
            `SELECT COUNT(*) as count FROM characters WHERE work_id = ? AND deleted_at IS NULL`
          )
          .get(work_id) as { count: number } | undefined;

        const result = {
          ...work,
          tags: tags || [],
          character_count: charResult?.count ?? 0,
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
              text: `Error retrieving work '${work_id}': ${error.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 3. san_works_create
  server.tool(
    "san_works_create",
    "Create a new local work (not cloud-synced)",
    {
      name: z.string().describe("Name of the work"),
      work_type: z
        .enum(WORK_TYPES)
        .describe(
          "Type of work (tv_series, movie, short_drama, novel, drama, animation, game, comic, image, song, album, screenplay, other)"
        ),
      structure_mode: workStructureModeSchema
        .optional()
        .default("single")
        .describe("Structure mode of the work (default: 'single')"),
      description: z.string().optional().describe("Description of the work"),
      release_date: z.string().optional().describe("Release date of the work"),
      producer: z.string().optional().describe("Producer of the work"),
      director_author: z.string().optional().describe("Director or author of the work"),
      status: z.string().optional().describe("Status of the work"),
    },
    async ({
      name,
      work_type,
      structure_mode = "single",
      description,
      release_date,
      producer,
      director_author,
      status,
    }) => {
      try {
        const db = getDb();
        const id = newId();
        const now = nowRfc3339();
        const path = id;

        db.prepare(
          `INSERT INTO works (
            id, name, path, work_type, structure_mode, description,
            release_date, producer, director_author, status, cover_path,
            created_at, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          name,
          path,
          work_type,
          structure_mode,
          description ?? null,
          release_date ?? null,
          producer ?? null,
          director_author ?? null,
          status ?? null,
          null,
          now,
          now,
          null
        );

        const createdWork = db
          .prepare(`SELECT * FROM works WHERE id = ?`)
          .get(id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(createdWork, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating work: ${error.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 4. san_works_update
  server.tool(
    "san_works_update",
    "Update an existing local work (not cloud-synced)",
    {
      work_id: z.string().describe("ID of the work to update"),
      name: z.string().optional().describe("Updated name of the work"),
      work_type: z
        .enum(WORK_TYPES)
        .optional()
        .describe("Updated work type"),
      structure_mode: workStructureModeSchema.optional().describe("Updated structure mode"),
      description: z.string().optional().describe("Updated description"),
      release_date: z.string().optional().describe("Updated release date"),
      producer: z.string().optional().describe("Updated producer"),
      director_author: z.string().optional().describe("Updated director or author"),
      status: z.string().optional().describe("Updated status"),
      cover_path: z.string().optional().describe("Updated cover path"),
    },
    async ({
      work_id,
      name,
      work_type,
      structure_mode,
      description,
      release_date,
      producer,
      director_author,
      status,
      cover_path,
    }) => {
      try {
        const db = getDb();

        const existing = db
          .prepare(`SELECT id FROM works WHERE id = ? AND deleted_at IS NULL`)
          .get(work_id);

        if (!existing) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Work with ID '${work_id}' not found.`,
              },
            ],
            isError: true,
          };
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (name !== undefined) {
          updates.push("name = ?");
          params.push(name);
        }
        if (work_type !== undefined) {
          updates.push("work_type = ?");
          params.push(work_type);
        }
        if (structure_mode !== undefined) {
          updates.push("structure_mode = ?");
          params.push(structure_mode);
        }
        if (description !== undefined) {
          updates.push("description = ?");
          params.push(description);
        }
        if (release_date !== undefined) {
          updates.push("release_date = ?");
          params.push(release_date);
        }
        if (producer !== undefined) {
          updates.push("producer = ?");
          params.push(producer);
        }
        if (director_author !== undefined) {
          updates.push("director_author = ?");
          params.push(director_author);
        }
        if (status !== undefined) {
          updates.push("status = ?");
          params.push(status);
        }
        if (cover_path !== undefined) {
          updates.push("cover_path = ?");
          params.push(cover_path);
        }

        if (updates.length === 0) {
          const currentWork = db
            .prepare(`SELECT * FROM works WHERE id = ?`)
            .get(work_id);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(currentWork, null, 2),
              },
            ],
          };
        }

        const now = nowRfc3339();
        updates.push("updated_at = ?");
        params.push(now);

        params.push(work_id);

        const sql = `UPDATE works SET ${updates.join(", ")} WHERE id = ? AND deleted_at IS NULL`;
        db.prepare(sql).run(...params);

        const updatedWork = db
          .prepare(`SELECT * FROM works WHERE id = ?`)
          .get(work_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(updatedWork, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating work '${work_id}': ${error.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 5. san_works_delete
  server.tool(
    "san_works_delete",
    "Soft delete a local work by ID (not cloud-synced)",
    {
      work_id: z.string().describe("ID of the work to soft delete"),
    },
    async ({ work_id }) => {
      try {
        const db = getDb();

        const existing = db
          .prepare(`SELECT id FROM works WHERE id = ? AND deleted_at IS NULL`)
          .get(work_id);

        if (!existing) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Work with ID '${work_id}' not found or already deleted.`,
              },
            ],
            isError: true,
          };
        }

        const now = nowRfc3339();
        db.prepare(
          `UPDATE works SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
        ).run(now, now, work_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Work '${work_id}' soft-deleted successfully`,
                  work_id,
                  deleted_at: now,
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
              text: `Error deleting work '${work_id}': ${error.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
