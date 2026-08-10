import type { AuthenticatedAdmin } from "../modules/auth/auth.service.js";
import type { AuthenticatedAgency } from "../modules/agencies/agency.service.js";
import type { AuthenticatedDriver } from "../modules/drivers/driver.service.js";
import type { AuthenticatedUser } from "../modules/users/user.service.js";

declare global {
  namespace Express {
    interface Request {
      admin?: AuthenticatedAdmin;
      user?: AuthenticatedUser;
      driver?: AuthenticatedDriver;
      agency?: AuthenticatedAgency;
    }
  }
}

export {};
