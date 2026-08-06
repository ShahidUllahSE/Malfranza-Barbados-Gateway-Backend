import type { RequestHandler } from "express";
import {
  sendBookingConfirmationEmail,
  sendGuestCredentialsEmail,
} from "../notifications/email.service.js";
import {
  ensureGuestAccount,
  type AuthenticatedUser,
} from "../users/user.service.js";
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
  const input = createBookingSchema.parse(request.body);

  let accountCreated = false;
  let token: string | undefined;
  let plainPassword: string | undefined;
  let user: AuthenticatedUser;

  if (request.user) {
    user = request.user;
  } else {
    const guestAccount = await ensureGuestAccount({
      name: input.guestName,
      email: input.guestEmail,
      phone: input.guestPhone,
    });
    user = guestAccount.user;
    token = guestAccount.token;
    accountCreated = guestAccount.accountCreated;
    plainPassword = guestAccount.plainPassword;
  }

  const guest = guestDetailsFromUser(user, input);
  const booking = await createBooking({ ...input, ...guest }, user.id);

  if (accountCreated && plainPassword) {
    await sendGuestCredentialsEmail({
      to: user.email,
      name: user.name,
      password: plainPassword,
      bookingReference: booking.bookingReference,
    }).catch((error) => {
      console.error("[email] Failed to send guest credentials", error);
    });
  }

  await sendBookingConfirmationEmail({
    to: guest.guestEmail,
    name: guest.guestName,
    bookingReference: booking.bookingReference,
    checkIn: String(booking.checkIn).slice(0, 10),
    checkOut: String(booking.checkOut).slice(0, 10),
    apartmentName: booking.apartmentName,
    totalAmount: Number(booking.totalAmount),
  }).catch((error) => {
    console.error("[email] Failed to send booking confirmation", error);
  });

  response.status(201).json({
    success: true,
    data: {
      bookingReference: booking.bookingReference,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      nights: booking.nights,
      totalAmount: booking.totalAmount,
      accountCreated,
      token: token ?? null,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone ?? null,
        role: "user" as const,
      },
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
