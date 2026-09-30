import { ZERO_ADDRESS } from "@nftickets/shared";
import type { EventView, TicketView } from "./types";

/**
 * Demo owner address used by the mock fixtures. This is the address of the
 * well-known Anvil test account #0, which is also the default account used by
 * the mock `AuthProvider`. Seeding tickets for this address means a logged-in
 * mock user sees tickets in the "My Tickets" dashboard out of the box.
 *
 * Kept lowercase; `getMyTickets` compares case-insensitively.
 */
export const DEMO_OWNER =
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" as const;

/** A second address used to demonstrate USDC-priced tiers / other organizers. */
const ORGANIZER_TWO =
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;

/**
 * A stand-in ERC-20 (USDC-like) token address for demo tiers. The exact value
 * is unimportant for the mock; it only needs to be non-zero to indicate a
 * non-native settlement token.
 */
const DEMO_USDC =
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e" as const;

/** In-repo event fixtures backing the mock DataProvider (discovery feed). */
export const EVENT_FIXTURES: EventView[] = [
  {
    eventId: "1",
    name: "Fauna Primavera 2025",
    description:
      "Chile's flagship outdoor music festival returns for two days of live acts across four stages.",
    imageUrl:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=60",
    location: "Espacio Broadway, Santiago",
    startsAt: "2025-11-14T18:00:00-03:00",
    organizer: DEMO_OWNER,
    tiers: [
      {
        tier: "0",
        name: "General",
        maxSupply: 5000,
        minted: 3120,
        price: "45000000000000000", // 0.045 ETH
        maxResalePrice: "54000000000000000", // 0.054 ETH cap
        payToken: ZERO_ADDRESS,
        payTokenSymbol: "ETH",
      },
      {
        tier: "1",
        name: "VIP",
        maxSupply: 500,
        minted: 410,
        price: "120000000000000000", // 0.12 ETH
        maxResalePrice: "150000000000000000",
        payToken: ZERO_ADDRESS,
        payTokenSymbol: "ETH",
      },
    ],
  },
  {
    eventId: "2",
    name: "Teatro a Mil — Gala",
    description:
      "Opening gala of the summer performing-arts season, an evening of theatre and dance.",
    imageUrl:
      "https://images.unsplash.com/photo-1503095396549-807759245b35?w=800&q=60",
    location: "Teatro Municipal, Santiago",
    startsAt: "2026-01-08T20:30:00-03:00",
    organizer: ORGANIZER_TWO,
    tiers: [
      {
        tier: "0",
        name: "Early Bird",
        maxSupply: 800,
        minted: 800,
        price: "20000000", // 20 USDC (6 decimals)
        maxResalePrice: "24000000",
        payToken: DEMO_USDC,
        payTokenSymbol: "USDC",
      },
      {
        tier: "1",
        name: "Platea",
        maxSupply: 1200,
        minted: 640,
        price: "35000000", // 35 USDC
        maxResalePrice: "40000000",
        payToken: DEMO_USDC,
        payTokenSymbol: "USDC",
      },
    ],
  },
  {
    eventId: "3",
    name: "Lollapalooza Chile — Day Pass",
    description:
      "Single-day pass to the biggest lineup of the year at Parque Cerrillos.",
    imageUrl:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=60",
    location: "Parque Cerrillos, Santiago",
    startsAt: "2026-03-20T13:00:00-03:00",
    organizer: DEMO_OWNER,
    tiers: [
      {
        tier: "0",
        name: "Day Pass",
        maxSupply: 20000,
        minted: 15230,
        price: "80000000000000000", // 0.08 ETH
        maxResalePrice: "96000000000000000",
        payToken: ZERO_ADDRESS,
        payTokenSymbol: "ETH",
      },
    ],
  },
];

/**
 * In-repo ticket fixtures backing the mock DataProvider ("My Tickets"). Seeded
 * for {@link DEMO_OWNER} so the logged-in mock user sees tickets immediately.
 */
export const TICKET_FIXTURES: TicketView[] = [
  {
    eventId: "1",
    eventName: "Fauna Primavera 2025",
    imageUrl:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=60",
    location: "Espacio Broadway, Santiago",
    startsAt: "2025-11-14T18:00:00-03:00",
    tier: "1",
    tierName: "VIP",
    serial: "128",
    owner: DEMO_OWNER,
    used: false,
  },
  {
    eventId: "1",
    eventName: "Fauna Primavera 2025",
    imageUrl:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=60",
    location: "Espacio Broadway, Santiago",
    startsAt: "2025-11-14T18:00:00-03:00",
    tier: "0",
    tierName: "General",
    serial: "2044",
    owner: DEMO_OWNER,
    used: false,
  },
  {
    eventId: "3",
    eventName: "Lollapalooza Chile — Day Pass",
    imageUrl:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=60",
    location: "Parque Cerrillos, Santiago",
    startsAt: "2026-03-20T13:00:00-03:00",
    tier: "0",
    tierName: "Day Pass",
    serial: "9981",
    owner: DEMO_OWNER,
    used: true,
  },
];
