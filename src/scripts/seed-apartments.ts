import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { catalogFromRate } from "../modules/apartments/pricing.js";
import { Apartment } from "../modules/apartments/apartment.model.js";

/**
 * Master Room Schedule (names fixed; photos added later).
 *
 * Room 1 · Tropical Escape — 1-BR
 * Room 2 · Island Breeze — 1-BR
 * Room 3 · Palm Retreat — 1-BR
 * Room 4 · Golden Serenity — 2-BR
 * Room A & B · Sunset Suite — 2-BR (combined)
 */

const SHARED_AMENITIES = [
  "Air Conditioning",
  "Smart TV",
  "Fridge",
  "Microwave",
  "Kettle",
  "Kitchen",
  "Coffee Machine",
  "Toaster",
  "Iron",
  "Fire Extinguisher",
  "High Speed Starlink Internet",
] as const;

/** 1-BR rooms: washer yes, dryer no */
const AMENITIES_1BR = [...SHARED_AMENITIES, "Washing Machine"] as const;

/** 2-BR rooms: no washer / dryer */
const AMENITIES_2BR = [...SHARED_AMENITIES] as const;

const apartments = [
  {
    name: "Tropical Escape",
    slug: "apartment-1",
    subtitle: "Room 1",
    description:
      "Tropical Escape — one-bedroom self-catering apartment at Malfranza, Oistins. Private kitchen, smart TV, AC, and high-speed Starlink Wi-Fi.",
    type: "one-bedroom" as const,
    pricePerNight: catalogFromRate("one-bedroom"),
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqM: 55,
    amenities: [...AMENITIES_1BR],
    isActive: true,
    unitsExclusive: false,
    units: [] as Array<Record<string, unknown>>,
  },
  {
    name: "Island Breeze",
    slug: "apartment-2",
    subtitle: "Room 2",
    description:
      "Island Breeze — one-bedroom self-catering apartment at Malfranza, Oistins. Comfortable stay with full kitchen essentials and Starlink internet.",
    type: "one-bedroom" as const,
    pricePerNight: catalogFromRate("one-bedroom"),
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqM: 54,
    amenities: [...AMENITIES_1BR],
    isActive: true,
    unitsExclusive: false,
    units: [],
  },
  {
    name: "Palm Retreat",
    slug: "apartment-3",
    subtitle: "Room 3",
    description:
      "Palm Retreat — one-bedroom self-catering apartment at Malfranza, Oistins. Ideal island base with AC, smart TV, and a private kitchen.",
    type: "one-bedroom" as const,
    pricePerNight: catalogFromRate("one-bedroom"),
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqM: 52,
    amenities: [...AMENITIES_1BR],
    isActive: true,
    unitsExclusive: false,
    units: [],
  },
  {
    name: "Golden Serenity",
    slug: "apartment-4",
    subtitle: "Room 4",
    description:
      "Golden Serenity — two-bedroom apartment at Malfranza, Oistins. Spacious stay for families or friends, with full kitchen and high-speed Starlink.",
    type: "two-bedroom" as const,
    pricePerNight: catalogFromRate("two-bedroom"),
    maxGuests: 4,
    bedrooms: 2,
    bathrooms: 2,
    sizeSqM: 90,
    amenities: [...AMENITIES_2BR],
    isActive: true,
    unitsExclusive: false,
    units: [],
  },
  {
    name: "Sunset Suite",
    slug: "apartment-a-and-b",
    subtitle: "Room A & B",
    description:
      "Sunset Suite — two-bedroom residence (Room A & B combined) at Malfranza, Oistins. Bright space for groups, with full kitchen and Starlink internet.",
    type: "two-bedroom" as const,
    pricePerNight: catalogFromRate("two-bedroom"),
    maxGuests: 4,
    bedrooms: 2,
    bathrooms: 2,
    sizeSqM: 95,
    amenities: [...AMENITIES_2BR],
    isActive: true,
    unitsExclusive: false,
    units: [],
  },
];

const KEEP_SLUGS = new Set(apartments.map((a) => a.slug));

async function seedApartments(): Promise<void> {
  await connectDatabase();

  const deact = await Apartment.updateMany(
    { slug: { $nin: [...KEEP_SLUGS] } },
    { $set: { isActive: false } },
  );

  for (const apartment of apartments) {
    await Apartment.updateOne(
      { slug: apartment.slug },
      {
        $set: {
          name: apartment.name,
          subtitle: apartment.subtitle,
          description: apartment.description,
          type: apartment.type,
          pricePerNight: apartment.pricePerNight,
          maxGuests: apartment.maxGuests,
          bedrooms: apartment.bedrooms,
          bathrooms: apartment.bathrooms,
          sizeSqM: apartment.sizeSqM,
          amenities: [...apartment.amenities],
          isActive: true,
          unitsExclusive: apartment.unitsExclusive,
          units: apartment.units.map((u) => ({ ...u })),
        },
        $setOnInsert: { slug: apartment.slug, photos: [] },
      },
      { upsert: true },
    );
    console.log(`  · ${apartment.subtitle} → ${apartment.name} (${apartment.slug})`);
  }

  console.log(
    `Apartment seed complete (${apartments.length} active · ${deact.modifiedCount} old listings deactivated)`,
  );
  console.log("Photo galleries unchanged — add room images in a later step.");
}

seedApartments()
  .catch((error: unknown) => {
    console.error("Apartment seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
