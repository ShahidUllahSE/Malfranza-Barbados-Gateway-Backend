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
  listPublicVehicles,
} from "./taxi.service.js";
import { getTaxiSettings } from "./taxi-settings.service.js";
import {
  createTaxiBookingSchema,
  fareEstimateSchema,
  publicVehiclesQuerySchema,
  taxiPublicLookupSchema,
} from "./taxi.validation.js";

function customerDetailsFromUser(user: AuthenticatedUser, input: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}) {
  return {
    customerName: input.customerName.trim() || user.name,
    customerEmail: (input.customerEmail.trim() || user.email).toLowerCase(),
    customerPhone: input.customerPhone.trim() || user.phone || input.customerPhone,
  };
}

async function resolveTaxiCustomer(
  sessionUser: AuthenticatedUser | undefined,
  input: { customerName: string; customerEmail: string; customerPhone: string },
) {
  const customerEmail = input.customerEmail.trim().toLowerCase();
  if (sessionUser && sessionUser.email.toLowerCase() === customerEmail) {
    return {
      user: sessionUser,
      token: undefined as string | undefined,
      accountCreated: false as const,
      plainPassword: undefined as string | undefined,
    };
  }

  return ensureGuestAccount({
    name: input.customerName,
    email: customerEmail,
    phone: input.customerPhone,
  });
}

export const getPublicTaxiSettings: RequestHandler = async (_request, response) => {
  const settings = await getTaxiSettings();
  response.status(200).json({ success: true, data: settings });
};

export const getPublicVehicles: RequestHandler = async (request, response) => {
  const input = publicVehiclesQuerySchema.parse(request.query);
  const data = await listPublicVehicles(input);
  response.status(200).json({ success: true, data });
};

export const postFareEstimate: RequestHandler = async (request, response) => {
  const input = fareEstimateSchema.parse(request.body);
  const estimate = await estimateFare(input);
  response.status(200).json({ success: true, data: estimate });
};

export const postTaxiBooking: RequestHandler = async (request, response) => {
  const input = createTaxiBookingSchema.parse(request.body);

  const guestAccount = await resolveTaxiCustomer(request.user, input);
  const user = guestAccount.user;
  const token = guestAccount.token;
  const accountCreated = guestAccount.accountCreated;
  const plainPassword = guestAccount.plainPassword;

  const customer = customerDetailsFromUser(user, input);
  const booking = await createTaxiBooking({ ...input, ...customer }, user.id);

  if (accountCreated && plainPassword) {
    await sendGuestCredentialsEmail({
      to: user.email,
      name: customer.customerName,
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
              passengerCapacity:
                (booking.driverId as { passengerCapacity?: number }).passengerCapacity ?? null,
            }
          : null,
      vehicleUpgraded: Boolean((booking as { vehicleUpgraded?: boolean }).vehicleUpgraded),
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
