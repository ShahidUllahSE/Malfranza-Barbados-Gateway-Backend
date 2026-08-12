import type { DriverRecord } from "../drivers/driver.model.js";
import { sendDriverAssignmentEmail } from "../notifications/email.service.js";

type AssignmentNotifyInput = {
  driver: {
    name: string;
    email: string;
    phone: string;
  };
  booking: {
    bookingReference: string;
    serviceType: string;
    pickupLocation: string;
    dropoffLocation: string;
    pickupDate: Date | string;
    pickupTime: string;
    customerName: string;
    customerPhone: string;
    passengers?: number;
    vehicleLabel?: string;
  };
};

/**
 * Driver assignment alert — email + console (for local demos without SMTP).
 */
export async function notifyDriverOfAssignment(input: AssignmentNotifyInput): Promise<void> {
  const date =
    typeof input.booking.pickupDate === "string"
      ? input.booking.pickupDate.slice(0, 10)
      : input.booking.pickupDate.toISOString().slice(0, 10);

  const lines = [
    "",
    "════════════════════════════════════════",
    "  NEW RIDE ASSIGNED — DRIVER ALERT",
    "════════════════════════════════════════",
    `Driver:  ${input.driver.name} · ${input.driver.phone}`,
    `Email:   ${input.driver.email}`,
    `Ref:     ${input.booking.bookingReference}`,
    `Service: ${input.booking.serviceType}`,
    `When:    ${date} at ${input.booking.pickupTime}`,
    `Pickup:  ${input.booking.pickupLocation}`,
    `Dropoff: ${input.booking.dropoffLocation}`,
    `Guest:   ${input.booking.customerName} · ${input.booking.customerPhone}`,
    input.booking.passengers != null ? `Party:   ${input.booking.passengers}` : "",
    input.booking.vehicleLabel ? `Vehicle: ${input.booking.vehicleLabel}` : "",
    "Open driver portal: /driver",
    "════════════════════════════════════════",
    "",
  ];

  console.info(lines.join("\n"));

  await sendDriverAssignmentEmail({
    to: input.driver.email,
    driverName: input.driver.name,
    bookingReference: input.booking.bookingReference,
    serviceType: input.booking.serviceType,
    pickupLocation: input.booking.pickupLocation,
    dropoffLocation: input.booking.dropoffLocation,
    pickupDate: date,
    pickupTime: input.booking.pickupTime,
    customerName: input.booking.customerName,
    customerPhone: input.booking.customerPhone,
    passengers: input.booking.passengers,
    vehicleLabel: input.booking.vehicleLabel,
  }).catch((error) => {
    console.error("[email] Failed to email driver assignment", error);
  });
}

export function driverNotifyPayloadFromDocs(
  driver: Pick<DriverRecord, "name" | "email" | "phone"> & { _id?: unknown },
  booking: {
    bookingReference: string;
    serviceType: string;
    pickupLocation: string;
    dropoffLocation: string;
    pickupDate: Date | string;
    pickupTime: string;
    customerName: string;
    customerPhone: string;
  },
) {
  return {
    driver: {
      name: driver.name,
      email: driver.email,
      phone: driver.phone,
    },
    booking,
  };
}
