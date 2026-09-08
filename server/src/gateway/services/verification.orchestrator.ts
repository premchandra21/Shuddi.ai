import { prisma } from "../../lib/prisma";
import { TaskCompletionStatus, SubmissionStatus } from "@prisma/client";
import { triggerRewardFlow } from "./reward.orchestrator";
import { verifySubmission, toPythonType } from "./verification-client.service";
import { ApiError } from "../../core-backend/dashboard/utils/ApiError";

const PASS_THRESHOLD = Number(process.env.VERIFICATION_PASS_THRESHOLD ?? 90);
const AUTO_REJECT_THRESHOLD = Number(process.env.VERIFICATION_AUTO_REJECT_THRESHOLD ?? 30);

export const processVerification = async (taskScoreId: string) => {
  const taskScore = await prisma.taskScore.findUnique({
    where: { id: taskScoreId },
    include: { submission: true },
  });
  if (!taskScore || !taskScore.submission) throw new ApiError(404, "Task score/submission not found");

  const submission = taskScore.submission;

  const individualTask = await prisma.individualTask.findUnique({
    where: { taskId: taskScore.taskId },
  });
  if (!individualTask) throw new ApiError(404, "Individual task config not found");

  // MCQ never goes through the LLM verification pipeline. MCQ tasks aren't
  // being created yet, but guard here anyway so one is never silently sent
  // to the IMAGE_TEXT pipeline and scored on garbage.
  if (individualTask.verificationType === "MCQ") {
    // TODO: compare submission.mcqAnswer against MCQQuestion.correct and
    // resolve the taskScore directly (no external API call needed).
    throw new ApiError(501, "MCQ verification is not implemented yet");
  }

  const pythonType = toPythonType(individualTask.verificationType);

  const verifyPayload =
    pythonType === "BEFORE_AFTER"
      ? {
        verificationType: pythonType,
        rubric: individualTask.prompt ?? "",
        image_before: submission.evidenceUrls?.[0],
        image_after: submission.evidenceUrls?.[1],
      }
      : {
        verificationType: pythonType,
        rubric: individualTask.prompt ?? "",
        image_path: submission.evidenceUrls?.[0],
        user_text: submission.textResponse ?? undefined,
      };

  if (pythonType === "BEFORE_AFTER" && (!verifyPayload.image_before || !verifyPayload.image_after)) {
    throw new ApiError(400, "Both before and after images are required for BEFORE_AFTER verification");
  }

  const { confidence_score, reasoning } = await verifySubmission(verifyPayload);

  // Three-way split:
  //  - >= PASS_THRESHOLD        -> auto-verified, straight to reward flow
  //  - <  AUTO_REJECT_THRESHOLD -> auto-rejected, no human ever sees it
  //  - in between               -> queued for human review on the admin dashboard
  if (confidence_score >= PASS_THRESHOLD) {
    const updatedTaskScore = await prisma.taskScore.update({
      where: { id: taskScoreId },
      data: {
        status: TaskCompletionStatus.VERIFIED,
        performanceScore: confidence_score,
        systemScore: confidence_score,
        verificationSource: "VLM_PIPELINE",
        verifiedAt: new Date(),
      },
    });

    await prisma.taskSubmission.update({
      where: { id: submission.id },
      data: {
        status: SubmissionStatus.APPROVED,
        verifiedAt: new Date(),
        rejectionReason: null,
      },
    });

    const result = await triggerRewardFlow(updatedTaskScore.id);
    return { taskScore: updatedTaskScore, status: result.status };
  }

  if (confidence_score < AUTO_REJECT_THRESHOLD) {
    const updatedTaskScore = await prisma.taskScore.update({
      where: { id: taskScoreId },
      data: {
        status: TaskCompletionStatus.REJECTED,
        performanceScore: confidence_score,
        systemScore: confidence_score,
        verificationSource: "VLM_PIPELINE",
        verifiedAt: new Date(),
      },
    });

    await prisma.taskSubmission.update({
      where: { id: submission.id },
      data: {
        status: SubmissionStatus.REJECTED,
        verifiedAt: new Date(),
        // Real, model-generated reasoning instead of a bare confidence-score
        // string -- this is what gets shown to the user on the rejected
        // submission screen (see TaskSubmission.rejectionReason usage in
        // getTaskDetails / getTaskStatus and SubmissionResultState.tsx on
        // the client). We still persist it on the submission row rather than
        // returning it only in this response, since the frontend re-fetches
        // status/details rather than reading the processVerification result
        // directly -- if it isn't stored here it never reaches the user.
        rejectionReason: reasoning || `Confidence score ${confidence_score} is below the acceptable minimum of ${AUTO_REJECT_THRESHOLD}`,
      },
    });

    return { taskScore: updatedTaskScore, status: "REJECTED" };
  }

  // 30 <= confidence_score < 90: not confident enough either way, hand it to a human.
  const updatedTaskScore = await prisma.taskScore.update({
    where: { id: taskScoreId },
    data: {
      status: TaskCompletionStatus.UNDER_VERIFICATION,
      performanceScore: confidence_score,
      systemScore: confidence_score,
      verificationSource: "VLM_PIPELINE",
      verifiedAt: null, // not actually verified yet — a human still has to decide
    },
  });

  await prisma.taskSubmission.update({
    where: { id: submission.id },
    data: {
      status: SubmissionStatus.UNDER_VERIFICATION,
    },
  });

  return { taskScore: updatedTaskScore, status: "UNDER_VERIFICATION" };
};