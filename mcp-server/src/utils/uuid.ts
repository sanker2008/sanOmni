import { v4 } from "uuid";

/** Generate a new UUID v4 string for entity IDs. */
export function newId(): string {
  return v4();
}
