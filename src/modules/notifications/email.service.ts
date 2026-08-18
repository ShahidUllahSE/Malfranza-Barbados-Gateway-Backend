import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

const PHONE = "1 (246) 234-4875";
const ADDRESS = "Haggatt Hall, St. Michael, Barbados";

function smtpConfigured() {
  return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

function createTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

export type SendMailResult =
  | { sent: true }
  | { sent: false; reason: "smtp_not_configured" | "missing_recipient" };

async function sendMail(options: {
  to?: string | null;
  subject: string;
  text: string;
  html: string;
}): Promise<SendMailResult> {
  const to = options.to?.trim();
  if (!to) return { sent: false, reason: "missing_recipient" };

  if (!smtpConfigured()) {
    console.info("[email] SMTP not configured — skipping send", {
      to,
      subject: options.subject,
      preview: options.text.slice(0, 320),
    });
    return { sent: false, reason: "smtp_not_configured" };
  }

  const from = env.SMTP_FROM || env.SMTP_USER!;
  const transport = createTransport();
  await transport.sendMail({
    from,
    to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
  return { sent: true };
}

function siteUrl(path = "") {
  return `${env.FRONTEND_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function firstName(name: string) {
  const part = name.trim().split(/\s+/)[0];
  return part || "there";
}

function money(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

const SIG =
  `Warm regards,\nThe Malfranza Team\nMalfranza Apartments & Taxi\n${PHONE} · ${env.SMTP_FROM || env.SMTP_USER || "info@malfranzaapartments.com"} · ${siteUrl("/")}`;

const FOOTER_TEXT = `Malfranza Apartments & Taxi, Barbados · You're receiving this because you booked or created an account with us. · ${siteUrl("/privacy")}`;

function emailLogoUrl() {
  return siteUrl("/malfranza-logo.png");
}

function wrapHtml(body: string) {
  const logoUrl = emailLogoUrl();
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;background:#f4f1ea;padding:24px 12px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#ffffff;padding:20px 22px 16px;text-align:center;border-bottom:3px solid #2D5A3D;">
        <a href="${siteUrl("/")}" style="text-decoration:none;display:inline-block;">
          <img
            src="${logoUrl}"
            width="200"
            alt="Malfranza Apartments &amp; Taxi"
            style="display:block;margin:0 auto;width:200px;max-width:70%;height:auto;border:0;outline:none;"
          />
        </a>
        <div style="font-size:12px;color:#4a5a5a;margin-top:10px;font-family:system-ui,-apple-system,sans-serif;">
          Apartments &amp; Taxi · Barbados
        </div>
      </div>
      <div style="padding:22px;color:#1F2A2A;line-height:1.55;font-size:15px;font-family:system-ui,-apple-system,sans-serif;">
        ${body}
        <p style="margin-top:28px;font-size:14px;color:#1F2A2A;">
          Warm regards,<br/>
          <strong>The Malfranza Team</strong><br/>
          Malfranza Apartments &amp; Taxi<br/>
          <span style="color:#4a5a5a;font-size:13px;">${escapeHtml(PHONE)}</span>
        </p>
      </div>
      <div style="padding:14px 22px;background:#F7F8F6;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;font-family:system-ui,sans-serif;line-height:1.45;">
        Malfranza Apartments &amp; Taxi, ${escapeHtml(ADDRESS)} ·
        <a href="${siteUrl("/privacy")}" style="color:#2D5A3D;">Privacy Policy</a>
      </div>
    </div>
  </div>`;
}

function mail(to: string | undefined | null, subject: string, textLines: string[], htmlBody: string) {
  const text = [...textLines, "", SIG, "", FOOTER_TEXT].join("\n");
  return sendMail({ to, subject, text, html: wrapHtml(htmlBody) });
}

export function isSmtpReady() {
  return smtpConfigured();
}

/* ========== GROUP 1 — Guest ========== */

export async function sendAgencySignupOtpEmail(input: {
  to: string;
  name: string;
  agencyName: string;
  code: string;
  expiresMinutes: number;
}) {
  const greeter = firstName(input.name);
  return mail(
    input.to,
    "Verify your Malfranza travel agent account",
    [
      `Hi ${greeter},`,
      "",
      `Please confirm your email to finish creating the travel agent account for ${input.agencyName}.`,
      "",
      `Your verification code is: ${input.code}`,
      "",
      `Enter this code on the site. It expires in ${input.expiresMinutes} minutes.`,
      "If you didn't request a travel agent account, you can safely ignore this email.",
    ],
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>Please confirm your email to finish creating the travel agent account for <strong>${escapeHtml(input.agencyName)}</strong>.</p>
     <p>Your verification code is:</p>
     <p style="font-size:28px;letter-spacing:0.18em;font-weight:700;margin:18px 0;color:#2D5A3D;">${escapeHtml(input.code)}</p>
     <p style="font-size:13px;color:#4a5a5a;">Enter this code on the site. The code expires in ${input.expiresMinutes} minutes.</p>
     <p style="font-size:13px;color:#4a5a5a;">If you didn't request a travel agent account, you can safely ignore this email.</p>`,
  );
}

export async function sendSignupOtpEmail(input: {
  to: string;
  name: string;
  code: string;
  expiresMinutes: number;
}) {
  const greeter = firstName(input.name);
  return mail(
    input.to,
    "Verify your Malfranza account",
    [
      `Hi ${greeter},`,
      "",
      "Welcome to Malfranza Apartments & Taxi! Please confirm your email address to activate your account.",
      "",
      `Your verification code is: ${input.code}`,
      "",
      `Enter this code on the site. It expires in ${input.expiresMinutes} minutes.`,
      "If you didn't create an account with us, you can safely ignore this email.",
    ],
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>Welcome to Malfranza Apartments &amp; Taxi! Please confirm your email address to activate your account.</p>
     <p>Your verification code is:</p>
     <p style="font-size:28px;letter-spacing:0.18em;font-weight:700;margin:18px 0;color:#2D5A3D;">${escapeHtml(input.code)}</p>
     <p style="font-size:13px;color:#4a5a5a;">Enter this code on the site. The code expires in ${input.expiresMinutes} minutes.</p>
     <p style="font-size:13px;color:#4a5a5a;">If you didn't create an account with us, you can safely ignore this email.</p>`,
  );
}

export async function sendGuestCredentialsEmail(input: {
  to: string;
  name: string;
  password: string;
  bookingReference?: string;
}) {
  const greeter = firstName(input.name);
  const loginUrl = siteUrl("/?auth=signin");
  const myBookings = siteUrl("/my-bookings");
  return mail(
    input.to,
    "Access your Malfranza booking",
    [
      `Hi ${greeter},`,
      "",
      "Thanks for booking with Malfranza! We've set up secure access to your booking so you can view or manage it anytime.",
      "",
      `You can log in with this temporary password: ${input.password}`,
      `Login email: ${input.to}`,
      `Sign in: ${loginUrl}`,
      `My Bookings: ${myBookings}`,
      input.bookingReference ? `Booking reference: ${input.bookingReference}` : "",
      "",
      "For your security, we recommend setting your own password once you log in.",
    ].filter(Boolean),
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>Thanks for booking with Malfranza! We've set up secure access to your booking so you can view or manage it anytime.</p>
     <p>You can log in with this temporary password:</p>
     <p><code style="font-size:16px;background:#F7F8F6;padding:8px 12px;border-radius:8px;">${escapeHtml(input.password)}</code></p>
     <p><strong>Login email:</strong> ${escapeHtml(input.to)}</p>
     <p><a href="${loginUrl}" style="color:#2D5A3D;font-weight:600;">Sign in</a>
        · <a href="${myBookings}" style="color:#2D5A3D;font-weight:600;">My Bookings</a></p>
     ${input.bookingReference ? `<p>Booking reference: <strong>${escapeHtml(input.bookingReference)}</strong></p>` : ""}
     <p style="font-size:13px;color:#4a5a5a;">For your security, we recommend setting your own password once you log in.</p>`,
  );
}

export async function sendBookingConfirmationEmail(input: {
  to: string;
  name: string;
  bookingReference: string;
  checkIn: string;
  checkOut: string;
  apartmentName: string;
  totalAmount: number;
  guests?: number;
  nights?: number;
  taxiSummary?: string;
  bundleNote?: boolean;
  loginEmail?: string;
  temporaryPassword?: string;
}) {
  const greeter = firstName(input.name);
  const portalUrl = siteUrl(`/my-bookings/${encodeURIComponent(input.bookingReference)}`);
  const subject = `Your Malfranza booking is confirmed — ${input.bookingReference}`;
  return mail(
    input.to,
    subject,
    [
      `Hi ${greeter},`,
      "",
      "Thank you for booking with Malfranza Apartments & Taxi! Your reservation is confirmed.",
      "",
      `Booking reference: ${input.bookingReference}`,
      `Apartment: ${input.apartmentName}`,
      `Check-in: ${input.checkIn}`,
      `Check-out: ${input.checkOut}`,
      input.guests != null ? `Guests: ${input.guests}` : "",
      `Total paid: ${money(input.totalAmount)}`,
      `Address: ${ADDRESS}`,
      input.bundleNote ? "Airport pickup: Added — you saved 5% on your stay." : "",
      input.taxiSummary ? `Pickup: ${input.taxiSummary}` : "",
      "",
      `View or manage your booking: ${portalUrl}`,
      input.temporaryPassword
        ? `Temporary login password (if new account): ${input.temporaryPassword}`
        : "",
      "",
      `Questions? Call ${PHONE}.`,
    ].filter(Boolean),
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>Thank you for booking with Malfranza Apartments &amp; Taxi! We're delighted to host you. Your reservation is confirmed.</p>
     <ul>
       <li><strong>Booking reference:</strong> ${escapeHtml(input.bookingReference)}</li>
       <li><strong>Apartment:</strong> ${escapeHtml(input.apartmentName)}</li>
       <li><strong>Check-in:</strong> ${escapeHtml(input.checkIn)}</li>
       <li><strong>Check-out:</strong> ${escapeHtml(input.checkOut)}</li>
       ${input.guests != null ? `<li><strong>Guests:</strong> ${input.guests}</li>` : ""}
       <li><strong>Total paid:</strong> ${money(input.totalAmount)}</li>
       <li><strong>Address:</strong> ${escapeHtml(ADDRESS)}</li>
     </ul>
     ${input.bundleNote ? `<p><strong>Airport pickup:</strong> Added — you saved 5% on your stay. We'll confirm pickup details separately.</p>` : ""}
     ${input.taxiSummary ? `<p>${escapeHtml(input.taxiSummary)}</p>` : ""}
     <p>Self-check-in · solar powered · Starlink Wi‑Fi · free parking on site. We'll send check-in instructions closer to the date.</p>
     <p><a href="${portalUrl}" style="color:#E07A3D;font-weight:600;">View My Bookings</a></p>
     ${
       input.temporaryPassword
         ? `<p style="font-size:13px;color:#4a5a5a;">Temporary login password: <code>${escapeHtml(input.temporaryPassword)}</code> (change after sign-in).</p>`
         : ""
     }
     <p style="font-size:13px;color:#4a5a5a;">Questions? Call ${escapeHtml(PHONE)}.</p>`,
  );
}

export async function sendPaymentReceiptEmail(input: {
  to: string;
  name: string;
  bookingReference: string;
  totalAmount: number;
  paymentMethod?: string;
  stayLabel?: string;
  stayAmount?: number;
  taxiAmount?: number;
  bundleDiscount?: number;
}) {
  const greeter = firstName(input.name);
  return mail(
    input.to,
    `Your Malfranza payment receipt — ${input.bookingReference}`,
    [
      `Hi ${greeter},`,
      "",
      "Thank you for your payment. Here is your receipt.",
      `Booking reference: ${input.bookingReference}`,
      `Payment method: ${input.paymentMethod || "Card / demo checkout"}`,
      input.stayLabel ? `${input.stayLabel}: ${money(input.stayAmount ?? 0)}` : "",
      input.taxiAmount ? `Airport pickup: ${money(input.taxiAmount)}` : "",
      input.bundleDiscount ? `Bundle discount (5%): −${money(input.bundleDiscount)}` : "",
      `Total paid: ${money(input.totalAmount)}`,
    ].filter(Boolean),
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>Thank you for your payment. Here is your receipt for your records.</p>
     <ul>
       <li><strong>Booking reference:</strong> ${escapeHtml(input.bookingReference)}</li>
       <li><strong>Payment method:</strong> ${escapeHtml(input.paymentMethod || "Card / demo checkout")}</li>
       ${input.stayLabel ? `<li>${escapeHtml(input.stayLabel)} — ${money(input.stayAmount ?? 0)}</li>` : ""}
       ${input.taxiAmount ? `<li>Airport pickup — ${money(input.taxiAmount)}</li>` : ""}
       ${input.bundleDiscount ? `<li>Bundle discount (5%) — −${money(input.bundleDiscount)}</li>` : ""}
       <li><strong>Total paid:</strong> ${money(input.totalAmount)}</li>
     </ul>
     <p style="font-size:13px;color:#4a5a5a;">No further action is needed.</p>`,
  );
}

export async function sendStayStatusEmail(input: {
  to: string;
  name: string;
  bookingReference: string;
  status: string;
  apartmentName?: string;
  checkIn?: string;
  checkOut?: string;
  changeSummary?: string;
  refundNote?: string;
}) {
  const greeter = firstName(input.name);
  const isCancel = input.status === "cancelled";
  const subject = isCancel
    ? `Your Malfranza booking has been cancelled — ${input.bookingReference}`
    : `Your Malfranza booking has been updated — ${input.bookingReference}`;
  const portalUrl = siteUrl(`/my-bookings/${encodeURIComponent(input.bookingReference)}`);

  return mail(
    input.to,
    subject,
    [
      `Hi ${greeter},`,
      "",
      isCancel
        ? `We're confirming that your booking has been cancelled.`
        : `Your booking has been updated.`,
      `Booking reference: ${input.bookingReference}`,
      input.apartmentName ? `Apartment: ${input.apartmentName}` : "",
      input.checkIn && input.checkOut ? `Dates: ${input.checkIn} → ${input.checkOut}` : "",
      input.changeSummary ? `What changed: ${input.changeSummary}` : `Status: ${input.status}`,
      isCancel
        ? input.refundNote ||
          "Please see our booking policy for any cancellation fee or refund details."
        : "",
      `Review: ${portalUrl}`,
      `Questions? Call ${PHONE}.`,
    ].filter(Boolean),
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>${isCancel ? "We're confirming that your booking has been cancelled." : "Your booking has been updated."}</p>
     <ul>
       <li><strong>Booking reference:</strong> ${escapeHtml(input.bookingReference)}</li>
       ${input.apartmentName ? `<li><strong>Apartment:</strong> ${escapeHtml(input.apartmentName)}</li>` : ""}
       ${input.checkIn && input.checkOut ? `<li><strong>Dates:</strong> ${escapeHtml(input.checkIn)} → ${escapeHtml(input.checkOut)}</li>` : ""}
       <li><strong>${isCancel ? "Status" : "Update"}:</strong> ${escapeHtml(input.changeSummary || input.status)}</li>
     </ul>
     ${
       isCancel
         ? `<p style="font-size:13px;color:#4a5a5a;">${escapeHtml(
             input.refundNote ||
               "Please see our booking policy for any cancellation fee or refund. Questions? Call " + PHONE + ".",
           )}</p>`
         : ""
     }
     <p><a href="${portalUrl}" style="color:#2D5A3D;font-weight:600;">My Bookings</a></p>`,
  );
}

export async function sendStayReminderEmail(input: {
  to: string;
  name: string;
  apartmentName: string;
  checkIn: string;
  checkOut: string;
  bookingReference: string;
  hasTaxi?: boolean;
}) {
  const greeter = firstName(input.name);
  return mail(
    input.to,
    `Your Malfranza stay is coming up — ${input.checkIn}`,
    [
      `Hi ${greeter},`,
      "",
      "We're looking forward to welcoming you soon!",
      `Apartment: ${input.apartmentName}`,
      `Check-in: ${input.checkIn}`,
      `Check-out: ${input.checkOut}`,
      `Address: ${ADDRESS}`,
      input.hasTaxi ? "Your airport pickup is booked — we'll share driver details shortly." : "",
      `Reference: ${input.bookingReference}`,
      `Questions? Call ${PHONE}.`,
    ].filter(Boolean),
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>We're looking forward to welcoming you soon! This is a friendly reminder about your upcoming stay.</p>
     <ul>
       <li><strong>Apartment:</strong> ${escapeHtml(input.apartmentName)}</li>
       <li><strong>Check-in:</strong> ${escapeHtml(input.checkIn)}</li>
       <li><strong>Check-out:</strong> ${escapeHtml(input.checkOut)}</li>
       <li><strong>Address:</strong> ${escapeHtml(ADDRESS)}</li>
       <li><strong>Reference:</strong> ${escapeHtml(input.bookingReference)}</li>
     </ul>
     ${input.hasTaxi ? `<p>Your airport pickup is set — we'll share your driver's details shortly.</p>` : ""}
     <p>We'll send full check-in instructions closer to the date. Call ${escapeHtml(PHONE)} anytime.</p>`,
  );
}

export async function sendCheckInInstructionsEmail(input: {
  to: string;
  name: string;
  apartmentName: string;
  checkIn: string;
  bookingReference: string;
}) {
  const greeter = firstName(input.name);
  return mail(
    input.to,
    "Getting into your Malfranza apartment",
    [
      `Hi ${greeter},`,
      "",
      "Your stay is almost here! Here's everything you need for a smooth self-check-in.",
      `Apartment: ${input.apartmentName}`,
      `Address: ${ADDRESS}`,
      `Check-in: ${input.checkIn}`,
      `Reference: ${input.bookingReference}`,
      "",
      "Getting in: Self-check-in details will be provided by Malfranza on arrival / as arranged.",
      "Wi-Fi: High-speed internet powered by Starlink.",
      "Parking: Free on-site parking for guests with their own transport.",
      "",
      "House rules: No smoking inside · No pets · No parties on the premises.",
      `Issues? Call ${PHONE}.`,
    ],
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>Your stay is almost here! Here's everything you need for a smooth self-check-in.</p>
     <ul>
       <li><strong>Apartment:</strong> ${escapeHtml(input.apartmentName)}</li>
       <li><strong>Address:</strong> ${escapeHtml(ADDRESS)}</li>
       <li><strong>Check-in:</strong> ${escapeHtml(input.checkIn)}</li>
       <li><strong>Reference:</strong> ${escapeHtml(input.bookingReference)}</li>
     </ul>
     <p><strong>Getting in:</strong> Self-check-in — Malfranza will share access steps for your stay.</p>
     <p><strong>Wi‑Fi:</strong> High-speed internet powered by Starlink.<br/>
     <strong>Parking:</strong> Free on-site parking.</p>
     <p><strong>House rules:</strong> No smoking inside · No pets · No parties on the premises.</p>
     <p>If anything comes up, call ${escapeHtml(PHONE)}.</p>`,
  );
}

export async function sendTaxiConfirmationEmail(input: {
  to: string;
  name: string;
  bookingReference: string;
  serviceType: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupDate: string;
  pickupTime: string;
  estimatedFare: number;
  currency?: string;
  passengers?: number;
  flightNumber?: string;
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleLabel?: string | null;
  pending?: boolean;
}) {
  const greeter = firstName(input.name);
  const portal = siteUrl("/my-bookings");
  const pending = Boolean(input.pending);
  return mail(
    input.to,
    pending
      ? `We received your Malfranza ride request — ${input.pickupDate}`
      : `Your Malfranza ride is confirmed — ${input.pickupDate}`,
    [
      `Hi ${greeter},`,
      "",
      pending
        ? "We received your taxi booking. It is pending confirmation from Malfranza."
        : "Your ride with Malfranza is booked and confirmed.",
      `Booking reference: ${input.bookingReference}`,
      `Date & time: ${input.pickupDate} ${input.pickupTime}`,
      input.flightNumber ? `Flight: ${input.flightNumber}` : "",
      `Pickup: ${input.pickupLocation}`,
      `Drop-off: ${input.dropoffLocation}`,
      input.passengers != null ? `Passengers: ${input.passengers}` : "",
      `Vehicle: ${input.vehicleLabel || input.serviceType}`,
      `Total: ${money(input.estimatedFare)}`,
      pending
        ? "We'll email you again when your booking is confirmed."
        : input.driverName
          ? `Driver: ${input.driverName}${input.driverPhone ? ` · ${input.driverPhone}` : ""}`
          : "We'll assign your driver ahead of your trip.",
      `View: ${portal}`,
      `Changes? Call ${PHONE}.`,
    ].filter(Boolean),
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>${
       pending
         ? "We received your taxi booking. It is pending confirmation from Malfranza."
         : "Your ride with Malfranza is booked and confirmed."
     }</p>
     <ul>
       <li><strong>Reference:</strong> ${escapeHtml(input.bookingReference)}</li>
       <li><strong>Date &amp; time:</strong> ${escapeHtml(input.pickupDate)} ${escapeHtml(input.pickupTime)}</li>
       ${input.flightNumber ? `<li><strong>Flight:</strong> ${escapeHtml(input.flightNumber)}</li>` : ""}
       <li><strong>Pickup:</strong> ${escapeHtml(input.pickupLocation)}</li>
       <li><strong>Drop-off:</strong> ${escapeHtml(input.dropoffLocation)}</li>
       ${input.passengers != null ? `<li><strong>Passengers:</strong> ${input.passengers}</li>` : ""}
       <li><strong>Total paid:</strong> ${money(input.estimatedFare)}</li>
     </ul>
     ${
       pending
         ? "<p>We'll email you again when your booking is confirmed.</p>"
         : input.driverName
           ? `<p><strong>Driver:</strong> ${escapeHtml(input.driverName)}</p>`
           : "<p>We'll assign your driver ahead of your trip and share their details closer to the time.</p>"
     }
     <p><a href="${portal}" style="color:#2D5A3D;font-weight:600;">My Bookings</a> · Call ${escapeHtml(PHONE)}</p>`,
  );
}

export async function sendTaxiStatusEmail(input: {
  to: string;
  name: string;
  bookingReference: string;
  status: string;
  pickupDate?: string;
  pickupTime?: string;
  driverName?: string | null;
  refundNote?: string;
}) {
  const greeter = firstName(input.name);
    const isCancel = input.status === "cancelled";
    const isConfirmed = input.status === "confirmed" || input.status === "assigned";
    const statusLine = isCancel
      ? `Your taxi booking ${input.bookingReference} has been cancelled.`
      : isConfirmed
        ? input.driverName
          ? `Your taxi booking ${input.bookingReference} is confirmed. ${input.driverName} is assigned as your driver.`
          : `Your taxi booking ${input.bookingReference} is confirmed.`
        : `Your taxi booking ${input.bookingReference} is now: ${input.status.replaceAll("_", " ")}.`;
    const statusHtml = isCancel
      ? `Your taxi booking <strong>${escapeHtml(input.bookingReference)}</strong> has been cancelled.`
      : isConfirmed
        ? input.driverName
          ? `Your taxi booking <strong>${escapeHtml(input.bookingReference)}</strong> is confirmed. <strong>${escapeHtml(input.driverName)}</strong> is assigned as your driver.`
          : `Your taxi booking <strong>${escapeHtml(input.bookingReference)}</strong> is confirmed.`
        : `Your taxi booking <strong>${escapeHtml(input.bookingReference)}</strong> is now: <strong>${escapeHtml(input.status.replaceAll("_", " "))}</strong>.`;
  return mail(
    input.to,
    isCancel
      ? `Your Malfranza ride has been cancelled — ${input.bookingReference}`
      : isConfirmed
        ? `Your Malfranza ride is confirmed — ${input.bookingReference}`
        : `Your Malfranza ride update — ${input.bookingReference}`,
    [
      `Hi ${greeter},`,
      "",
      statusLine,
      input.pickupDate && input.pickupTime
        ? `When: ${input.pickupDate} at ${input.pickupTime}`
        : "",
      input.driverName && !isConfirmed ? `Driver: ${input.driverName}` : "",
      input.refundNote || "",
      `Call ${PHONE} with any questions.`,
    ].filter(Boolean),
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>${statusHtml}</p>
     ${input.pickupDate && input.pickupTime ? `<p>When: ${escapeHtml(input.pickupDate)} at ${escapeHtml(input.pickupTime)}</p>` : ""}
     ${input.driverName && !isConfirmed ? `<p>Driver: ${escapeHtml(input.driverName)}</p>` : ""}
     ${input.refundNote ? `<p style="font-size:13px;color:#4a5a5a;">${escapeHtml(input.refundNote)}</p>` : ""}`,
  );
}

export async function sendRideReminderEmail(input: {
  to: string;
  name: string;
  pickupDate: string;
  pickupTime: string;
  pickupLocation: string;
  dropoffLocation: string;
  passengers?: number;
  driverName?: string | null;
  driverPhone?: string | null;
  bookingReference: string;
}) {
  const greeter = firstName(input.name);
  return mail(
    input.to,
    `Your Malfranza ride is tomorrow — ${input.pickupDate} ${input.pickupTime}`,
    [
      `Hi ${greeter},`,
      "",
      "Just a reminder that your ride with Malfranza is coming up.",
      `Date & time: ${input.pickupDate} ${input.pickupTime}`,
      `Pickup: ${input.pickupLocation}`,
      `Drop-off: ${input.dropoffLocation}`,
      input.passengers != null ? `Passengers: ${input.passengers}` : "",
      input.driverName
        ? `Driver: ${input.driverName}${input.driverPhone ? ` · ${input.driverPhone}` : ""}`
        : "Driver details will be shared when assigned.",
      `Reference: ${input.bookingReference}`,
    ].filter(Boolean),
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>Just a reminder that your ride with Malfranza is coming up.</p>
     <ul>
       <li><strong>When:</strong> ${escapeHtml(input.pickupDate)} ${escapeHtml(input.pickupTime)}</li>
       <li><strong>Pickup:</strong> ${escapeHtml(input.pickupLocation)}</li>
       <li><strong>Drop-off:</strong> ${escapeHtml(input.dropoffLocation)}</li>
       <li><strong>Reference:</strong> ${escapeHtml(input.bookingReference)}</li>
     </ul>
     ${input.driverName ? `<p>Driver: ${escapeHtml(input.driverName)}</p>` : ""}
     <p>Please be ready a few minutes ahead. Call ${escapeHtml(PHONE)} if needed.</p>`,
  );
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  resetUrl: string;
  expiresMinutes?: number;
  kind?: "guest" | "agency";
}) {
  const greeter = firstName(input.name);
  const subject =
    input.kind === "agency"
      ? "Reset your Malfranza agency password"
      : "Reset your Malfranza password";
  const mins = input.expiresMinutes ?? 60;
  return mail(
    input.to,
    subject,
    [
      `Hi ${greeter},`,
      "",
      "We received a request to reset your password. Use this link:",
      input.resetUrl,
      "",
      `This link expires in ${mins} minutes. If you didn't request this, ignore this email.`,
    ],
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>We received a request to reset your password. Click below to set a new one:</p>
     <p><a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:#2D5A3D;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;">Reset password</a></p>
     <p style="font-size:13px;color:#4a5a5a;">This link expires in ${mins} minutes. If you didn't request this, ignore this email — your password won't change.</p>`,
  );
}

export async function sendEnquiryReceivedEmail(input: {
  to: string;
  name: string;
  reference: string;
  message?: string;
}) {
  const greeter = firstName(input.name);
  return mail(
    input.to,
    "We've received your message — Malfranza",
    [
      `Hi ${greeter},`,
      "",
      "Thanks for reaching out to Malfranza Apartments & Taxi!",
      `We've received your message (ref ${input.reference}) and will get back to you within 24 hours.`,
      `For anything urgent, call ${PHONE}.`,
    ],
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>Thanks for reaching out to Malfranza Apartments &amp; Taxi! We've received your message and will get back to you within 24 hours.</p>
     <p>Reference: <strong>${escapeHtml(input.reference)}</strong></p>
     <p>For anything urgent, call ${escapeHtml(PHONE)}.</p>`,
  );
}

/* ========== GROUP 2 — Agency ========== */

export async function sendAgencyWelcomeEmail(input: {
  to: string;
  contactName: string;
  agencyName: string;
  agencyCode: string;
  commissionRate?: number;
}) {
  const pct = Math.round(Number(input.commissionRate ?? 0.1) * 100);
  const portal = siteUrl("/agency");
  return mail(
    input.to,
    "Welcome to the Malfranza agency programme",
    [
      `Hi ${firstName(input.contactName)},`,
      "",
      `Welcome to the Malfranza travel agency programme! We're glad to partner with ${input.agencyName}.`,
      "Your agency account is now active.",
      "",
      `Your unique booking code: ${input.agencyCode}`,
      `Enter this code at checkout when booking for clients. You earn ${pct}% commission on the stay.`,
      `Portal: ${portal}`,
    ],
    `<p>Hi ${escapeHtml(firstName(input.contactName))},</p>
     <p>Welcome to the Malfranza Apartments &amp; Taxi travel agency programme! We're glad to partner with <strong>${escapeHtml(input.agencyName)}</strong>.</p>
     <p>Your agency account is now active. From your portal you can track bookings and commission.</p>
     <p>Your unique booking code:</p>
     <p style="font-size:22px;font-weight:700;letter-spacing:0.06em;color:#2D5A3D;font-family:monospace;">${escapeHtml(input.agencyCode)}</p>
     <p>How it works: enter this code at checkout. Every booking with your code is credited to you at <strong>${pct}% commission</strong> on the room total.</p>
     <p><a href="${portal}" style="color:#E07A3D;font-weight:600;">Open agency portal</a></p>`,
  );
}

export async function sendAgencyCodeEmail(input: {
  to: string;
  contactName: string;
  agencyName: string;
  agencyCode: string;
}) {
  return sendAgencyWelcomeEmail(input);
}

export async function sendAgencyNewBookingEmail(input: {
  to: string;
  contactName: string;
  agencyCode: string;
  bookingReference: string;
  apartmentName: string;
  checkIn: string;
  checkOut: string;
  bookingValue: number;
  commissionAmount: number;
  commissionRate?: number;
}) {
  const pct = Math.round(Number(input.commissionRate ?? 0.1) * 100);
  const portal = siteUrl("/agency");
  return mail(
    input.to,
    `New booking under your code — ${input.bookingReference}`,
    [
      `Hi ${firstName(input.contactName)},`,
      "",
      `A new booking has been made using your code ${input.agencyCode}.`,
      `Reference: ${input.bookingReference}`,
      `Stay: ${input.apartmentName}`,
      `Dates: ${input.checkIn} → ${input.checkOut}`,
      `Booking value: ${money(input.bookingValue)}`,
      `Your commission (${pct}%): ${money(input.commissionAmount)}`,
      `Portal: ${portal}`,
    ],
    `<p>Hi ${escapeHtml(firstName(input.contactName))},</p>
     <p>Good news — a new booking used your code <strong>${escapeHtml(input.agencyCode)}</strong>.</p>
     <ul>
       <li><strong>Reference:</strong> ${escapeHtml(input.bookingReference)}</li>
       <li><strong>Stay:</strong> ${escapeHtml(input.apartmentName)}</li>
       <li><strong>Dates:</strong> ${escapeHtml(input.checkIn)} → ${escapeHtml(input.checkOut)}</li>
       <li><strong>Booking value:</strong> ${money(input.bookingValue)}</li>
       <li><strong>Your commission (${pct}%):</strong> ${money(input.commissionAmount)}</li>
     </ul>
     <p><a href="${portal}" style="color:#2D5A3D;font-weight:600;">View running total in portal</a></p>`,
  );
}

export async function sendAgencyCommissionStatementEmail(input: {
  to: string;
  contactName: string;
  agencyCode: string;
  periodLabel: string;
  bookings: number;
  totalValue: number;
  totalCommission: number;
  commissionRate?: number;
}) {
  const pct = Math.round(Number(input.commissionRate ?? 0.1) * 100);
  const portal = siteUrl("/agency");
  return mail(
    input.to,
    `Your Malfranza commission summary — ${input.periodLabel}`,
    [
      `Hi ${firstName(input.contactName)},`,
      "",
      `Commission summary for ${input.periodLabel}.`,
      `Code: ${input.agencyCode}`,
      `Bookings: ${input.bookings}`,
      `Total booking value: ${money(input.totalValue)}`,
      `Total commission (${pct}%): ${money(input.totalCommission)}`,
      `Status: DUE`,
      `Portal: ${portal}`,
    ],
    `<p>Hi ${escapeHtml(firstName(input.contactName))},</p>
     <p>Here's your commission summary for <strong>${escapeHtml(input.periodLabel)}</strong>.</p>
     <ul>
       <li><strong>Code:</strong> ${escapeHtml(input.agencyCode)}</li>
       <li><strong>Bookings:</strong> ${input.bookings}</li>
       <li><strong>Total value:</strong> ${money(input.totalValue)}</li>
       <li><strong>Total commission (${pct}%):</strong> ${money(input.totalCommission)}</li>
       <li><strong>Status:</strong> DUE</li>
     </ul>
     <p><a href="${portal}">Open portal for full breakdown</a></p>`,
  );
}

/* ========== GROUP 3 — Driver ========== */

export async function sendDriverAssignmentEmail(input: {
  to: string;
  driverName: string;
  bookingReference: string;
  serviceType: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupDate: string;
  pickupTime: string;
  customerName: string;
  customerPhone: string;
  vehicleLabel?: string;
  notes?: string;
  passengers?: number;
}) {
  const portal = siteUrl("/driver");
  return mail(
    input.to,
    `New trip assigned — ${input.pickupDate} ${input.pickupTime}`,
    [
      `Hi ${input.driverName},`,
      "",
      "You've been assigned a new trip.",
      `When: ${input.pickupDate} ${input.pickupTime}`,
      `Pickup: ${input.pickupLocation}`,
      `Drop-off: ${input.dropoffLocation}`,
      `Guest: ${input.customerName}, ${input.customerPhone}`,
      `Service: ${input.serviceType}`,
      input.vehicleLabel ? `Vehicle: ${input.vehicleLabel}` : "",
      input.passengers != null ? `Passengers: ${input.passengers}` : "",
      `Reference: ${input.bookingReference}`,
      `Portal: ${portal}`,
      `Office: ${PHONE}`,
    ].filter(Boolean),
    `<p>Hi ${escapeHtml(input.driverName)},</p>
     <p>You've been assigned a new trip. Please keep the site open on your phone for updates.</p>
     <ul>
       <li><strong>When:</strong> ${escapeHtml(input.pickupDate)} ${escapeHtml(input.pickupTime)}</li>
       <li><strong>Pickup:</strong> ${escapeHtml(input.pickupLocation)}</li>
       <li><strong>Drop-off:</strong> ${escapeHtml(input.dropoffLocation)}</li>
       <li><strong>Guest:</strong> ${escapeHtml(input.customerName)} · ${escapeHtml(input.customerPhone)}</li>
       <li><strong>Reference:</strong> ${escapeHtml(input.bookingReference)}</li>
     </ul>
     <p><a href="${portal}">Open driver portal</a> · Office ${escapeHtml(PHONE)}</p>`,
  );
}

export async function sendDriverTripUpdatedEmail(input: {
  to: string;
  driverName: string;
  summary: string;
  pickupDate: string;
  pickupTime: string;
  pickupLocation: string;
  dropoffLocation: string;
  customerName: string;
  customerPhone: string;
}) {
  return mail(
    input.to,
    `Trip updated — ${input.pickupDate} ${input.pickupTime}`,
    [
      `Hi ${input.driverName},`,
      "",
      "One of your assigned trips has changed.",
      `What changed: ${input.summary}`,
      `When: ${input.pickupDate} ${input.pickupTime}`,
      `Pickup: ${input.pickupLocation}`,
      `Drop-off: ${input.dropoffLocation}`,
      `Guest: ${input.customerName} · ${input.customerPhone}`,
    ],
    `<p>Hi ${escapeHtml(input.driverName)},</p>
     <p>One of your assigned trips has changed.</p>
     <p><strong>What changed:</strong> ${escapeHtml(input.summary)}</p>
     <ul>
       <li><strong>When:</strong> ${escapeHtml(input.pickupDate)} ${escapeHtml(input.pickupTime)}</li>
       <li><strong>Pickup:</strong> ${escapeHtml(input.pickupLocation)}</li>
       <li><strong>Drop-off:</strong> ${escapeHtml(input.dropoffLocation)}</li>
       <li><strong>Guest:</strong> ${escapeHtml(input.customerName)}</li>
     </ul>`,
  );
}

export async function sendDriverTripCancelledEmail(input: {
  to: string;
  driverName: string;
  pickupDate: string;
  pickupTime: string;
  pickupLocation: string;
  dropoffLocation: string;
}) {
  return mail(
    input.to,
    `Trip cancelled — ${input.pickupDate} ${input.pickupTime}`,
    [
      `Hi ${input.driverName},`,
      "",
      "A trip previously assigned to you has been cancelled.",
      `Cancelled: ${input.pickupDate} ${input.pickupTime}, ${input.pickupLocation} to ${input.dropoffLocation}`,
      "No action needed on your end.",
    ],
    `<p>Hi ${escapeHtml(input.driverName)},</p>
     <p>A trip previously assigned to you has been cancelled and removed from your schedule.</p>
     <p><strong>Cancelled trip:</strong> ${escapeHtml(input.pickupDate)} ${escapeHtml(input.pickupTime)}, ${escapeHtml(input.pickupLocation)} → ${escapeHtml(input.dropoffLocation)}</p>
     <p>No action is needed on your end.</p>`,
  );
}

export async function sendDriverTripReminderEmail(input: {
  to: string;
  driverName: string;
  pickupDate: string;
  pickupTime: string;
  pickupLocation: string;
  dropoffLocation: string;
  customerName: string;
  customerPhone: string;
}) {
  return mail(
    input.to,
    `Reminder: trip tomorrow — ${input.pickupDate} ${input.pickupTime}`,
    [
      `Hi ${input.driverName},`,
      "",
      "A reminder that you have a trip coming up.",
      `When: ${input.pickupDate} ${input.pickupTime}`,
      `Pickup: ${input.pickupLocation}`,
      `Drop-off: ${input.dropoffLocation}`,
      `Guest: ${input.customerName} · ${input.customerPhone}`,
    ],
    `<p>Hi ${escapeHtml(input.driverName)},</p>
     <p>A reminder that you have a trip coming up.</p>
     <ul>
       <li><strong>When:</strong> ${escapeHtml(input.pickupDate)} ${escapeHtml(input.pickupTime)}</li>
       <li><strong>Pickup:</strong> ${escapeHtml(input.pickupLocation)}</li>
       <li><strong>Drop-off:</strong> ${escapeHtml(input.dropoffLocation)}</li>
       <li><strong>Guest:</strong> ${escapeHtml(input.customerName)} · ${escapeHtml(input.customerPhone)}</li>
     </ul>
     <p>Please plan to arrive a few minutes early.</p>`,
  );
}

/* ========== GROUP 4 — Admin / Gregory ========== */

export async function sendAdminNewStayBookingEmail(input: {
  bookingReference: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  apartmentName: string;
  checkIn: string;
  checkOut: string;
  totalAmount: number;
  nights: number;
  agencyCode?: string | null;
  agencyName?: string | null;
}) {
  const to = env.ADMIN_NOTIFY_EMAIL;
  const source = input.agencyCode
    ? `Agency code: ${input.agencyCode}${input.agencyName ? ` (${input.agencyName})` : ""}`
    : "Direct website";
  return mail(
    to,
    `New booking — ${input.apartmentName}, ${input.checkIn}`,
    [
      "Hi Gregory,",
      "",
      "A new apartment booking has come in.",
      `Reference: ${input.bookingReference}`,
      `Apartment: ${input.apartmentName}`,
      `Check-in: ${input.checkIn} · Check-out: ${input.checkOut}`,
      `Guest: ${input.guestName}, ${input.guestEmail}${input.guestPhone ? ` · ${input.guestPhone}` : ""}`,
      `Source: ${source}`,
      `Total: ${money(input.totalAmount)}`,
      `Admin: ${siteUrl("/admin/bookings")}`,
    ],
    `<p>Hi Gregory,</p>
     <p>A new apartment booking has come in.</p>
     <ul>
       <li><strong>Reference:</strong> ${escapeHtml(input.bookingReference)}</li>
       <li><strong>Apartment:</strong> ${escapeHtml(input.apartmentName)}</li>
       <li><strong>Dates:</strong> ${escapeHtml(input.checkIn)} → ${escapeHtml(input.checkOut)} (${input.nights} nights)</li>
       <li><strong>Guest:</strong> ${escapeHtml(input.guestName)} · ${escapeHtml(input.guestEmail)}</li>
       <li><strong>Source:</strong> ${escapeHtml(source)}</li>
       <li><strong>Total:</strong> ${money(input.totalAmount)}</li>
     </ul>
     <p><a href="${siteUrl("/admin/bookings")}">Open admin bookings</a></p>`,
  );
}

export async function sendAdminNewTaxiBookingEmail(input: {
  bookingReference: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  serviceType: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupDate: string;
  pickupTime: string;
  estimatedFare: number;
  passengers?: number;
  driverName?: string | null;
  vehicleLabel?: string | null;
}) {
  const to = env.ADMIN_NOTIFY_EMAIL;
  const assigned = Boolean(input.driverName);
  const intro = assigned
    ? `A new ride is booked and assigned to ${input.driverName}.`
    : "A new ride booking has come in and needs a driver assigned.";
  return mail(
    to,
    `New ride booking — ${input.pickupDate} ${input.pickupTime}`,
    [
      "Hi Gregory,",
      "",
      intro,
      `Reference: ${input.bookingReference}`,
      `Service: ${input.serviceType}`,
      `When: ${input.pickupDate} ${input.pickupTime}`,
      `Pickup: ${input.pickupLocation}`,
      `Drop-off: ${input.dropoffLocation}`,
      `Passengers: ${input.passengers ?? "—"}`,
      `Vehicle: ${input.vehicleLabel || "To assign"}`,
      `Guest: ${input.customerName} · ${input.customerEmail}${input.customerPhone ? ` · ${input.customerPhone}` : ""}`,
      `Total: ${money(input.estimatedFare)}`,
      `Admin: ${siteUrl("/admin/taxi")}`,
    ],
    `<p>Hi Gregory,</p>
     <p>${escapeHtml(intro)}</p>
     <ul>
       <li><strong>Reference:</strong> ${escapeHtml(input.bookingReference)}</li>
       <li><strong>Service:</strong> ${escapeHtml(input.serviceType)}</li>
       <li><strong>When:</strong> ${escapeHtml(input.pickupDate)} ${escapeHtml(input.pickupTime)}</li>
       <li><strong>Pickup:</strong> ${escapeHtml(input.pickupLocation)}</li>
       <li><strong>Drop-off:</strong> ${escapeHtml(input.dropoffLocation)}</li>
       <li><strong>Passengers:</strong> ${input.passengers ?? "—"}</li>
       <li><strong>Vehicle:</strong> ${escapeHtml(input.vehicleLabel || "To assign")}</li>
       <li><strong>Guest:</strong> ${escapeHtml(input.customerName)} · ${escapeHtml(input.customerEmail)}${input.customerPhone ? ` · ${escapeHtml(input.customerPhone)}` : ""}</li>
       <li><strong>Total:</strong> ${money(input.estimatedFare)}</li>
     </ul>
     <p><a href="${siteUrl("/admin/taxi")}">Open taxi trips in admin</a></p>`,
  );
}

export async function sendAdminNewAgencySignupEmail(input: {
  agencyName: string;
  contactName: string;
  email: string;
  phone: string;
  agencyCode: string;
}) {
  const to = env.ADMIN_NOTIFY_EMAIL;
  return mail(
    to,
    `New travel agency signed up — ${input.agencyName}`,
    [
      "Hi Gregory,",
      "",
      "A new travel agency has signed up.",
      `Agency: ${input.agencyName}`,
      `Contact: ${input.contactName}, ${input.email}, ${input.phone}`,
      `Code: ${input.agencyCode}`,
      `Admin: ${siteUrl("/admin/agencies")}`,
    ],
    `<p>Hi Gregory,</p>
     <p>A new travel agency has signed up to the programme.</p>
     <ul>
       <li><strong>Agency:</strong> ${escapeHtml(input.agencyName)}</li>
       <li><strong>Contact:</strong> ${escapeHtml(input.contactName)} · ${escapeHtml(input.email)} · ${escapeHtml(input.phone)}</li>
       <li><strong>Code:</strong> ${escapeHtml(input.agencyCode)}</li>
     </ul>
     <p><a href="${siteUrl("/admin/agencies")}">Review in admin</a></p>`,
  );
}

export async function sendAdminBookingChangedEmail(input: {
  bookingReference: string;
  action: "cancelled" | "updated";
  summary: string;
  extra?: string;
  href?: string;
}) {
  const to = env.ADMIN_NOTIFY_EMAIL;
  const href = input.href || "/admin/bookings";
  return mail(
    to,
    `Booking ${input.action} — ${input.bookingReference}`,
    [
      "Hi Gregory,",
      "",
      `A booking has been ${input.action}.`,
      `Reference: ${input.bookingReference}`,
      `What changed: ${input.summary}`,
      input.extra || "",
      `Admin: ${siteUrl(href)}`,
    ].filter(Boolean),
    `<p>Hi Gregory,</p>
     <p>A booking has been <strong>${escapeHtml(input.action)}</strong>.</p>
     <ul>
       <li><strong>Reference:</strong> ${escapeHtml(input.bookingReference)}</li>
       <li><strong>What changed:</strong> ${escapeHtml(input.summary)}</li>
     </ul>
     ${input.extra ? `<p style="white-space:pre-wrap;">${escapeHtml(input.extra)}</p>` : ""}
     <p><a href="${siteUrl(href)}">View in admin</a></p>`,
  );
}

export async function sendAdminNewEnquiryEmail(input: {
  reference: string;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  dates?: string;
  message: string;
}) {
  const to = env.ADMIN_NOTIFY_EMAIL;
  return mail(
    to,
    `New inquiry from ${input.name}`,
    [
      "Hi Gregory,",
      "",
      "New website inquiry.",
      `From: ${input.name}`,
      `Contact: ${input.email}${input.phone ? ` · ${input.phone}` : ""}`,
      input.subject ? `Interest: ${input.subject}` : "",
      input.dates ? `Dates: ${input.dates}` : "",
      "",
      input.message,
      "",
      `Admin: ${siteUrl("/admin/enquiries")}`,
    ].filter(Boolean),
    `<p>Hi Gregory,</p>
     <p>You've received a new inquiry through the website.</p>
     <ul>
       <li><strong>From:</strong> ${escapeHtml(input.name)}</li>
       <li><strong>Contact:</strong> ${escapeHtml(input.email)}${input.phone ? ` · ${escapeHtml(input.phone)}` : ""}</li>
       ${input.subject ? `<li><strong>Interest:</strong> ${escapeHtml(input.subject)}</li>` : ""}
       ${input.dates ? `<li><strong>Dates:</strong> ${escapeHtml(input.dates)}</li>` : ""}
       <li><strong>Reference:</strong> ${escapeHtml(input.reference)}</li>
     </ul>
     <p style="white-space:pre-wrap;">${escapeHtml(input.message)}</p>
     <p><a href="${siteUrl("/admin/enquiries")}">Open enquiries</a></p>`,
  );
}

export async function sendAdminPaymentReceivedEmail(input: {
  bookingReference: string;
  amount: number;
  guestName: string;
  method?: string;
}) {
  const to = env.ADMIN_NOTIFY_EMAIL;
  return mail(
    to,
    `Payment received — ${input.bookingReference}`,
    [
      "Hi Gregory,",
      "",
      "A payment has been received.",
      `Reference: ${input.bookingReference}`,
      `Amount: ${money(input.amount)}`,
      `Method: ${input.method || "Card / demo"}`,
      `Guest: ${input.guestName}`,
      `Admin: ${siteUrl("/admin/bookings")}`,
    ],
    `<p>Hi Gregory,</p>
     <p>A payment has been received.</p>
     <ul>
       <li><strong>Reference:</strong> ${escapeHtml(input.bookingReference)}</li>
       <li><strong>Amount:</strong> ${money(input.amount)}</li>
       <li><strong>Method:</strong> ${escapeHtml(input.method || "Card / demo")}</li>
       <li><strong>Guest:</strong> ${escapeHtml(input.guestName)}</li>
     </ul>
     <p><a href="${siteUrl("/admin/bookings")}">Open dashboard</a></p>`,
  );
}

export async function sendGuestRefundStatusEmail(input: {
  to: string;
  name: string;
  bookingReference: string;
  kind: "stay" | "taxi";
  status: "reviewing" | "processed" | "rejected";
  amount: number;
  adminNote?: string;
  payoutSummary?: string;
}) {
  const greeter = firstName(input.name);
  const label = input.kind === "stay" ? "stay" : "taxi";
  const subject =
    input.status === "processed"
      ? `Your Malfranza refund was processed — ${input.bookingReference}`
      : input.status === "rejected"
        ? `Update on your Malfranza refund — ${input.bookingReference}`
        : `Your Malfranza refund is in review — ${input.bookingReference}`;

  const statusLine =
    input.status === "processed"
      ? `We've marked your ${label} refund of ${money(input.amount)} as processed.`
      : input.status === "rejected"
        ? `We're unable to approve your ${label} refund request for ${input.bookingReference}.`
        : `Your ${label} refund request for ${money(input.amount)} is now in review.`;

  return mail(
    input.to,
    subject,
    [
      `Hi ${greeter},`,
      "",
      statusLine,
      `Booking reference: ${input.bookingReference}`,
      input.payoutSummary ? `Payout details on file: ${input.payoutSummary}` : "",
      input.adminNote ? `Note from Malfranza: ${input.adminNote}` : "",
      input.status === "processed"
        ? "Allow a little time for the funds to appear, depending on your payout method."
        : "",
      `Questions? Call ${PHONE}.`,
    ].filter(Boolean),
    `<p>Hi ${escapeHtml(greeter)},</p>
     <p>${escapeHtml(statusLine)}</p>
     <ul>
       <li><strong>Booking reference:</strong> ${escapeHtml(input.bookingReference)}</li>
       <li><strong>Amount:</strong> ${money(input.amount)}</li>
       ${input.payoutSummary ? `<li><strong>Payout details:</strong> ${escapeHtml(input.payoutSummary)}</li>` : ""}
       ${input.adminNote ? `<li><strong>Note:</strong> ${escapeHtml(input.adminNote)}</li>` : ""}
     </ul>
     ${
       input.status === "processed"
         ? "<p style=\"font-size:13px;color:#4a5a5a;\">Allow a little time for the funds to appear, depending on your payout method.</p>"
         : ""
     }
     <p>Questions? Call ${escapeHtml(PHONE)}.</p>`,
  );
}
