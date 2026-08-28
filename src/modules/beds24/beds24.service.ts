import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";
import {
  extractBeds24DataArray,
  filterBookingsResponseByChannel,
  isBeds24ChannelId,
  type Beds24ChannelId,
} from "./beds24-channels.js";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

function ensureConfigured() {
  if (!env.BEDS24_REFRESH_TOKEN && !env.BEDS24_ACCESS_TOKEN) {
    throw new AppError(
      503,
      "Beds24 is not configured. Set BEDS24_REFRESH_TOKEN (or BEDS24_ACCESS_TOKEN) in the backend .env",
    );
  }
}

async function fetchAccessTokenFromRefresh(): Promise<string> {
  if (!env.BEDS24_REFRESH_TOKEN) {
    throw new AppError(503, "BEDS24_REFRESH_TOKEN is missing");
  }

  const response = await fetch(`${env.BEDS24_API_BASE}/authentication/token`, {
    method: "GET",
    headers: {
      accept: "application/json",
      refreshToken: env.BEDS24_REFRESH_TOKEN,
    },
  });

  const body = (await response.json().catch(() => null)) as {
    token?: string;
    expiresIn?: number;
    error?: string;
  } | null;

  if (!response.ok || !body?.token) {
    throw new AppError(
      502,
      `Beds24 token refresh failed: ${body?.error ?? response.statusText}`,
    );
  }

  const expiresInMs = Math.max(60, Number(body.expiresIn ?? 86400) - 120) * 1000;
  tokenCache = {
    accessToken: body.token,
    expiresAt: Date.now() + expiresInMs,
  };
  return body.token;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  ensureConfigured();

  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.accessToken;
  }

  if (env.BEDS24_REFRESH_TOKEN) {
    return fetchAccessTokenFromRefresh();
  }

  // Fallback for short demos with only a one-shot access token.
  return env.BEDS24_ACCESS_TOKEN!;
}

async function beds24Request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options?: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  },
): Promise<T> {
  const params = new URLSearchParams();
  if (options?.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined || value === null || value === "") continue;
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  const url = `${env.BEDS24_API_BASE}${path}${qs ? `?${qs}` : ""}`;

  const requestOnce = async (forceRefresh: boolean) => {
    const token = await getAccessToken(forceRefresh);
    return fetch(url, {
      method,
      headers: {
        accept: "application/json",
        token,
        ...(options?.body ? { "content-type": "application/json" } : {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
  };

  let response = await requestOnce(false);
  if (response.status === 401 && env.BEDS24_REFRESH_TOKEN) {
    response = await requestOnce(true);
  }

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new AppError(502, `Beds24 returned non-JSON (${response.status})`);
  }

  if (!response.ok) {
    const err = (json as { error?: string } | null)?.error ?? response.statusText;
    throw new AppError(response.status === 401 ? 401 : 502, `Beds24 error: ${err}`);
  }

  return json as T;
}

async function beds24Get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
  return beds24Request<T>("GET", path, { query });
}

type Beds24PostResult = {
  success: boolean;
  new?: { id: number; status?: string };
  modified?: { id: number; status?: string };
  error?: string;
  errors?: unknown;
};

/** Creates a booking (no `id`) or updates one (with `id`) — Beds24's POST /bookings does both. */
export async function upsertBeds24Bookings(
  items: Array<Record<string, unknown>>,
): Promise<Beds24PostResult[]> {
  return beds24Request<Beds24PostResult[]>("POST", "/bookings", { body: items });
}

export async function listBeds24Properties() {
  return beds24Get<unknown>("/properties", { includeAllRooms: true });
}

export async function listBeds24Bookings(channel?: string) {
  const raw = await beds24Get<unknown>("/bookings");
  if (!channel || !isBeds24ChannelId(channel)) {
    return raw;
  }
  return filterBookingsResponseByChannel(raw, channel);
}

export function beds24Status() {
  return {
    configured: Boolean(env.BEDS24_REFRESH_TOKEN || env.BEDS24_ACCESS_TOKEN),
    hasRefreshToken: Boolean(env.BEDS24_REFRESH_TOKEN),
    hasAccessToken: Boolean(env.BEDS24_ACCESS_TOKEN),
    apiBase: env.BEDS24_API_BASE,
  };
}

export async function probeBeds24Health() {
  const status = beds24Status();

  if (!status.configured) {
    return {
      ...status,
      apiOk: false,
      propertyCount: 0,
      bookingCount: 0,
      message: "Set BEDS24_REFRESH_TOKEN in Backend/.env, then restart the backend.",
    };
  }

  try {
    const [propertiesPayload, bookingsPayload] = await Promise.all([
      listBeds24Properties(),
      listBeds24Bookings(),
    ]);
    const propertyCount = extractBeds24DataArray(propertiesPayload).length;
    const bookingCount = extractBeds24DataArray(bookingsPayload).length;

    return {
      ...status,
      apiOk: true,
      propertyCount,
      bookingCount,
      message:
        propertyCount === 0
          ? "API connected — add properties in Beds24 (manual or OTA import)."
          : "Beds24 API is connected and returning data.",
    };
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Beds24 health check failed";
    return {
      ...status,
      apiOk: false,
      propertyCount: 0,
      bookingCount: 0,
      error: message,
      message,
    };
  }
}

export type { Beds24ChannelId };
