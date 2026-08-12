/**
 * Unescapes literal `\n`, `\r\n`, `\r` string escape sequences into actual newline control characters.
 * Useful for text loaded from AI generations, JSON strings, or database fields that contain literal backslash-n.
 */
export function cleanEscapedText(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}
