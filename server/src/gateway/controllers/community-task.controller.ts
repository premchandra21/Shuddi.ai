import { Request, Response } from "express";
import * as CommunityTaskOrchestrator from "../services/community-task.orchestrator";
import { asyncHandler } from "../utils/asyncHandler";
import { createCommunityTaskSchema } from "../../tasks/community tasks/community-task.validation";
import { UserRole } from "@prisma/client";
import { processCheckIn } from "../../tasks/community tasks/checkIn.service";
import { z } from "zod";
import { completeCommunityParticipation } from "../services/community-task.orchestrator";

const CheckInSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

export const VerifyParticipantSchema = z.object({
  stars: z.number().int().min(1).max(5), // Restricts input to integers between 1 and 5
});

const getParam = (p: string | string[]) =>
  Array.isArray(p) ? p[0] : p;

export const getAvailableTasks = async (_req: Request, res: Response) => {
  try {
    console.log("Fetching available community tasks...");
    const data = await CommunityTaskOrchestrator.getAvailableCommunityTasks();

    if (!data.items.length) {
      return res.json({ items: [] });   // keep the same shape, just empty
    }

    return res.json(data);

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: error instanceof Error ? error.message : "Internal server error"
    });
  }
};

export const getTaskDetails = async (req: Request, res: Response) => {
  const communityTaskId = getParam(req.params.communityTaskId);
  const userId = req.user.id; // Assuming your auth middleware attaches the user
  const data =
    await CommunityTaskOrchestrator.getCommunityTaskDetails(
      communityTaskId, userId
    );
  res.json(data);
};

export const registerTask = asyncHandler(async (req: Request, res: Response) => {
  const communityTaskId = getParam(req.params.communityTaskId);
  const userId = req.user.id;

  const result =
    await CommunityTaskOrchestrator.registerForCommunityTask(
      communityTaskId,
      userId
    );

  res.json(result);
});

export const myTasks = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const data =
    await CommunityTaskOrchestrator.getUserCommunityTasks(userId);

  res.json(data);
};

export const communityParticipation = asyncHandler(async (req: Request, res: Response) => {
  const communityTaskId = getParam(req.params.communityTaskId);
  const userId = req.user.id;
  const data = await CommunityTaskOrchestrator.completeCommunityParticipation(communityTaskId, userId);

  res.json(data);
})

export const createCommunityTask = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = createCommunityTaskSchema.parse(req.body);

  // 2. Extract user context (Assuming req.user is populated by your auth middleware)

  const userRole: UserRole = req.user.role; // e.g., CITIZEN, ADMIN, SUPER_ADMIN[cite: 1]

  // Basic sanity check to ensure non-admins are operating under an NGO context

  if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
    const contextNgoId = req.ngoContext?.ngoId;

    // Ensure they have an active context and it matches the payload
    if (!contextNgoId || contextNgoId !== validatedData.ngoId) {
      res.status(403).json({
        error: "Forbidden: You cannot create tasks for an NGO you do not belong to."
      });
      return;
    }
  }

  // 3. Delegate to the Orchestrator
  const result = await CommunityTaskOrchestrator.createCommunityTask(
    validatedData,
    userRole
  );

  // 4. Return standard HTTP 201 Created
  res.status(201).json({
    success: true,
    message: "Community task created successfully",
    data: result,
  });
});

export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user.id; // Assumes your auth middleware attaches the user
  const { taskId } = req.params;
  const { latitude, longitude } = CheckInSchema.parse(req.body);

  const result = await processCheckIn(
    userId,
    taskId as string,
    latitude,
    longitude
  );

  return res.status(200).json({ success: true, ...result });
})

export const verifyParticipant = asyncHandler(async (req: Request, res: Response) => {
  const { taskId, userId } = req.params;

  // Validate the 1-5 star input
  const { stars } = VerifyParticipantSchema.parse(req.body);

  // Pass the stars to the orchestrator
  const result = await completeCommunityParticipation(
    taskId as string,
    userId as string,
    stars
  );

  return res.status(200).json({ success: true, ...result });
})