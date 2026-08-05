import type Database from "better-sqlite3";
import { z } from "zod";

export const WORK_STRUCTURE_MODES = ["single", "collection", "narrative"] as const;

export const workStructureModeSchema = z.enum(WORK_STRUCTURE_MODES);

type WorkRow = {
  id: string;
  structure_mode: string;
};

/** Keep direct MCP writes aligned with Tauri's chapter-management boundary. */
export function assertActiveNarrativeWork(
  db: Database.Database,
  workId: string
): void {
  const work = db
    .prepare(
      "SELECT id, structure_mode FROM works WHERE id = ? AND deleted_at IS NULL"
    )
    .get(workId) as WorkRow | undefined;

  if (!work) {
    throw new Error(`Work with ID '${workId}' not found or has been deleted.`);
  }

  if (work.structure_mode !== "narrative") {
    throw new Error("Only works with structure_mode 'narrative' can manage chapters.");
  }
}

/** Resolve a chapter through its active parent before modifying it. */
export function assertActiveNarrativeChapter(
  db: Database.Database,
  chapterId: string
): void {
  const chapter = db
    .prepare(
      `SELECT chapter.id, work.structure_mode
       FROM work_chapters chapter
       INNER JOIN works work ON work.id = chapter.work_id
       WHERE chapter.id = ?
         AND chapter.deleted_at IS NULL
         AND work.deleted_at IS NULL`
    )
    .get(chapterId) as WorkRow | undefined;

  if (!chapter) {
    throw new Error(`Chapter with ID '${chapterId}' not found.`);
  }

  if (chapter.structure_mode !== "narrative") {
    throw new Error("Only chapters in works with structure_mode 'narrative' can be managed.");
  }
}
