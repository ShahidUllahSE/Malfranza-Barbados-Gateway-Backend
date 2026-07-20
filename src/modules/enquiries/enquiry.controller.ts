import type { RequestHandler } from "express";
import type { AuthenticatedUser } from "../users/user.service.js";
import { createEnquiry } from "./enquiry.service.js";
import { createEnquirySchema } from "./enquiry.validation.js";

function enquiryDetailsFromUser(user: AuthenticatedUser, input: {
  name: string;
  email: string;
  phone?: string;
}) {
  return {
    name: input.name.trim() || user.name,
    email: user.email,
    phone: input.phone?.trim() || user.phone,
  };
}

export const postEnquiry: RequestHandler = async (request, response) => {
  const input = createEnquirySchema.parse(request.body);
  const contact = request.user
    ? enquiryDetailsFromUser(request.user, input)
    : {
        name: input.name,
        email: input.email,
        phone: input.phone,
      };
  const enquiry = await createEnquiry({ ...input, ...contact }, request.user?.id);

  response.status(201).json({
    success: true,
    data: {
      reference: enquiry.reference,
      status: enquiry.status,
    },
  });
};
