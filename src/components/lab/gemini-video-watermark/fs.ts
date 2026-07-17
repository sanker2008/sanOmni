import { appendFile, writeFile } from '@/services/secureFs';

const IPC_CHUNK_SIZE = 512 * 1024;

/**
 * Writes large generated videos without serializing the whole file as one
 * multi-million-element JSON array across the Tauri IPC boundary.
 */
export async function writeLargeVideoFile(
  path: string,
  data: Uint8Array,
  onProgress?: (ratio: number) => void,
) {
  if (data.byteLength === 0) {
    await writeFile(path, data);
    onProgress?.(1);
    return;
  }

  let offset = 0;
  const firstEnd = Math.min(data.byteLength, IPC_CHUNK_SIZE);
  await writeFile(path, data.subarray(0, firstEnd));
  offset = firstEnd;
  onProgress?.(offset / data.byteLength);

  while (offset < data.byteLength) {
    const end = Math.min(data.byteLength, offset + IPC_CHUNK_SIZE);
    await appendFile(path, data.subarray(offset, end));
    offset = end;
    onProgress?.(offset / data.byteLength);
  }
}
