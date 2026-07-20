import { randomBytes } from "node:crypto";
import type { QueryFilter } from "mongoose";
import { AppError } from "../../middleware/error-handler.js";
import { Enquiry, type EnquiryRecord } from "./enquiry.model.js";
import type {
  AdminEnquiryListQuery,
  CreateEnquiryInput,
  UpdateEnquiryInput,
} from "./enquiry.validation.js";

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function nextUtcDate(value: string): Date {
  const date = toUtcDate(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function generateReference(): string {
  return `MFZ-ENQ-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function createEnquiry(input: CreateEnquiryInput, userId?: string) {
  return Enquiry.create({
    ...input,
    userId,
    email: input.email.toLowerCase(),
    preferredDate: input.preferredDate ? toUtcDate(input.preferredDate) : undefined,
    reference: generateReference(),
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listEnquiries(input: AdminEnquiryListQuery) {
  const filter: QueryFilter<EnquiryRecord> = {};
  if (input.status) filter.status = input.status;
  if (input.interestedIn) filter.interestedIn = input.interestedIn;
  if (input.fromDate || input.toDate) {
    filter.createdAt = {};
    if (input.fromDate) filter.createdAt.$gte = toUtcDate(input.fromDate);
    if (input.toDate) filter.createdAt.$lt = nextUtcDate(input.toDate);
  }

  if (input.search) {
    const search = new RegExp(escapeRegExp(input.search), "i");
    filter.$or = [
      { reference: search },
      { name: search },
      { email: search },
      { message: search },
    ];
  }

  const skip = (input.page - 1) * input.limit;
  const [items, total] = await Promise.all([
    Enquiry.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(input.limit)
      .populate("userId", "name email phone")
      .lean(),
    Enquiry.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.ceil(total / input.limit),
    },
  };
}

export async function getEnquiryForAdmin(id: string) {
  const enquiry = await Enquiry.findById(id).lean();
  if (!enquiry) throw new AppError(404, "Enquiry not found");
  return enquiry;
}

const STATUS_TRANSITIONS = {
  new: ["responded", "closed"],
  responded: ["closed"],
  closed: [],
} as const;

export async function updateEnquiry(id: string, input: UpdateEnquiryInput) {
  const enquiry = await Enquiry.findById(id);
  if (!enquiry) throw new AppError(404, "Enquiry not found");

  if (input.status && input.status !== enquiry.status) {
    const allowed = STATUS_TRANSITIONS[enquiry.status] as readonly string[];
    if (!allowed.includes(input.status)) {
      throw new AppError(409, `Cannot change enquiry from ${enquiry.status} to ${input.status}`);
    }
    enquiry.status = input.status;
    if (input.status === "responded") enquiry.respondedAt = new Date();
  }

  if (input.adminNotes !== undefined) enquiry.adminNotes = input.adminNotes;
  await enquiry.save();
  return enquiry;
}

export async function closeEnquiry(id: string) {
  return updateEnquiry(id, { status: "closed" });
}
