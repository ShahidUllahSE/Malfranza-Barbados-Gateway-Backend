import type { DriverRecord } from "../drivers/driver.model.js";

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
  };
};

/**
 * Demo-friendly driver alert. Logs a clear assignment message.
 * Swap this for SMS/WhatsApp/email when those providers are configured.
 */
export function notifyDriverOfAssignment(input: AssignmentNotifyInput): void {
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
    "Open driver portal: /driver",
    "════════════════════════════════════════",
    "",
  ];

  console.info(lines.join("\n"));
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
