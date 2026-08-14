import type { RequestHandler } from "express";
import {
  adminRefundListQuerySchema,
  adminRefundParamSchema,
  adminUpdateRefundSchema,
} from "./cancellation.js";
import { listAdminRefunds, updateAdminRefund } from "./refund.service.js";

export const getAdminRefunds: RequestHandler = async (request, response) => {
  const query = adminRefundListQuerySchema.parse(request.query);
  const data = await listAdminRefunds(query);
  response.status(200).json({ success: true, data });
};

export const patchAdminRefund: RequestHandler = async (request, response) => {
  const { kind, id } = adminRefundParamSchema.parse(request.params);
  const input = adminUpdateRefundSchema.parse(request.body);
  const data = await updateAdminRefund(kind, id, input);
  response.status(200).json({ success: true, data });
};
