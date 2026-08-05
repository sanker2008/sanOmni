import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const fixtureDirectories: string[] = [];
const serverPath = fileURLToPath(new URL("../index.js", import.meta.url));

after(async () => {
  await Promise.all(fixtureDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createFixtureDatabase(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sanomni-mcp-test-"));
  fixtureDirectories.push(directory);
  const dbPath = join(directory, "database.sqlite");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE works (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT,
      work_type TEXT NOT NULL,
      structure_mode TEXT NOT NULL DEFAULT 'single',
      description TEXT,
      release_date TEXT,
      producer TEXT,
      director_author TEXT,
      status TEXT,
      cover_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE work_chapters (
      id TEXT PRIMARY KEY,
      work_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      status TEXT NOT NULL DEFAULT 'outline',
      target_word_count INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      filename TEXT,
      relative_path TEXT,
      absolute_path TEXT,
      status TEXT,
      prompt TEXT,
      width INTEGER,
      height INTEGER,
      format TEXT,
      has_watermark INTEGER,
      watermark_removed INTEGER,
      storage_vendor_id TEXT,
      primary_model_id TEXT,
      imported_at TEXT,
      archived_at TEXT
    );
    CREATE TABLE vendors (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE models (id TEXT PRIMARY KEY, name TEXT);
  `);

  const insertImage = db.prepare(
    `INSERT INTO images (
      id, filename, relative_path, absolute_path, status, prompt, width, height,
      format, has_watermark, watermark_removed, imported_at
    ) VALUES (?, ?, '', '', 'tagged', '', 1, 1, 'png', 0, 0, ?)`
  );
  insertImage.run("image-1", "one.png", "2026-01-01T00:00:01Z");
  insertImage.run("image-2", "two.png", "2026-01-01T00:00:02Z");
  insertImage.run("image-3", "three.png", "2026-01-01T00:00:03Z");
  db.close();

  return dbPath;
}

async function startClient(dbPath: string): Promise<Client> {
  const client = new Client({ name: "sanomni-mcp-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...process.env, SANOMNI_DB_PATH: dbPath },
  });
  await client.connect(transport);
  return client;
}

function parseToolJson(result: any): any {
  assert.equal(result.isError, undefined, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
}

async function isRejected(client: Client, name: string, args: Record<string, unknown>): Promise<boolean> {
  try {
    const result = await client.callTool({ name, arguments: args });
    return result.isError === true;
  } catch {
    return true;
  }
}

test("enforces work structure and active-parent chapter invariants over stdio", async (t) => {
  const client = await startClient(await createFixtureDatabase());
  t.after(async () => client.close());

  const tools = await client.listTools();
  assert.equal(tools.tools.length, 33);

  assert.equal(
    await isRejected(client, "san_works_create", {
      name: "Invalid work",
      work_type: "novel",
      structure_mode: "unsupported",
    }),
    true
  );

  const singleWork = parseToolJson(
    await client.callTool({
      name: "san_works_create",
      arguments: { name: "Single work", work_type: "novel", structure_mode: "single" },
    })
  );
  assert.equal(
    await isRejected(client, "san_works_update", {
      work_id: singleWork.id,
      structure_mode: "unsupported",
    }),
    true
  );
  assert.equal(
    await isRejected(client, "san_chapters_create", {
      work_id: singleWork.id,
      title: "Not allowed",
    }),
    true
  );

  const narrativeWork = parseToolJson(
    await client.callTool({
      name: "san_works_create",
      arguments: { name: "Narrative work", work_type: "novel", structure_mode: "narrative" },
    })
  );
  assert.equal(
    await isRejected(client, "san_chapters_create", {
      work_id: narrativeWork.id,
      title: "Invalid word count",
      target_word_count: 0,
    }),
    true
  );
  parseToolJson(
    await client.callTool({ name: "san_works_delete", arguments: { work_id: narrativeWork.id } })
  );
  assert.equal(
    await isRejected(client, "san_chapters_create", {
      work_id: narrativeWork.id,
      title: "Orphan chapter",
    }),
    true
  );
});

test("limits image list pages and rejects negative limits over stdio", async (t) => {
  const client = await startClient(await createFixtureDatabase());
  t.after(async () => client.close());

  const rows = parseToolJson(
    await client.callTool({ name: "san_images_list", arguments: { limit: 2, offset: 1 } })
  );
  assert.deepEqual(rows.map((row: { id: string }) => row.id), ["image-2", "image-1"]);
  assert.equal(await isRejected(client, "san_images_list", { limit: -1 }), true);
});
