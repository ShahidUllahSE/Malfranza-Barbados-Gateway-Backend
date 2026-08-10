import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { apiRouter } from "./routes/index.js";

export const app = express();
const allowedOrigins = new Set(
  [
    env.FRONTEND_URL?.replace(/\/$/, ""),
    ...(env.NODE_ENV === "development"
      ? [
          "http://localhost:8080",
          "http://localhost:8081",
          "http://localhost:8082",
          "http://localhost:5173",
          "http://127.0.0.1:8080",
          "http://127.0.0.1:8081",
          "http://127.0.0.1:8082",
          "http://127.0.0.1:5173",
        ]
      : []),
  ].filter(Boolean) as string[],
);

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      // Dev: allow any localhost / 127.0.0.1 so Vite port changes don't break the UI.
      if (
        env.NODE_ENV === "development" &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
        return;
      }
      if (env.NODE_ENV === "development") {
        console.warn(`[cors] Blocked origin: ${origin}`);
        callback(null, false);
        return;
      }
      callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1", apiRouter);

app.use(notFound);
app.use(errorHandler);
