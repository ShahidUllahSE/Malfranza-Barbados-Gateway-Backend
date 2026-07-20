import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Apartment } from "../modules/apartments/apartment.model.js";

const apartments = [
  {
    name: "One-Bedroom Apartment",
    slug: "garden-view",
    subtitle: "Garden View",
    description: "Peaceful ground floor apartment with lush garden views and a private patio.",
    type: "one-bedroom",
    pricePerNight: 110,
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqM: 56,
    amenities: ["Wi-Fi", "Air Conditioning", "Kitchen", "Smart TV", "Parking", "Workspace"],
    photos: [],
    isActive: true,
  },
  {
    name: "One-Bedroom Apartment",
    slug: "city-view",
    subtitle: "City View",
    description: "Bright and airy apartment with city views and a cozy modern feel.",
    type: "one-bedroom",
    pricePerNight: 110,
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqM: 54,
    amenities: ["Wi-Fi", "Air Conditioning", "Kitchen", "Smart TV", "Workspace"],
    photos: [],
    isActive: true,
  },
  {
    name: "One-Bedroom Apartment",
    slug: "modern-comfort",
    subtitle: "Modern Comfort",
    description: "Stylish apartment with modern finishes and a fully equipped kitchen.",
    type: "one-bedroom",
    pricePerNight: 110,
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqM: 58,
    amenities: ["Wi-Fi", "Air Conditioning", "Kitchen", "Smart TV", "Parking"],
    photos: [],
    isActive: true,
  },
  {
    name: "One-Bedroom Apartment",
    slug: "tropical-escape",
    subtitle: "Tropical Escape",
    description: "Tranquil retreat with tropical décor and plenty of natural light.",
    type: "one-bedroom",
    pricePerNight: 110,
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqM: 55,
    amenities: ["Wi-Fi", "Air Conditioning", "Kitchen", "Smart TV"],
    photos: [],
    isActive: true,
  },
  {
    name: "Two-Bedroom Apartment",
    slug: "family-stay",
    subtitle: "Family Stay",
    description: "Spacious two-bedroom apartment ideal for families or small groups.",
    type: "two-bedroom",
    pricePerNight: 150,
    maxGuests: 4,
    bedrooms: 2,
    bathrooms: 1,
    sizeSqM: 82,
    amenities: ["Wi-Fi", "Air Conditioning", "Kitchen", "Smart TV", "Parking", "Workspace"],
    photos: [],
    isActive: true,
  },
] as const;

async function seedApartments(): Promise<void> {
  await connectDatabase();

  for (const apartment of apartments) {
    await Apartment.updateOne(
      { slug: apartment.slug },
      { $setOnInsert: apartment },
      { upsert: true },
    );
  }

  console.log(`Apartment seed complete (${apartments.length} records checked)`);
}

seedApartments()
  .catch((error: unknown) => {
    console.error("Apartment seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
