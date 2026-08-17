import { AppError } from "../../middleware/error-handler.js";

/** Temporary single test coupon — replace with a full coupon system later. */
export const TEST_COUPON_CODE = "MFZTEST99";
export const TEST_COUPON_PERCENT = 99.9;
const PAYPAL_MIN_USD = 0.5;

function money(value: number) {
  return Math.round(value * 100) / 100;
}

export type CouponApplication = {
  originalAmount: number;
  amount: number;
  discountPercent: number;
  couponApplied: boolean;
  code: string | null;
};

export function applyCheckoutCoupon(
  amount: number,
  couponCode?: string | null,
): CouponApplication {
  const originalAmount = money(Number(amount) || 0);
  if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
    throw new AppError(400, "Amount must be greater than zero");
  }

  const code = couponCode?.trim().toUpperCase() || "";
  if (!code) {
    return {
      originalAmount,
      amount: originalAmount,
      discountPercent: 0,
      couponApplied: false,
      code: null,
    };
  }

  if (code !== TEST_COUPON_CODE) {
    throw new AppError(400, "Invalid coupon code");
  }

  const afterDiscount = money(originalAmount * (1 - TEST_COUPON_PERCENT / 100));
  // PayPal requires at least $0.50
  const charged = Math.max(PAYPAL_MIN_USD, afterDiscount);

  return {
    originalAmount,
    amount: charged,
    discountPercent: TEST_COUPON_PERCENT,
    couponApplied: true,
    code: TEST_COUPON_CODE,
  };
}
