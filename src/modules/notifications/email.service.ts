import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

function smtpConfigured() {
  return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

function createTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  if (!smtpConfigured()) {
    console.info("[email] SMTP not configured — skipping send", {
      to: options.to,
      subject: options.subject,
      preview: options.text.slice(0, 280),
    });
    return { sent: false as const, reason: "smtp_not_configured" as const };
  }

  const from = env.SMTP_FROM || env.SMTP_USER!;
  const transport = createTransport();
  await transport.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
  return { sent: true as const };
}

export async function sendSignupOtpEmail(input: {
  to: string;
  name: string;
  code: string;
  expiresMinutes: number;
}) {
  const greeting = input.name.trim() || "there";
  const subject = "Your Malfranza verification code";

  const text = [
    `Hi ${greeting},`,
    "",
    "Use this code to complete your Malfranza account signup:",
    "",
    input.code,
    "",
    `This code expires in ${input.expiresMinutes} minutes.`,
    "If you did not request this, you can ignore this email.",
    "",
    "— Malfranza Apartments & Taxi",
  ].join("\n");

  const html = `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1F2A2A;">
      <p>Hi ${escapeHtml(greeting)},</p>
      <p>Use this code to complete your Malfranza account signup:</p>
      <p style="font-size:28px;letter-spacing:0.2em;font-weight:700;margin:20px 0;">
        ${escapeHtml(input.code)}
      </p>
      <p style="color:#4a5a5a;font-size:14px;">
        This code expires in ${input.expiresMinutes} minutes.
        If you did not request this, you can ignore this email.
      </p>
      <p>— Malfranza Apartments &amp; Taxi</p>
    </div>
  `;

  return sendMail({ to: input.to, subject, text, html });
}

export async function sendGuestCredentialsEmail(input: {
  to: string;
  name: string;
  password: string;
  bookingReference?: string;
}) {
  const loginUrl = `${env.FRONTEND_URL.replace(/\/$/, "")}/?auth=signin`;
  const greeting = input.name.trim() || "Guest";
  const subject = input.bookingReference
    ? `Your Malfranza account & booking ${input.bookingReference}`
    : "Your Malfranza guest account";

  const text = [
    `Hi ${greeting},`,
    "",
    "Thanks for booking with Malfranza Apartments & Taxi.",
    "We created an account for you so you can view and manage your bookings.",
    "",
    `Email: ${input.to}`,
    `Temporary password: ${input.password}`,
    "",
    `Sign in here: ${loginUrl}`,
    "We recommend changing your password after you sign in.",
    "",
    input.bookingReference ? `Booking reference: ${input.bookingReference}` : "",
    "",
    "— Malfranza Apartments & Taxi",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const html = `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1F2A2A;">
      <p>Hi ${escapeHtml(greeting)},</p>
      <p>Thanks for booking with <strong>Malfranza Apartments &amp; Taxi</strong>.</p>
      <p>We created an account for you so you can view and manage your bookings.</p>
      <p>
        <strong>Email:</strong> ${escapeHtml(input.to)}<br />
        <strong>Temporary password:</strong> <code>${escapeHtml(input.password)}</code>
      </p>
      <p><a href="${loginUrl}">Sign in to your account</a></p>
      <p style="color:#4a5a5a;font-size:14px;">We recommend changing your password after you sign in.</p>
      ${
        input.bookingReference
          ? `<p><strong>Booking reference:</strong> ${escapeHtml(input.bookingReference)}</p>`
          : ""
      }
      <p>— Malfranza Apartments &amp; Taxi</p>
    </div>
  `;

  return sendMail({ to: input.to, subject, text, html });
}

export async function sendBookingConfirmationEmail(input: {
  to: string;
  name: string;
  bookingReference: string;
  checkIn: string;
  checkOut: string;
  apartmentName: string;
  totalAmount: number;
}) {
  const portalUrl = `${env.FRONTEND_URL.replace(/\/$/, "")}/my-bookings/${encodeURIComponent(input.bookingReference)}`;
  const greeting = input.name.trim() || "Guest";
  const subject = `Booking confirmed — ${input.bookingReference}`;

  const text = [
    `Hi ${greeting},`,
    "",
    "Your Malfranza stay is confirmed.",
    "",
    `Reference: ${input.bookingReference}`,
    `Apartment: ${input.apartmentName}`,
    `Dates: ${input.checkIn} → ${input.checkOut}`,
    `Total: $${input.totalAmount.toFixed(2)}`,
    "",
    `View booking: ${portalUrl}`,
    "",
    "— Malfranza Apartments & Taxi",
  ].join("\n");

  const html = `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1F2A2A;">
      <p>Hi ${escapeHtml(greeting)},</p>
      <p>Your Malfranza stay is confirmed.</p>
      <ul>
        <li><strong>Reference:</strong> ${escapeHtml(input.bookingReference)}</li>
        <li><strong>Apartment:</strong> ${escapeHtml(input.apartmentName)}</li>
        <li><strong>Dates:</strong> ${escapeHtml(input.checkIn)} → ${escapeHtml(input.checkOut)}</li>
        <li><strong>Total:</strong> $${input.totalAmount.toFixed(2)}</li>
      </ul>
      <p><a href="${portalUrl}">View your booking</a></p>
      <p>— Malfranza Apartments &amp; Taxi</p>
    </div>
  `;

  return sendMail({ to: input.to, subject, text, html });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
