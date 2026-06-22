import { invoke } from "@tauri-apps/api/core";

interface CommandResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SecureDirEntry {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
}

export interface SecureFileStat {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  modifiedAt?: number;
  mtime?: Date;
}

function unwrap<T>(result: CommandResult<T>, fallbackMessage: string): T {
  if (!result.success || result.data === undefined) {
    throw new Error(result.error || fallbackMessage);
  }
  return result.data;
}

function mapDirEntry(entry: any): SecureDirEntry {
  return {
    name: entry.name,
    path: entry.path,
    isFile: Boolean(entry.is_file ?? entry.isFile),
    isDirectory: Boolean(entry.is_directory ?? entry.isDirectory),
  };
}

function mapStat(stat: any): SecureFileStat {
  const modifiedAt = stat.modified_at ?? stat.modifiedAt;
  return {
    isFile: Boolean(stat.is_file ?? stat.isFile),
    isDirectory: Boolean(stat.is_directory ?? stat.isDirectory),
    size: Number(stat.size || 0),
    modifiedAt,
    mtime: modifiedAt === undefined || modifiedAt === null ? undefined : new Date(Number(modifiedAt)),
  };
}

export async function authorizeFsPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const result = await invoke<CommandResult<boolean>>("authorize_fs_paths", { paths });
  unwrap(result, "Failed to authorize filesystem paths");
}

export async function exists(path: string): Promise<boolean> {
  const result = await invoke<CommandResult<boolean>>("secure_fs_exists", { path });
  return unwrap(result, "Failed to check path");
}

export async function mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
  const result = await invoke<CommandResult<boolean>>("secure_fs_mkdir", {
    path,
    recursive: options?.recursive ?? false,
  });
  unwrap(result, "Failed to create directory");
}

export async function readFile(path: string): Promise<Uint8Array> {
  const result = await invoke<CommandResult<number[]>>("secure_fs_read_file", { path });
  return new Uint8Array(unwrap(result, "Failed to read file"));
}

export async function readTextFile(path: string): Promise<string> {
  const data = await readFile(path);
  return new TextDecoder().decode(data);
}

export async function writeFile(path: string, data: Uint8Array): Promise<void> {
  const result = await invoke<CommandResult<boolean>>("secure_fs_write_file", {
    path,
    data: Array.from(data),
  });
  unwrap(result, "Failed to write file");
}

export async function writeTextFile(path: string, data: string): Promise<void> {
  await writeFile(path, new TextEncoder().encode(data));
}

export async function copyFile(source: string, target: string): Promise<void> {
  const result = await invoke<CommandResult<boolean>>("secure_fs_copy_file", { source, target });
  unwrap(result, "Failed to copy file");
}

export async function rename(source: string, target: string): Promise<void> {
  const result = await invoke<CommandResult<boolean>>("secure_fs_rename", { source, target });
  unwrap(result, "Failed to rename path");
}

export async function remove(path: string, options?: { recursive?: boolean }): Promise<void> {
  const result = await invoke<CommandResult<boolean>>("secure_fs_remove", {
    path,
    recursive: options?.recursive ?? false,
  });
  unwrap(result, "Failed to remove path");
}

export async function readDir(path: string): Promise<SecureDirEntry[]> {
  const result = await invoke<CommandResult<any[]>>("secure_fs_read_dir", { path });
  return unwrap(result, "Failed to read directory").map(mapDirEntry);
}

export async function stat(path: string): Promise<SecureFileStat> {
  const result = await invoke<CommandResult<any>>("secure_fs_stat", { path });
  return mapStat(unwrap(result, "Failed to stat path"));
}
