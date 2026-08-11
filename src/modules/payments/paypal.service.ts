import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";

type PayPalTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type PayPalOrder = {
  id?: string;
  status?: string;
  purchase_units?: Array<{
    amount?: { value?: string; currency_code?: string };
    payments?: {
      captures?: Array<{ id?: string; status?: string }>;
    };
  }>;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function assertPayPalConfigured() {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new AppError(
      503,
      "PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in backend .env",
    );
  }
}

function apiBase() {
  return env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken(): Promise<string> {
  assertPayPalConfigured();
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.value;
  }

  const auth = Buffer.from(
    `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");

  const response = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const payload = (await response.json().catch(() => ({}))) as PayPalTokenResponse & {
    error_description?: string;
    error?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new AppError(
      502,
      payload.error_description ||
        payload.error ||
        "PayPal authentication failed — check Client ID and Secret (Sandbox)",
    );
  }

  cachedToken = {
    value: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 300) * 1000,
  };
  return payload.access_token;
}

export async function createPayPalOrder(input: {
  amount: number;
  currency?: string;
  description?: string;
}): Promise<{ orderId: string; status: string }> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0.5) {
    throw new AppError(400, "Amount must be at least $0.50");
  }

  const token = await getAccessToken();
  const currency = (input.currency || "USD").toUpperCase();
  const value = amount.toFixed(2);

  const response = await fetch(`${apiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value,
          },
          description: (input.description || "Malfranza booking").slice(0, 120),
        },
      ],
      application_context: {
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        brand_name: "Malfranza Apartments & Taxi",
        landing_page: "LOGIN",
      },
    }),
  });

  const order = (await response.json().catch(() => ({}))) as PayPalOrder & {
    message?: string;
    details?: Array<{ description?: string }>;
  };

  if (!response.ok || !order.id) {
    const detail = order.details?.[0]?.description || order.message;
    throw new AppError(502, detail || "Could not create PayPal order");
  }

  return { orderId: order.id, status: order.status || "CREATED" };
}

export async function capturePayPalOrder(orderId: string): Promise<{
  orderId: string;
  status: string;
  captureId: string;
  amount: number;
  currency: string;
}> {
  if (!orderId?.trim()) {
    throw new AppError(400, "PayPal order ID is required");
  }

  const token = await getAccessToken();
  const response = await fetch(
    `${apiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  const order = (await response.json().catch(() => ({}))) as PayPalOrder & {
    message?: string;
    details?: Array<{ description?: string; issue?: string }>;
  };

  if (!response.ok) {
    const detail =
      order.details?.[0]?.description ||
      order.details?.[0]?.issue ||
      order.message;
    throw new AppError(502, detail || "PayPal capture failed");
  }

  const status = order.status || "";
  if (status !== "COMPLETED") {
    throw new AppError(402, `Payment not completed (status: ${status || "unknown"})`);
  }

  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0] as
    | {
        id?: string;
        status?: string;
        amount?: { value?: string; currency_code?: string };
      }
    | undefined;
  const captureId = capture?.id || order.id || orderId;
  const captureAmount = capture?.amount?.value ?? unit?.amount?.value;

  return {
    orderId: order.id || orderId,
    status,
    captureId: String(captureId),
    amount: Number(captureAmount || 0),
    currency: capture?.amount?.currency_code || unit?.amount?.currency_code || "USD",
  };
}

export function getPayPalPublicConfig() {
  return {
    configured: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
    mode: env.PAYPAL_MODE,
    clientId: env.PAYPAL_CLIENT_ID || null,
  };
}
