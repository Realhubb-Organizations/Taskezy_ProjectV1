import { Router } from "express";
import { checkDatabaseConnection } from "../../db/pool";
import { asyncHandler } from "../../utils/asyncHandler";

export const healthRouter = Router();

// Load balancers / orchestrators (Docker, k8s, Render, etc.) poll this to
// decide whether to route traffic to this instance. A DB-down instance
// reports unhealthy so it gets pulled out of rotation instead of serving
// broken responses.
healthRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const dbHealthy = await checkDatabaseConnection();
    const status = dbHealthy ? 200 : 503;
    res.status(status).json({
      success: dbHealthy,
      data: { status: dbHealthy ? "healthy" : "unhealthy", database: dbHealthy ? "connected" : "unreachable", timestamp: new Date().toISOString() }
    });
  })
);
