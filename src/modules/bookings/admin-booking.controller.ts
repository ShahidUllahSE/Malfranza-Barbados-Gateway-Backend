import type { RequestHandler } from "express";
import { TravelAgency } from "../agencies/agency.model.js";
import { createUserNotification } from "../notifications/user-notification.service.js";
import {
  sendAgencyNewBookingEmail,
  sendBookingConfirmationEmail,
  sendGuestCredentialsEmail,
  sendPaymentReceiptEmail,
} from "../notifications/email.service.js";
import { ensureGuestAccount } from "../users/user.service.js";
import {
  cancelBooking,
  createBooking,
  getBookingForAdmin,
  listBookings,
  updateBookingPayment,
  updateBookingStatus,
} from "./booking.service.js";
import {
  adminBookingListQuerySchema,
  adminCreateBookingSchema,
  bookingIdParamSchema,
  updateBookingStatusSchema,
  updatePaymentStatusSchema,
} from "./booking.validation.js";

export const postAdminBooking: RequestHandler = async (request, response) => {
  const parsed = adminCreateBookingSchema.parse(request.body);
  const notifyGuest = parsed.notifyGuest !== false;
  const paymentStatus = parsed.paymentStatus ?? "unpaid";
  const paymentReference =
    paymentStatus === "paid"
      ? parsed.paymentReference?.trim() || "OFFLINE"
      : parsed.paymentReference?.trim() || undefined;

  const guestAccount = await ensureGuestAccount({
    name: parsed.guestName,
    email: parsed.guestEmail,
    phone: parsed.guestPhone,
  });
  const user = guestAccount.user;

  const booking = await createBooking(
    {
      apartmentId: parsed.apartmentId,
      unitId: parsed.unitId,
      unitIds: parsed.unitIds ?? (parsed.unitId ? [parsed.unitId] : undefined),
      checkIn: parsed.checkIn,
      checkOut: parsed.checkOut,
      guestName: parsed.guestName.trim(),
      guestEmail: parsed.guestEmail.trim().toLowerCase(),
      guestPhone: parsed.guestPhone.trim(),
      guests: parsed.guests,
      specialRequests: parsed.specialRequests,
      agencyCode: parsed.agencyCode,
      paymentStatus,
      paymentReference,
      status: parsed.status ?? "confirmed",
    },
    user.id,
  );

  const checkIn = String(booking.checkIn).slice(0, 10);
  const checkOut = String(booking.checkOut).slice(0, 10);
  const staySubtotal = Number(booking.staySubtotal);
  const totalAmount = Number(booking.totalAmount);

  if (notifyGuest && guestAccount.accountCreated && guestAccount.plainPassword) {
    await sendGuestCredentialsEmail({
      to: user.email,
      name: parsed.guestName,
      password: guestAccount.plainPassword,
      bookingReference: booking.bookingReference,
    }).catch((error) => {
      console.error("[email] Failed to send guest credentials", error);
    });
  }

  if (notifyGuest) {
    await sendBookingConfirmationEmail({
      to: parsed.guestEmail.trim().toLowerCase(),
      name: parsed.guestName.trim(),
      bookingReference: booking.bookingReference,
      checkIn,
      checkOut,
      apartmentName: booking.apartmentName,
      totalAmount,
      guests: Number(booking.guests),
      nights: Number(booking.nights),
      loginEmail: guestAccount.accountCreated ? user.email : undefined,
      temporaryPassword: guestAccount.accountCreated ? guestAccount.plainPassword : undefined,
    }).catch((error) => {
      console.error("[email] Failed to send booking confirmation", error);
    });

    if (paymentStatus === "paid") {
      await sendPaymentReceiptEmail({
        to: parsed.guestEmail.trim().toLowerCase(),
        name: parsed.guestName.trim(),
        bookingReference: booking.bookingReference,
        totalAmount,
        paymentMethod: "Offline",
        stayLabel: `${booking.apartmentName} (${booking.nights} night${booking.nights === 1 ? "" : "s"})`,
        stayAmount: staySubtotal,
      }).catch((error) => {
        console.error("[email] Failed to send payment receipt", error);
      });
    }

    await createUserNotification({
      userId: user.id,
      type: "stay",
      title: "Stay booking confirmed",
      body: `${booking.apartmentName} · ${checkIn} → ${checkOut}`,
      href: "/my-bookings",
      entityId: String(booking._id),
    }).catch((error) => {
      console.error("[notify] Failed to create guest stay notification", error);
    });
  }

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

  const full = await getBookingForAdmin(String(booking._id));
  response.status(201).json({ success: true, data: full });
};

export const getAdminBookings: RequestHandler = async (request, response) => {
  const input = adminBookingListQuerySchema.parse(request.query);
  const result = await listBookings(input);
  response.status(200).json({ success: true, data: result });
};

export const getAdminBooking: RequestHandler = async (request, response) => {
  const { id } = bookingIdParamSchema.parse(request.params);
  const booking = await getBookingForAdmin(id);
  response.status(200).json({ success: true, data: booking });
};

export const patchBookingStatus: RequestHandler = async (request, response) => {
  const { id } = bookingIdParamSchema.parse(request.params);
  const { status } = updateBookingStatusSchema.parse(request.body);
  const booking = await updateBookingStatus(id, status);
  response.status(200).json({ success: true, data: booking });
};

export const patchBookingPayment: RequestHandler = async (request, response) => {
  const { id } = bookingIdParamSchema.parse(request.params);
  const { paymentStatus, paymentReference } = updatePaymentStatusSchema.parse(request.body);
  const booking = await updateBookingPayment(id, paymentStatus, paymentReference);
  response.status(200).json({ success: true, data: booking });
};

export const deleteAdminBooking: RequestHandler = async (request, response) => {
  const { id } = bookingIdParamSchema.parse(request.params);
  const booking = await cancelBooking(id);
  response.status(200).json({
    success: true,
    message: "Booking cancelled",
    data: booking,
  });
};
