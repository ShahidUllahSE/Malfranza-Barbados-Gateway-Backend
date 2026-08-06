import type { RequestHandler } from "express";
import { sendGuestCredentialsEmail } from "../notifications/email.service.js";
import {
  ensureGuestAccount,
  type AuthenticatedUser,
} from "../users/user.service.js";
import {
  createTaxiBooking,
  estimateFare,
  getPublicTaxiBooking,
} from "./taxi.service.js";
import { getTaxiSettings } from "./taxi-settings.service.js";
import {
  createTaxiBookingSchema,
  fareEstimateSchema,
  taxiPublicLookupSchema,
} from "./taxi.validation.js";

function customerDetailsFromUser(user: AuthenticatedUser, input: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}) {
  return {
    customerName: input.customerName.trim() || user.name,
    customerEmail: user.email,
    customerPhone: input.customerPhone.trim() || user.phone || input.customerPhone,
  };
}

export const getPublicTaxiSettings: RequestHandler = async (_request, response) => {
  const settings = await getTaxiSettings();
  response.status(200).json({ success: true, data: settings });
};

export const postFareEstimate: RequestHandler = async (request, response) => {
  const input = fareEstimateSchema.parse(request.body);
  const estimate = await estimateFare(input);
  response.status(200).json({ success: true, data: estimate });
};

export const postTaxiBooking: RequestHandler = async (request, response) => {
  const input = createTaxiBookingSchema.parse(request.body);

  let accountCreated = false;
  let token: string | undefined;
  let plainPassword: string | undefined;
  let user: AuthenticatedUser;

  if (request.user) {
    user = request.user;
  } else {
    const guestAccount = await ensureGuestAccount({
      name: input.customerName,
      email: input.customerEmail,
      phone: input.customerPhone,
    });
    user = guestAccount.user;
    token = guestAccount.token;
    accountCreated = guestAccount.accountCreated;
    plainPassword = guestAccount.plainPassword;
  }

  const customer = customerDetailsFromUser(user, input);
  const booking = await createTaxiBooking({ ...input, ...customer }, user.id);

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

  response.status(201).json({
    success: true,
    data: {
      bookingReference: booking.bookingReference,
      status: booking.status,
      distanceKm: booking.distanceKm,
      durationMinutes: booking.durationMinutes ?? null,
      estimatedFare: booking.estimatedFare,
      currency: booking.currency,
      pickupDate: booking.pickupDate,
      pickupTime: booking.pickupTime,
      pickupLocation: booking.pickupLocation,
      dropoffLocation: booking.dropoffLocation,
      serviceType: booking.serviceType,
      accountCreated,
      token: token ?? null,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone ?? null,
        role: "user" as const,
      },
      driver:
        booking.driverId && typeof booking.driverId === "object"
          ? {
              id: String((booking.driverId as { _id?: unknown })._id ?? ""),
              name: (booking.driverId as { name?: string }).name ?? "Driver",
              phone: (booking.driverId as { phone?: string }).phone ?? "",
              vehicleLabel: (booking.driverId as { vehicleLabel?: string | null }).vehicleLabel ?? null,
            }
          : null,
    },
  });
};

export const getTaxiBookingByReference: RequestHandler = async (request, response) => {
  const input = taxiPublicLookupSchema.parse({
    reference: request.params.reference,
    email: request.query.email,
  });
  const booking = await getPublicTaxiBooking(input.reference, input.email);
  response.status(200).json({ success: true, data: booking });
};
