import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";

export type RoutePoint = {
  address?: string;
  lat?: number;
  lng?: number;
};

export type RouteDistanceResult = {
  distanceKm: number;
  durationMinutes: number | null;
  source: "routes";
};

function hasCoords(point: RoutePoint) {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

function waypoint(point: RoutePoint) {
  if (hasCoords(point)) {
    return {
      location: {
        latLng: {
          latitude: Number(point.lat),
          longitude: Number(point.lng),
        },
      },
    };
  }
  const address = point.address?.trim();
  if (!address) {
    throw new AppError(400, "Enter a pickup and drop-off location");
  }
  return { address };
}

/**
 * Driving distance via Google Routes API (computeRoutes).
 * Uses GOOGLE_MAPS_API_KEY from backend .env.
 */
export async function fetchDrivingDistance(
  origin: RoutePoint,
  destination: RoutePoint,
): Promise<RouteDistanceResult> {
  const apiKey = env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError(
      503,
      "Distance pricing is not configured. Set GOOGLE_MAPS_API_KEY on the server.",
    );
  }

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: waypoint(origin),
      destination: waypoint(destination),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      languageCode: "en-US",
      units: "METRIC",
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; status?: string };
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
    }>;
  } | null;

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      `Google Routes request failed (${response.status})`;
    console.error("[routes]", message, payload?.error);
    throw new AppError(
      502,
      /REQUEST_DENIED|API_KEY|PERMISSION/i.test(message)
        ? "Google Routes is not enabled for this API key. Enable Routes API and try again."
        : "Could not calculate the route distance. Check the pickup and drop-off addresses.",
    );
  }

  const route = payload?.routes?.[0];
  const meters = Number(route?.distanceMeters ?? 0);
  if (!route || !Number.isFinite(meters) || meters <= 0) {
    throw new AppError(400, "No driving route found between those locations");
  }

  const durationRaw = route.duration ?? "";
  const durationSeconds = durationRaw.endsWith("s")
    ? Number(durationRaw.slice(0, -1))
    : Number.NaN;

  return {
    distanceKm: Math.round((meters / 1000) * 10) / 10,
    durationMinutes: Number.isFinite(durationSeconds)
      ? Math.max(1, Math.round(durationSeconds / 60))
      : null,
    source: "routes",
  };
}
