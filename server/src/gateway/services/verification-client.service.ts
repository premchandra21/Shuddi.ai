import axios from "axios";
import { TaskVerificationType } from "@prisma/client";

const VERIFICATION_API_URL = process.env.VERIFICATION_API_URL || "http://localhost:8000";

export type PythonVerificationType = "IMAGE_TEXT" | "BEFORE_AFTER" | "TEXT_ONLY";

/**
 * Maps our Prisma-level TaskVerificationType to the verification-api's
 * PythonVerificationType. Shared by task creation (rubric generation)
 * and task submission (actual verification) so both stages always agree
 * on which pipeline a given task type runs through.
 *
 * MCQ is intentionally not mapped here — MCQ never goes through the
 * LLM pipeline, callers must branch on MCQ before calling this.
 */
export const toPythonType = (
    t: Exclude<TaskVerificationType, "MCQ">
): PythonVerificationType => {
    if (t === "TEXT") return "TEXT_ONLY";
    if (t === "BEFORE_AFTER") return "BEFORE_AFTER";
    return "IMAGE_TEXT"; // IMAGE, HYBRID
};

// Render free tier can take 30-50s to wake a sleeping instance. Retry a
// handful of times with backoff instead of failing on the first cold-start
// 502/timeout. Total worst-case wait before giving up: ~46s.
const RETRY_DELAYS_MS = [0, 3000, 8000, 15000, 20000];
const REQUEST_TIMEOUT_MS = 20000;

// Errors that mean "nothing is there at all" — retrying wastes ~46s per
// call for no benefit. Distinct from a slow/waking service, which shows up
// as a timeout or a 502/503/504 instead and IS worth retrying.
const NOT_RUNNING_CODES = new Set([
  "ECONNREFUSED", // nothing listening — e.g. verification-api not started locally/in seed
  "ENOTFOUND",    // DNS lookup failed — bad VERIFICATION_API_URL or no network
]);

const isRetryable = (err: unknown): boolean => {
  if (!axios.isAxiosError(err)) return false;

  if (err.code && NOT_RUNNING_CODES.has(err.code)) return false;

  // No response but not one of the above (timeout/ECONNABORTED, etc.) —
  // consistent with a slow-to-wake Render instance.
  if (!err.response) return true;

  // 502/503/504 from the platform's own proxy — also consistent with cold start.
  return [502, 503, 504].includes(err.response.status);
};
async function postWithRetry<T>(url: string, payload: unknown): Promise<T> {
  let lastErr: unknown;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const { data } = await axios.post<T>(url, payload, {
        timeout: REQUEST_TIMEOUT_MS,
      });
      return data;
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) throw err; // real error (e.g. 400) — don't waste time retrying
    }
  }
  throw lastErr;
}

//task creation
export const generateRubric = async (
    title: string,
    description: string,
    type: PythonVerificationType
): Promise<{ criteria: string[]; criteria_text: string }> => {
    return postWithRetry(`${VERIFICATION_API_URL}/rubric/generate`, {
        title,
        description,
        type,
    });
};

export const verifySubmission = async (payload: {
    verificationType: PythonVerificationType;
    rubric: string;
    image_path?: string;
    user_text?: string;
    image_before?: string;
    image_after?: string;
}): Promise<{ confidence_score: number; reasoning: string }> => {
    return postWithRetry(`${VERIFICATION_API_URL}/verify`, payload);
};