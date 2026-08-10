import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { catalogFromRate } from "../modules/apartments/pricing.js";
import { Apartment } from "../modules/apartments/apartment.model.js";

/**
 * Inventory: three independent 1-BR apartments + one flexible 2-BR
 * that can be booked as 1-BR or full 2-BR (mutually exclusive configs).
 */

const AMENITIES_1BR = [
  "Air Conditioning",
  "Kitchen",
  "Smart TV",
  "Workspace",
  "Kettle",
  "Microwave",
  "Wi-Fi",
] as const;

const AMENITIES_2BR = [
  "Air Conditioning",
  "Kitchen",
  "Smart TV",
  "Workspace",
  "Kettle",
  "Microwave",
  "Washer/Dryer",
  "Wi-Fi",
] as const;

const apartments = [
  {
    name: "Tropical Escape",
    slug: "apartment-1",
    subtitle: "Room 1",
    description: "One-bedroom self-catering apartment at Malfranza, Oistins.",
    type: "one-bedroom" as const,
    pricePerNight: catalogFromRate("one-bedroom"),
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqM: 55,
    amenities: [...AMENITIES_1BR],
    photos: [],
    isActive: true,
    unitsExclusive: false,
    units: [],
  },
  {
    name: "Island Breeze",
    slug: "apartment-2",
    subtitle: "Room 2",
    description: "One-bedroom self-catering apartment at Malfranza, Oistins.",
    type: "one-bedroom" as const,
    pricePerNight: catalogFromRate("one-bedroom"),
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqM: 54,
    amenities: [...AMENITIES_1BR],
    photos: [],
    isActive: true,
    unitsExclusive: false,
    units: [],
  },
  {
    name: "Palm Retreat",
    slug: "apartment-3",
    subtitle: "Room 3",
    description: "One-bedroom self-catering apartment at Malfranza, Oistins.",
    type: "one-bedroom" as const,
    pricePerNight: catalogFromRate("one-bedroom"),
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqM: 52,
    amenities: [...AMENITIES_1BR],
    photos: [],
    isActive: true,
    unitsExclusive: false,
    units: [],
  },
  {
    name: "Sunset Suite",
    slug: "apartment-4",
    subtitle: "Room 4",
    description:
      "Flexible two-bedroom residence. Book as a one-bedroom stay or as the full two-bedroom apartment — never both for the same dates.",
    type: "two-bedroom" as const,
    pricePerNight: catalogFromRate("two-bedroom"),
    maxGuests: 4,
    bedrooms: 2,
    bathrooms: 2,
    sizeSqM: 90,
    amenities: [...AMENITIES_2BR],
    photos: [],
    isActive: true,
    /** Parent/child: any booking on either config blocks the other. */
    unitsExclusive: true,
    units: [
      {
        name: "One-bedroom",
        description: "",
        bedrooms: 1,
        bathrooms: 1,
        maxGuests: 2,
        pricePerNight: catalogFromRate("one-bedroom"),
        isActive: true,
      },
      {
        name: "Two-bedroom",
        description: "",
        bedrooms: 2,
        bathrooms: 2,
        maxGuests: 4,
        pricePerNight: catalogFromRate("two-bedroom"),
        isActive: true,
      },
    ],
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
          // Keep existing gallery URLs if admin already set photos; seed leaves empty.
          units: apartment.units.map((u) => ({ ...u })),
        },
        $setOnInsert: { slug: apartment.slug, photos: [] },
      },
      { upsert: true },
    );
  }

  console.log(
    `Apartment seed complete (${apartments.length} active · ${deact.modifiedCount} old listings deactivated)`,
  );
}

seedApartments()
  .catch((error: unknown) => {
    console.error("Apartment seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
