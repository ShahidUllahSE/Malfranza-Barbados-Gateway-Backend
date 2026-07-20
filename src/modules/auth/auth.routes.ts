import { Router } from "express";
import { authenticateAdmin } from "../../middleware/auth.js";
import {
  getCurrentAdmin,
  postBootstrapAdmin,
  postLogin,
  postSession,
} from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/bootstrap", postBootstrapAdmin);
authRouter.post("/login", postLogin);
authRouter.post("/session", postSession);
authRouter.get("/me", authenticateAdmin, getCurrentAdmin);
