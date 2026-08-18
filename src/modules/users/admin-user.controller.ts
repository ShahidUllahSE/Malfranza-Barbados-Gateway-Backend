import type { RequestHandler } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import {
  deleteDirectoryAccount,
  DIRECTORY_KINDS,
  listDirectoryAccounts,
  restoreDirectoryAccount,
  setDirectoryAccountBlocked,
} from "./admin-directory.service.js";

const kindIdParams = z.object({
  kind: z.enum(DIRECTORY_KINDS),
  id: z.string().refine(Types.ObjectId.isValid, "Invalid account ID"),
});

export const getAdminUsers: RequestHandler = async (_request, response) => {
  const items = await listDirectoryAccounts();
  response.status(200).json({ success: true, data: { items } });
};

export const patchAdminUserActive: RequestHandler = async (request, response) => {
  const { kind, id } = kindIdParams.parse(request.params);
  const { isActive } = z.object({ isActive: z.boolean() }).parse(request.body);
  const result = await setDirectoryAccountBlocked(kind, id, !isActive, request.admin!.id);
  response.status(200).json({ success: true, data: result });
};

export const deleteAdminUser: RequestHandler = async (request, response) => {
  const { kind, id } = kindIdParams.parse(request.params);
  const result = await deleteDirectoryAccount(kind, id, request.admin!.id);
  response.status(200).json({ success: true, data: result });
};

export const restoreAdminUser: RequestHandler = async (request, response) => {
  const { kind, id } = kindIdParams.parse(request.params);
  const result = await restoreDirectoryAccount(kind, id);
  response.status(200).json({ success: true, data: result });
};
