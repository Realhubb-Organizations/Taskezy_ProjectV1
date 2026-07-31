import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.isProduction ? "info" : "debug",
  transport: env.isProduction
    ? undefined // structured JSON in prod — ships cleanly to any log aggregator
    : { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
});
