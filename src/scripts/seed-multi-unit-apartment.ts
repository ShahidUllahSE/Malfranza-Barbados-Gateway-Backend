import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Apartment } from "../modules/apartments/apartment.model.js";

const multiUnitApartment = {
  name: "Three-Bedroom Apartment",
  slug: "harbour-residence",
  subtitle: "Harbour Residence",
  description:
    "A spacious three-bedroom residence divided into two independently bookable units — a two-bedroom suite and a private one-bedroom studio. Book one unit or both; each has its own entrance, kitchen, and bathroom.",
  type: "three-bedroom",
  pricePerNight: 130,
  maxGuests: 6,
  bedrooms: 3,
  bathrooms: 2,
  sizeSqM: 120,
  amenities: ["Wi-Fi", "Air Conditioning", "Kitchen", "Smart TV", "Parking", "Workspace"],
  photos: [],
  isActive: true,
  units: [
    {
      name: "Two-Bedroom Suite",
      description:
        "The larger unit with two bedrooms, a full kitchen, and a private bathroom — ideal for families or small groups.",
      bedrooms: 2,
      bathrooms: 1,
      maxGuests: 4,
      pricePerNight: 150,
      isActive: true,
    },
    {
      name: "One-Bedroom Studio",
      description:
        "A cozy self-contained one-bedroom studio with its own entrance, kitchenette, and bathroom.",
      bedrooms: 1,
      bathrooms: 1,
      maxGuests: 2,
      pricePerNight: 110,
      isActive: true,
    },
  ],
} as const;

async function seedMultiUnitApartment(): Promise<void> {
  await connectDatabase();

  const result = await Apartment.updateOne(
    { slug: multiUnitApartment.slug },
    { $setOnInsert: multiUnitApartment },
    { upsert: true },
  );

  if (result.upsertedCount > 0) {
    console.log(`Created multi-unit apartment "${multiUnitApartment.subtitle}" with ${multiUnitApartment.units.length} bookable units`);
  } else {
    console.log(`Multi-unit apartment "${multiUnitApartment.subtitle}" already exists — no changes made`);
  }
}

seedMultiUnitApartment()
  .catch((error: unknown) => {
    console.error("Multi-unit apartment seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
