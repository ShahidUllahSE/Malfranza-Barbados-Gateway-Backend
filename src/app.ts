import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { apiRouter } from "./routes/index.js";

export const app = express();
const allowedOrigins = new Set([
  env.FRONTEND_URL,
  ...(env.NODE_ENV === "development"
    ? ["http://localhost:8080", "http://localhost:8081"]
    : []),
]);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1", apiRouter);

app.use(notFound);
app.use(errorHandler);
