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

//task creation
export const generateRubric = async (
    title: string,
    description: string,
    type: PythonVerificationType
): Promise<{ criteria: string[]; criteria_text: string }> => {
    const { data } = await axios.post(`${VERIFICATION_API_URL}/rubric/generate`, {
        title,
        description,
        type,
    });
    return data;
};

export const verifySubmission = async (payload: {
    verificationType: PythonVerificationType;
    rubric: string;
    image_path?: string;
    user_text?: string;
    image_before?: string;
    image_after?: string;
}): Promise<{ confidence_score: number; reasoning: string }> => {
    const { data } = await axios.post(`${VERIFICATION_API_URL}/verify`, payload);
    return data;
};