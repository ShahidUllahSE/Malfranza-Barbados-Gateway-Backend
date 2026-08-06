import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Apartment } from "../modules/apartments/apartment.model.js";

/** Replaces old demo listings with the real Malfranza photo-set properties. */
const apartments = [
  {
    name: "Malfranza Apartment Number 1",
    slug: "apartment-1",
    subtitle: "Garden courtyard stay",
    description:
      "Comfortable self-catering apartment in our lime-green courtyard building in Barbados. Private patio access, tropical landscaping, and on-site parking — ideal for couples or a short city base.",
    type: "one-bedroom",
    pricePerNight: 110,
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqM: 55,
    amenities: ["Wi-Fi", "Air Conditioning", "Kitchen", "Smart TV", "Parking", "Workspace"],
    photos: [],
    isActive: true,
    units: [],
  },
  {
    name: "Malfranza Apartment Number 2",
    slug: "apartment-2",
    subtitle: "Bright bedroom suite",
    description:
      "Light-filled apartment with a restful bedroom, air conditioning, and Malfranza’s signature tropical finishes. A quiet, well-kept stay close to everything Oistins has to offer.",
    type: "one-bedroom",
    pricePerNight: 110,
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqM: 54,
    amenities: ["Wi-Fi", "Air Conditioning", "Kitchen", "Smart TV", "Parking", "Workspace"],
    photos: [],
    isActive: true,
    units: [],
  },
  {
    name: "Malfranza Apartment Number 3",
    slug: "apartment-3",
    subtitle: "Tropical double room",
    description:
      "Cheerful double bedroom suite with split air conditioning, tropical décor, and tiled floors for easy beach-day living. Perfect for a relaxed Barbados getaway.",
    type: "one-bedroom",
    pricePerNight: 105,
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqM: 52,
    amenities: ["Wi-Fi", "Air Conditioning", "Kitchen", "Smart TV", "Parking"],
    photos: [],
    isActive: true,
    units: [],
  },
  {
    name: "Malfranza Apartments A & B",
    slug: "apartment-a-and-b",
    subtitle: "Two-unit residence",
    description:
      "A flexible Malfranza property with two independently bookable units — Unit A and Unit B. Book one for a couple’s stay, or both when travelling as a family or small group.",
    type: "two-bedroom",
    pricePerNight: 110,
    maxGuests: 4,
    bedrooms: 2,
    bathrooms: 2,
    sizeSqM: 90,
    amenities: ["Wi-Fi", "Air Conditioning", "Kitchen", "Smart TV", "Parking", "Workspace"],
    photos: [],
    isActive: true,
    units: [
      {
        name: "Unit A",
        description: "Self-contained unit A with private facilities.",
        bedrooms: 1,
        bathrooms: 1,
        maxGuests: 2,
        pricePerNight: 110,
        isActive: true,
      },
      {
        name: "Unit B",
        description: "Self-contained unit B with private facilities.",
        bedrooms: 1,
        bathrooms: 1,
        maxGuests: 2,
        pricePerNight: 110,
        isActive: true,
      },
    ],
  },
] as const;

const KEEP_SLUGS = new Set(apartments.map((a) => a.slug));

async function seedApartments(): Promise<void> {
  await connectDatabase();

  // Deactivate any older demo apartments that are not in the new set.
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
          // Drop old Cloudinary ChatGPT photos so the site uses local newimage galleries.
          photos: [],
          units: apartment.units.map((u) => ({ ...u })),
        },
        $setOnInsert: { slug: apartment.slug },
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
