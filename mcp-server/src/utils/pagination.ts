import { z } from "zod";

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;

/** Shared bounds prevent a single MCP response from exhausting the client context. */
export const paginationSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIST_LIMIT)
    .optional()
    .default(DEFAULT_LIST_LIMIT)
    .describe(`Maximum rows to return (1-${MAX_LIST_LIMIT}; default ${DEFAULT_LIST_LIMIT})`),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Rows to skip before returning results (default 0)"),
};
