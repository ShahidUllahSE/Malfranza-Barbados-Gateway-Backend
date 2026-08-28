/**
 * Maps a Beds24 roomId to the local Apartment this listing represents.
 *
 * Beds24 only has 3 rooms configured under "Malfranza Apartments" (all one-bedroom:
 * "Apartment 1" / "Apartment 2" / "Apartment, 1 Bedroom (Apartment 3)"), while the
 * website has several named one-bedroom listings with identical specs. There's no
 * name/ID overlap to match automatically, so this mapping was picked by spec match
 * (1BR/2-guest) rather than a guaranteed correct pairing — update the IDs below once
 * the real correspondence is confirmed.
 */
export const BEDS24_ROOM_TO_APARTMENT: Record<number, string> = {
  722872: "6a74eb1505899ccadfb95701", // Beds24 "Apartment 1" -> Tropical Escape
  722873: "6a74eb1505899ccadfb95702", // Beds24 "Apartment 2" -> Island Breeze
  722875: "6a74eb1505899ccadfb95703", // Beds24 "Apartment, 1 Bedroom (Apartment 3)" -> Palm Retreat
};

export function apartmentIdForBeds24Room(roomId: number): string | undefined {
  return BEDS24_ROOM_TO_APARTMENT[roomId];
}

const APARTMENT_TO_BEDS24_ROOM: Record<string, number> = Object.fromEntries(
  Object.entries(BEDS24_ROOM_TO_APARTMENT).map(([roomId, apartmentId]) => [
    apartmentId,
    Number(roomId),
  ]),
);

/** Only the 3 apartments currently linked to a Beds24 room can be pushed outbound. */
export function beds24RoomIdForApartment(apartmentId: string): number | undefined {
  return APARTMENT_TO_BEDS24_ROOM[apartmentId];
}
