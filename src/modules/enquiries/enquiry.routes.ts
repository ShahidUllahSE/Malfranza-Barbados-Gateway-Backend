import { Router } from "express";
import { optionalAuthenticateUser } from "../../middleware/user-auth.js";
import { publicWriteLimiter } from "../../middleware/rate-limit.js";
import { postEnquiry } from "./enquiry.controller.js";

export const enquiryRouter = Router();

enquiryRouter.post("/", publicWriteLimiter, optionalAuthenticateUser, postEnquiry);
