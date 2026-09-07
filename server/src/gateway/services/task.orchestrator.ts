import * as IndividualTaskService from "../../tasks/individual-tasks/services/task.service";
import { prisma } from "../../lib/prisma";
import { processVerification } from "./verification.orchestrator";
import { ApiError } from "../../core-backend/dashboard/utils/ApiError";
import { TaskCompletionStatus } from "@prisma/client";

export const getAllTasks = async (userId: string) => {
  return await IndividualTaskService.availableTasks(userId);
};
export const getDailyTasks = async (userId: string) => {
  return await IndividualTaskService.dailyTasks(userId);
}

//this one needs model task id.
export const getTaskDetails = async (taskId: string, userId: string) => {
  return await IndividualTaskService.getTaskDetails(taskId, userId);
};

export const getStatus = async (taskId: string, userId: string) => {
  return await IndividualTaskService.getStatus(taskId, userId);
}
//also model task id, should also return taskScore id after starting
export const startTask = async (taskId: string, userId: string) => {
  return await IndividualTaskService.startTask(taskId, userId);
};

export const submitTaskEvidence = async (
  taskId: string,
  userId: string,
  data: { evidenceUrls?: string[]; textResponse?: string; mcqAnswer?: string }
) => {
  const submission =
    await IndividualTaskService.submitEvidence(taskId, userId, data);

  // ✅ resolve the TaskScore that actually belongs to THIS submission
  const activeTaskScore = await prisma.taskScore.findUnique({
    where: { submissionId: submission.id },
  });

  if (!activeTaskScore || activeTaskScore.status !== TaskCompletionStatus.STARTED) {
    throw new ApiError(404, "Active task score not found");
  }

  const taskScore = await prisma.taskScore.update({
    where: { id: activeTaskScore.id },
    data: { status: TaskCompletionStatus.SUBMITTED },
  });

  const finalTaskScore = await processVerification(taskScore.id);

  return {
    submissionId: submission.id,
    status: finalTaskScore.status,
  };
};
