import type { RequestHandler } from "express";
import {
  closeEnquiry,
  getEnquiryForAdmin,
  listEnquiries,
  updateEnquiry,
} from "./enquiry.service.js";
import {
  adminEnquiryListQuerySchema,
  enquiryIdParamSchema,
  updateEnquirySchema,
} from "./enquiry.validation.js";

export const getAdminEnquiries: RequestHandler = async (request, response) => {
  const input = adminEnquiryListQuerySchema.parse(request.query);
  const result = await listEnquiries(input);
  response.status(200).json({ success: true, data: result });
};

export const getAdminEnquiry: RequestHandler = async (request, response) => {
  const { id } = enquiryIdParamSchema.parse(request.params);
  const enquiry = await getEnquiryForAdmin(id);
  response.status(200).json({ success: true, data: enquiry });
};

export const patchEnquiry: RequestHandler = async (request, response) => {
  const { id } = enquiryIdParamSchema.parse(request.params);
  const input = updateEnquirySchema.parse(request.body);
  const enquiry = await updateEnquiry(id, input);
  response.status(200).json({ success: true, data: enquiry });
};

export const deleteEnquiry: RequestHandler = async (request, response) => {
  const { id } = enquiryIdParamSchema.parse(request.params);
  const enquiry = await closeEnquiry(id);
  response.status(200).json({
    success: true,
    message: "Enquiry closed",
    data: enquiry,
  });
};
