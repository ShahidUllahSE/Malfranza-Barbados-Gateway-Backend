import type { RequestHandler } from "express";
import { TravelAgency } from "../agencies/agency.model.js";
import { createAdminNotification } from "../notifications/admin-notification.service.js";
import {
  sendAdminNewStayBookingEmail,
  sendAdminPaymentReceivedEmail,
  sendAgencyNewBookingEmail,
  sendBookingConfirmationEmail,
  sendGuestCredentialsEmail,
  sendPaymentReceiptEmail,
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

function guestDetailsFromUser(
  user: AuthenticatedUser,
  input: {
    guestName: string;
    guestEmail: string;
    guestPhone: string;
  },
) {
  return {
    guestName: input.guestName.trim() || user.name,
    guestEmail: (input.guestEmail.trim() || user.email).toLowerCase(),
    guestPhone: input.guestPhone.trim() || user.phone || input.guestPhone,
  };
}

/**
 * Account for the email entered on the form.
 * Reuse session only when it matches that email; otherwise find/create by guest email
 * so first-time guests always get temp credentials.
 */
async function resolveBookingUser(
  sessionUser: AuthenticatedUser | undefined,
  input: { guestName: string; guestEmail: string; guestPhone: string },
) {
  const guestEmail = input.guestEmail.trim().toLowerCase();
  if (sessionUser && sessionUser.email.toLowerCase() === guestEmail) {
    return {
      user: sessionUser,
      token: undefined as string | undefined,
      accountCreated: false as const,
      plainPassword: undefined as string | undefined,
    };
  }

  return ensureGuestAccount({
    name: input.guestName,
    email: guestEmail,
    phone: input.guestPhone,
  });
}

function taxiSummaryFromBooking(booking: {
  taxi?: {
    date?: Date | string;
    time?: string;
    pickup?: string;
    dropoff?: string;
    passengers?: number;
    fare?: number;
    notes?: string | null;
  } | null;
}) {
  const t = booking.taxi;
  if (!t) return undefined;
  const date = t.date ? String(t.date).slice(0, 10) : "";
  const parts = [
    date && t.time ? `${date} at ${t.time}` : "",
    t.pickup ? `from ${t.pickup}` : "",
    t.dropoff ? `to ${t.dropoff}` : "",
    t.passengers != null ? `${t.passengers} passenger${t.passengers === 1 ? "" : "s"}` : "",
    t.fare != null ? `$${Number(t.fare).toFixed(2)}` : "",
    t.notes || "",
  ].filter(Boolean);
  return parts.length ? `Airport pickup: ${parts.join(" · ")}` : undefined;
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

  const guestAccount = await resolveBookingUser(request.user, input);
  const user = guestAccount.user;
  const token = guestAccount.token;
  const accountCreated = guestAccount.accountCreated;
  const plainPassword = guestAccount.plainPassword;

  const guest = guestDetailsFromUser(user, input);
  // Guest stay bookings are confirmed on create — admin does not need to confirm.
  const booking = await createBooking({ ...input, ...guest, status: "confirmed" }, user.id);

  const checkIn = String(booking.checkIn).slice(0, 10);
  const checkOut = String(booking.checkOut).slice(0, 10);
  const hasTaxi = Boolean(booking.taxi);
  const taxiFare = booking.taxi ? Number(booking.taxi.fare) : 0;
  const staySubtotal = Number(booking.staySubtotal);
  const totalAmount = Number(booking.totalAmount);

  // Journey A: temporary password / access email
  if (accountCreated && plainPassword) {
    await sendGuestCredentialsEmail({
      to: user.email,
      name: guest.guestName,
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
    checkIn,
    checkOut,
    apartmentName: booking.apartmentName,
    totalAmount,
    guests: Number(booking.guests),
    nights: Number(booking.nights),
    taxiSummary: taxiSummaryFromBooking(booking),
    bundleNote: hasTaxi,
    loginEmail: accountCreated ? user.email : undefined,
    temporaryPassword: accountCreated ? plainPassword : undefined,
  }).catch((error) => {
    console.error("[email] Failed to send booking confirmation", error);
  });

  if (booking.paymentStatus === "paid") {
    await sendPaymentReceiptEmail({
      to: guest.guestEmail,
      name: guest.guestName,
      bookingReference: booking.bookingReference,
      totalAmount,
      paymentMethod: "PayPal",
      stayLabel: `${booking.apartmentName} (${booking.nights} night${booking.nights === 1 ? "" : "s"})`,
      stayAmount: staySubtotal,
      taxiAmount: hasTaxi ? taxiFare : undefined,
    }).catch((error) => {
      console.error("[email] Failed to send payment receipt", error);
    });

    await sendAdminPaymentReceivedEmail({
      bookingReference: booking.bookingReference,
      amount: totalAmount,
      guestName: guest.guestName,
      method: "PayPal",
    }).catch((error) => {
      console.error("[email] Failed to send admin payment alert", error);
    });
  }

  await sendAdminNewStayBookingEmail({
    bookingReference: booking.bookingReference,
    guestName: guest.guestName,
    guestEmail: guest.guestEmail,
    guestPhone: guest.guestPhone,
    apartmentName: booking.apartmentName,
    checkIn,
    checkOut,
    totalAmount,
    nights: Number(booking.nights),
    agencyCode: booking.agencyCode ?? null,
    agencyName: booking.agencyName ?? null,
  }).catch((error) => {
    console.error("[email] Failed to send admin stay alert", error);
  });

  const stayId = String(booking.id ?? booking._id);
  await createAdminNotification({
    type: "stay_booking",
    title: "New stay booking",
    body: `${guest.guestName} · ${booking.apartmentName} · ${checkIn} → ${checkOut}`,
    href: `/admin/bookings`,
    entityId: stayId,
  }).catch((error) => {
    console.error("[notify] Failed to create admin stay notification", error);
  });

  // Agency: new booking under their code
  if (booking.agencyId && booking.agencyCode) {
    const agency = await TravelAgency.findById(booking.agencyId).lean();
    if (agency?.email) {
      await sendAgencyNewBookingEmail({
        to: agency.email,
        contactName: agency.contactName,
        agencyCode: booking.agencyCode,
        bookingReference: booking.bookingReference,
        apartmentName: booking.apartmentName,
        checkIn,
        checkOut,
        bookingValue: staySubtotal,
        commissionAmount: Number(booking.commissionAmount ?? 0),
        commissionRate: Number(booking.commissionRate ?? agency.commissionRate ?? 0.1),
      }).catch((error) => {
        console.error("[email] Failed to send agency new booking email", error);
      });
    }
  }

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
