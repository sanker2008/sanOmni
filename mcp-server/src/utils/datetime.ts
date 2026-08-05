/** Return the current UTC timestamp in RFC 3339 format (matching Rust's chrono). */
export function nowRfc3339(): string {
  return new Date().toISOString();
}
