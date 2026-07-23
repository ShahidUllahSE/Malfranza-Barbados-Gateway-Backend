import type { QueryFilter } from "mongoose";
import { AppError } from "../../middleware/error-handler.js";
import { Apartment, type ApartmentRecord } from "./apartment.model.js";
import type {
  AdminApartmentQuery,
  CreateApartmentInput,
  PublicApartmentQuery,
  UpdateApartmentInput,
} from "./apartment.validation.js";

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listPublicApartments(input: PublicApartmentQuery) {
  const filter: QueryFilter<ApartmentRecord> = { isActive: true };
  if (input.type) filter.type = input.type;
  if (input.guests) filter.maxGuests = { $gte: input.guests };

  let sort: Record<string, 1 | -1> = { pricePerNight: 1 };
  if (input.sort === "price-desc") sort = { pricePerNight: -1 };
  if (input.sort === "newest") sort = { createdAt: -1 };

  return Apartment.find(filter).sort(sort).lean();
}

export async function getPublicApartment(slug: string) {
  const apartment = await Apartment.findOne({ slug, isActive: true }).lean();
  if (!apartment) throw new AppError(404, "Apartment not found");
  return apartment;
}

export async function listAdminApartments(input: AdminApartmentQuery) {
  const filter: QueryFilter<ApartmentRecord> = {};
  if (input.isActive !== undefined) filter.isActive = input.isActive;

  if (input.search) {
    const search = new RegExp(escapeRegExp(input.search), "i");
    filter.$or = [{ name: search }, { subtitle: search }, { slug: search }];
  }

  const skip = (input.page - 1) * input.limit;
  const [items, total] = await Promise.all([
    Apartment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(input.limit).lean(),
    Apartment.countDocuments(filter),
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

export async function getAdminApartment(id: string) {
  const apartment = await Apartment.findById(id).lean();
  if (!apartment) throw new AppError(404, "Apartment not found");
  return apartment;
}

export async function createApartment(input: CreateApartmentInput) {
  try {
    return await Apartment.create(input);
  } catch (error: unknown) {
    if (isDuplicateKey(error)) throw new AppError(409, "An apartment with this slug already exists");
    throw error;
  }
}

export async function updateApartment(id: string, input: UpdateApartmentInput) {
  try {
    const apartment = await Apartment.findByIdAndUpdate(id, input, {
      new: true,
      runValidators: true,
    });
    if (!apartment) throw new AppError(404, "Apartment not found");
    return apartment;
  } catch (error: unknown) {
    if (isDuplicateKey(error)) throw new AppError(409, "An apartment with this slug already exists");
    throw error;
  }
}

export async function deactivateApartment(id: string) {
  const apartment = await Apartment.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true, runValidators: true },
  );
  if (!apartment) throw new AppError(404, "Apartment not found");
  return apartment;
}

export async function deleteApartment(id: string) {
  const apartment = await Apartment.findById(id);
  if (!apartment) throw new AppError(404, "Apartment not found");

  // Import Booking lazily to avoid circular imports at module load.
  const { Booking } = await import("../bookings/booking.model.js");
  const activeBooking = await Booking.exists({
    apartmentId: apartment._id,
    status: { $in: ["pending", "confirmed", "checked_in"] },
  });
  if (activeBooking) {
    throw new AppError(
      409,
      "Cannot delete an apartment with active bookings. Deactivate it instead, or cancel those bookings first.",
    );
  }

  await Apartment.findByIdAndDelete(id);
  return apartment;
}
