import type { RequestHandler } from "express";
import type { AuthenticatedUser } from "../users/user.service.js";
import {
  checkAvailability,
  createBooking,
  getPublicBooking,
  listApartmentOccupancy,
} from "./booking.service.js";
import {
  availabilityQuerySchema,
  createBookingSchema,
  occupancyQuerySchema,
  publicBookingLookupSchema,
} from "./booking.validation.js";

function guestDetailsFromUser(user: AuthenticatedUser, input: {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
}) {
  return {
    guestName: input.guestName.trim() || user.name,
    guestEmail: user.email,
    guestPhone: input.guestPhone.trim() || user.phone || input.guestPhone,
  };
}

export const getAvailability: RequestHandler = async (request, response) => {
  const input = availabilityQuerySchema.parse(request.query);
  const available = await checkAvailability(input);

  response.status(200).json({
    success: true,
    data: { available },
  });
};

export const getOccupancy: RequestHandler = async (request, response) => {
  const input = occupancyQuerySchema.parse(request.query);
  const items = await listApartmentOccupancy(input);

  response.status(200).json({
    success: true,
    data: { items },
  });
};

export const postBooking: RequestHandler = async (request, response) => {
  if (!request.user) {
    response.status(401).json({ success: false, message: "Sign in required to book" });
    return;
  }

  const input = createBookingSchema.parse(request.body);
  const guest = guestDetailsFromUser(request.user, input);
  const booking = await createBooking({ ...input, ...guest }, request.user.id);

  response.status(201).json({
    success: true,
    data: {
      bookingReference: booking.bookingReference,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      nights: booking.nights,
      totalAmount: booking.totalAmount,
    },
  });
};

export const getBookingByReference: RequestHandler = async (request, response) => {
  const input = publicBookingLookupSchema.parse({
    reference: request.params.reference,
    email: request.query.email,
  });
  const booking = await getPublicBooking(input.reference, input.email);

  response.status(200).json({
    success: true,
    data: booking,
  });
};
