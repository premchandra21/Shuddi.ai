import { ApiError } from "../../../core-backend/dashboard/utils/ApiError";
import { prisma } from "../../../lib/prisma";
import { SubmissionStatus, TaskCompletionStatus } from "@prisma/client";

export const getTaskById = async (taskId: string, userId: string) => {
  return await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      individualTask: {
        include: {
          submissions: {
            where: { userId },
            take: 1,
          },
        },
      },
      communityTask: true,
    },
  });
};

//Getting all individual tasks which have/don't have cooldown, daily task will have another logic.
export const getAvailableIndividualTasks = async (userId: string) => {
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: {
      individualTask: {
        is: {
          isDaily: false,
        },
      },
      isActive: true,
      OR: [
        { startAt: null },
        { startAt: { lte: now } },
      ],
      AND: [
        {
          OR: [
            { endAt: null },
            { endAt: { gte: now } },
          ],
        },
      ],
    },
    include: {
      individualTask: {
        include: {
          submissions: {
            where: {
              userId,
            },
            orderBy: {
              submittedAt: "desc",
            },
            take: 1,
          },
        },
      },
    },
  });


  const filteredTasks = tasks.filter((task) => {
    const cooldown = task.individualTask?.cooldownDays;
    const lastSubmission = task.individualTask?.submissions?.[0];

    // ❌ Hide if active
    if (
      lastSubmission &&
      ["STARTED", "SUBMITTED"].includes(lastSubmission.status)
    ) {
      return false;
    }

    // ✅ Never attempted
    if (!lastSubmission) return true;

    // ✅ One-time task
    if (cooldown == null) return false;

    // ✅ Allow retry if not approved (rejected etc)
    if (lastSubmission.status !== "APPROVED") {
      return true;
    }

    // ✅ Cooldown logic
    const lastTime =
      lastSubmission.verifiedAt || lastSubmission.submittedAt;

    const nextAvailable = new Date(lastTime);
    nextAvailable.setDate(nextAvailable.getDate() + cooldown);

    return now >= nextAvailable;
  });

  return filteredTasks;
};


export const findActiveSubmission = async (taskId: string, userId: string) => {
  const individualTask = await prisma.individualTask.findUnique({
    where: { taskId },
  });

  if (!individualTask) return null;

  return await prisma.taskSubmission.findFirst({
    where: {
      userId,
      taskId: individualTask.id,
      status: "STARTED",
    },
  });

};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.setHours(0, 0, 0, 0));
};

export const getTaskStatus = async (taskId: string, userId: string) => {
  const individualTask = await prisma.individualTask.findUnique({
    where: { taskId },
    include: { task: true }
  });
  if (!individualTask) {
    throw new ApiError(500, "This task does not support individual submissions.");
  }

  if (individualTask.isDaily) {
    const completedToday = await prisma.taskScore.findFirst({
      where: {
        userId,
        taskId: individualTask.taskId,
        status: "COMPLETED",
        createdAt: {
          gte: startOfToday(),
        },
      },
    });

    if (completedToday) {
      return { status: "COMPLETED" };
    }
  }

  // ✅ track the submission through its whole in-flight lifecycle,
  // not just the moment right after "Start Task"

  const latestScore = await prisma.taskScore.findFirst({
    where: {
      userId,
      taskId: individualTask.taskId,
    },
    include: { submission: true },
    orderBy: { createdAt: "desc" },
  });

  if (!latestScore) {
    return { status: "NOT_STARTED" };
  }

  return {
    status: latestScore.status,
    rejectionReason: latestScore.submission?.rejectionReason ?? null,
  };

  // const existing = await prisma.taskSubmission.findFirst({
  //   where: {
  //     userId,
  //     taskId: individualTask.id,
  //     status: { in: ["STARTED", "SUBMITTED", "UNDER_VERIFICATION"] },
  //   },
  //   orderBy: { startedAt: "desc" },
  // });

  // return { status: existing?.status || "NOT_STARTED" };
}


export const createSubmission = async (taskId: string, userId: string) => {

  const individualTask = await prisma.individualTask.findUnique({
    where: { taskId },
    include: { task: true }
  });

  if (!individualTask) {
    throw new ApiError(500, "This task does not support individual submissions.");
  }

  if (individualTask.isDaily) {
    const completedToday = await prisma.taskScore.findFirst({
      where: {
        userId,
        taskId: individualTask.taskId, // NOTE: this is main taskId (not individualTask.id)
        status: "COMPLETED",
        createdAt: {
          gte: startOfToday(),
        },
      },
    });

    if (completedToday) {
      return { status: "COMPLETED" }; // this is YOUR custom API response
    }
  }

  return prisma.$transaction(async (tx) => {

    const existing = await tx.taskSubmission.findFirst({
      where: {
        userId,
        taskId: individualTask.id,
        status: { in: ["STARTED", "SUBMITTED", "UNDER_VERIFICATION"] },
      },
    });

    if (existing) {
      return { status: existing.status };
    };

    const taskSubmission = await tx.taskSubmission.create({
      data: {
        userId,
        taskId: individualTask.id,
        status: "STARTED",
      },
    });

    const taskScore = await tx.taskScore.create({
      data: {
        userId: userId,
        taskId: individualTask.taskId,
        baseScore: individualTask.task.baseScore,
        status: TaskCompletionStatus.STARTED,
        performanceScore: 0,
        // Without this link, TaskScore.submission is always null and
        // processVerification() can never find the evidence to verify.
        submissionId: taskSubmission.id,
      },
    });

    return {
      status: taskSubmission.status,
    };

  });
};

export const updateSubmissionEvidence = async (
  submissionId: string,
  data: {
    evidenceUrls?: string[];
    textResponse?: string;
    mcqAnswer?: string;
  }
) => {
  return await prisma.taskSubmission.update({
    where: { id: submissionId },
    data: {
      ...data,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });
};

export const getDailyTaskForUser = async (userId: string) => {
  const now = new Date();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const tasks = await prisma.task.findMany({
    where: {
      isActive: true,
      OR: [{ startAt: null }, { startAt: { lte: now } }],
      AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
      individualTask: {
        is: {
          isDaily: true,
        },
      },
    },
    include: {
      individualTask: {
        include: {
          submissions: {
            where: {
              userId,
              startedAt: {
                gte: startOfDay,
                lt: endOfDay,
              },
            },
            orderBy: { startedAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!tasks.length) return null;

  const baseDate = new Date("2026-01-01T00:00:00");
  const diffInDays = Math.floor(
    (startOfDay.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const index = ((diffInDays % tasks.length) + tasks.length) % tasks.length;

  const task = tasks[index];
  const individualTask = task.individualTask!;
  const submission = individualTask.submissions[0];

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    baseScore: task.baseScore,
    type: task.type,
    isActive: task.isActive,

    difficulty: individualTask.difficulty,
    category: individualTask.category,
    verificationType: individualTask.verificationType,

    requirements: individualTask.requirements,
    educationalLink: individualTask.educationalLink,
    factContent: individualTask.factContent,

    userStatus: submission?.status || "NOT_STARTED",
    submissionId: submission?.id,
    rejectionReason: submission?.rejectionReason,
    evidenceUrls: submission?.evidenceUrls,
  };
};