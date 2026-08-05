import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db.js";
import { newId } from "../utils/uuid.js";
import { nowRfc3339 } from "../utils/datetime.js";
import { paginationSchema } from "../utils/pagination.js";
import {
  assertActiveNarrativeChapter,
  assertActiveNarrativeWork,
} from "../utils/works.js";

/**
 * Register all MCP tools for Work Chapters (sanChapters domain).
 */
export function registerChaptersTools(server: McpServer): void {
  // 1. san_chapters_list
  server.tool(
    "san_chapters_list",
    "List chapters for a work (where deleted_at IS NULL), ordered by sort_order",
    {
      ...paginationSchema,
      work_id: z.string().describe("ID of the work to list chapters for"),
    },
    async ({ work_id, limit, offset }) => {
      try {
        const db = getDb();
        assertActiveNarrativeWork(db, work_id);
        const chapters = db
          .prepare(
            `SELECT id, work_id, title, summary, substr(content, 1, 300) AS content_preview,
                    status, target_word_count, sort_order, created_at, updated_at
             FROM work_chapters
             WHERE work_id = ? AND deleted_at IS NULL
             ORDER BY sort_order ASC, created_at ASC
             LIMIT ? OFFSET ?`
          )
          .all(work_id, limit, offset);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(chapters, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing chapters: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 2. san_chapters_get
  server.tool(
    "san_chapters_get",
    "Get chapter detail with related characters (including character names) and images",
    {
      chapter_id: z.string().describe("ID of the chapter to retrieve"),
    },
    async ({ chapter_id }) => {
      try {
        const db = getDb();
        const chapter = db
          .prepare(
            `SELECT id, work_id, title, summary, content, status, target_word_count, sort_order, created_at, updated_at, deleted_at
             FROM work_chapters
             WHERE id = ? AND deleted_at IS NULL`
          )
          .get(chapter_id);

        if (!chapter) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Chapter with ID '${chapter_id}' not found.`,
              },
            ],
            isError: true,
          };
        }

        assertActiveNarrativeWork(db, (chapter as { work_id: string }).work_id);

        const characters = db
          .prepare(
            `SELECT rel.character_id, c.name AS character_name, rel.note, rel.created_at, rel.updated_at
             FROM chapter_character_relations rel
             LEFT JOIN characters c ON rel.character_id = c.id
             WHERE rel.chapter_id = ?
             ORDER BY rel.created_at ASC`
          )
          .all(chapter_id);

        const images = db
          .prepare(
            `SELECT rel.work_image_id, img.file_path, img.original_name, img.is_cover, rel.created_at, rel.updated_at
             FROM chapter_image_relations rel
             LEFT JOIN work_images img ON rel.work_image_id = img.id
             WHERE rel.chapter_id = ?
             ORDER BY rel.created_at ASC`
          )
          .all(chapter_id);

        const result = {
          ...chapter,
          characters: characters || [],
          images: images || [],
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
              text: `Error getting chapter: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 3. san_chapters_create
  server.tool(
    "san_chapters_create",
    "Create a new local chapter for a narrative work (not cloud-synced)",
    {
      work_id: z.string().describe("ID of the work"),
      title: z.string().describe("Chapter title"),
      summary: z.string().optional().describe("Chapter summary"),
      content: z.string().optional().describe("Chapter text content"),
      status: z
        .string()
        .optional()
        .describe("Chapter status (outline, draft, review, final; default 'outline')"),
      target_word_count: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Target word count for chapter"),
    },
    async ({
      work_id,
      title,
      summary,
      content,
      status,
      target_word_count,
    }) => {
      try {
        const db = getDb();
        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Chapter title cannot be empty.",
              },
            ],
            isError: true,
          };
        }

        const validStatuses = ["outline", "draft", "review", "final"];
        const chapterStatus = status || "outline";
        if (status && !validStatuses.includes(status)) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Invalid status '${status}'. Must be one of: outline, draft, review, final.`,
              },
            ],
            isError: true,
          };
        }

        assertActiveNarrativeWork(db, work_id);

        // Auto-calculate sort_order as max+1 for the work
        const maxOrderRow = db
          .prepare(
            `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
             FROM work_chapters
             WHERE work_id = ? AND deleted_at IS NULL`
          )
          .get(work_id) as { next_sort_order: number } | undefined;

        const sort_order = maxOrderRow?.next_sort_order ?? 0;
        const id = newId();
        const now = nowRfc3339();

        db.prepare(
          `INSERT INTO work_chapters (
            id, work_id, title, summary, content, status, target_word_count, sort_order, created_at, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          work_id,
          trimmedTitle,
          summary ?? null,
          content ?? null,
          chapterStatus,
          target_word_count ?? null,
          sort_order,
          now,
          now,
          null
        );

        const createdChapter = db
          .prepare(`SELECT * FROM work_chapters WHERE id = ?`)
          .get(id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(createdChapter, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating chapter: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 4. san_chapters_update
  server.tool(
    "san_chapters_update",
    "Update an existing local chapter (not cloud-synced)",
    {
      chapter_id: z.string().describe("ID of the chapter to update"),
      title: z.string().optional().describe("Updated chapter title"),
      summary: z.string().optional().describe("Updated chapter summary"),
      content: z.string().optional().describe("Updated chapter content"),
      status: z
        .string()
        .optional()
        .describe("Updated chapter status (outline, draft, review, final)"),
      target_word_count: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Updated target word count"),
      sort_order: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Updated sort order"),
    },
    async ({
      chapter_id,
      title,
      summary,
      content,
      status,
      target_word_count,
      sort_order,
    }) => {
      try {
        const db = getDb();
        const existing = db
          .prepare(`SELECT * FROM work_chapters WHERE id = ? AND deleted_at IS NULL`)
          .get(chapter_id);

        if (!existing) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Chapter with ID '${chapter_id}' not found.`,
              },
            ],
            isError: true,
          };
        }

        assertActiveNarrativeChapter(db, chapter_id);

        const validStatuses = ["outline", "draft", "review", "final"];
        if (status !== undefined && !validStatuses.includes(status)) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Invalid status '${status}'. Must be one of: outline, draft, review, final.`,
              },
            ],
            isError: true,
          };
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (title !== undefined) {
          const trimmedTitle = title.trim();
          if (!trimmedTitle) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: Chapter title cannot be empty.",
                },
              ],
              isError: true,
            };
          }
          updates.push("title = ?");
          params.push(trimmedTitle);
        }

        if (summary !== undefined) {
          updates.push("summary = ?");
          params.push(summary);
        }

        if (content !== undefined) {
          updates.push("content = ?");
          params.push(content);
        }

        if (status !== undefined) {
          updates.push("status = ?");
          params.push(status);
        }

        if (target_word_count !== undefined) {
          updates.push("target_word_count = ?");
          params.push(target_word_count);
        }

        if (sort_order !== undefined) {
          updates.push("sort_order = ?");
          params.push(sort_order);
        }

        if (updates.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(existing, null, 2),
              },
            ],
          };
        }

        const now = nowRfc3339();
        updates.push("updated_at = ?");
        params.push(now);

        params.push(chapter_id);

        db.prepare(
          `UPDATE work_chapters SET ${updates.join(", ")} WHERE id = ? AND deleted_at IS NULL`
        ).run(...params);

        const updatedChapter = db
          .prepare(`SELECT * FROM work_chapters WHERE id = ?`)
          .get(chapter_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(updatedChapter, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating chapter: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 5. san_chapters_delete
  server.tool(
    "san_chapters_delete",
    "Soft delete a local chapter (not cloud-synced)",
    {
      chapter_id: z.string().describe("ID of the chapter to soft delete"),
    },
    async ({ chapter_id }) => {
      try {
        const db = getDb();
        const existing = db
          .prepare(`SELECT * FROM work_chapters WHERE id = ? AND deleted_at IS NULL`)
          .get(chapter_id);

        if (!existing) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Chapter with ID '${chapter_id}' not found.`,
              },
            ],
            isError: true,
          };
        }

        assertActiveNarrativeChapter(db, chapter_id);

        const now = nowRfc3339();
        db.prepare(
          `UPDATE work_chapters SET deleted_at = ?, updated_at = ? WHERE id = ?`
        ).run(now, now, chapter_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: `Chapter '${chapter_id}' soft deleted successfully.`,
                  id: chapter_id,
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
              text: `Error deleting chapter: ${error?.message || String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
