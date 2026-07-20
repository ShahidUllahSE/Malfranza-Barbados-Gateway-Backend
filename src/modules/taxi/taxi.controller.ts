import type { RequestHandler } from "express";
import type { AuthenticatedUser } from "../users/user.service.js";
import {
  createTaxiBooking,
  estimateFare,
  getPublicTaxiBooking,
} from "./taxi.service.js";
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

export const postFareEstimate: RequestHandler = async (request, response) => {
  const input = fareEstimateSchema.parse(request.body);
  const estimate = await estimateFare(input);
  response.status(200).json({ success: true, data: estimate });
};

export const postTaxiBooking: RequestHandler = async (request, response) => {
  if (!request.user) {
    response.status(401).json({ success: false, message: "Sign in required to book a ride" });
    return;
  }

  const input = createTaxiBookingSchema.parse(request.body);
  const customer = customerDetailsFromUser(request.user, input);
  const booking = await createTaxiBooking({ ...input, ...customer }, request.user.id);

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
