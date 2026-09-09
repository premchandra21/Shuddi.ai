import { type ZodType } from "zod";

// Matches the { success, data } shape confirmed on the tasks/details endpoints.
export function unwrapEnvelope<T>(schema: ZodType<T>, raw: unknown): T {
  if (!raw || typeof raw !== "object" || !("data" in raw)) {
    throw new Error("Unexpected response shape: expected an envelope with a 'data' field");
  }
  return schema.parse((raw as { data: unknown }).data);
}