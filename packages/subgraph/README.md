# @nftickets/subgraph

The Graph subgraph that indexes the `EventTicketing` contract on **Base Sepolia**
(chainId `84532`) and exposes Events, Tiers, Tickets, and Validations over GraphQL.
The web app consumes it through the GraphQL `DataProvider`
(`apps/web/src/providers/data/subgraph.ts`) selected by
`NEXT_PUBLIC_DATA_PROVIDER=subgraph`.

## Layout

```
subgraph/
├── schema.graphql          # Event, Tier, Ticket, Validation entities
├── subgraph.yaml           # single EventTicketing dataSource + 5 event handlers
├── src/mapping.ts          # AssemblyScript handlers
├── abis/EventTicketing.json# copied from the Foundry build (see copy-abi)
├── scripts/copy-abi.mjs    # copies the ABI from packages/contracts/out
└── tests/mapping.test.ts   # matchstick unit tests
```

## Entities and the data model

Serials are tracked per `(eventId, tier)`. Entity ids are strings:

| Entity     | id format                    |
| ---------- | ---------------------------- |
| Event      | `<eventId>`                  |
| Tier       | `<eventId>-<tier>`           |
| Ticket     | `<eventId>-<tier>-<serial>`  |
| Validation | `<eventId>-<tier>-<serial>`  |

`TicketPurchased` mints `quantity` sequential serials starting at `startSerial`;
`handleTicketPurchased` creates one `Ticket` per serial
(`startSerial … startSerial + quantity - 1`) owned by the buyer and bumps
`Tier.minted`.

### Display-only fields are intentionally absent

On-chain events do **not** carry an event's name, description, cover image,
location, or start time — those live in IPFS metadata uploaded through the
`StorageProvider`. The subgraph only stores what the logs contain. The GraphQL
`DataProvider` fills the missing display fields with documented fallbacks (e.g.
`"Event #<id>"`, a placeholder image, `"TBA"`), so the `EventView` / `TicketView`
shapes returned to the UI stay identical to the mock provider.

## Handlers

| Event             | Handler                 | Effect                                                        |
| ----------------- | ----------------------- | ------------------------------------------------------------- |
| `EventCreated`    | `handleEventCreated`    | upsert `Event`                                                |
| `TierAdded`       | `handleTierAdded`       | upsert `Tier` (minted = 0)                                    |
| `TicketPurchased` | `handleTicketPurchased` | create `quantity` `Ticket`s, increment `Tier.minted`          |
| `TicketResold`    | `handleTicketResold`    | update `Ticket.owner`                                         |
| `TicketValidated` | `handleTicketValidated` | set `Ticket.used = true`, create `Validation`                 |

## Scripts

- `pnpm run copy-abi` — copy the ABI from the Foundry build into `abis/`.
- `pnpm run codegen`  — `copy-abi` then `graph codegen` (writes `generated/`).
- `pnpm run build`    — `codegen` then `graph build` (compiles WASM to `build/`).
- `pnpm run test`     — `graph test` (matchstick).

## Deployment placeholders

`subgraph.yaml` ships a **placeholder** `source.address`
(`0x0000…0000`) and `startBlock: 0`. After deploying `EventTicketing.sol` via
`packages/contracts/script/Deploy.s.sol`, replace both with the deployed address
and its creation block (or substitute them at deploy time from the environment).

## Environment notes (what ran here vs. what could not)

- `graph codegen` — **runs and passes** (types generated for the ABI and schema).
- `graph build`   — **runs and passes** (mappings + `tests/` compile to WASM).
- `graph test` (matchstick) — **could not execute in this environment.** The
  graph-cli platform detection does not recognize this rolling-release host
  (Manjaro/Arch) and the prebuilt matchstick binary is built for Ubuntu and
  dynamically links `libpq.so.5`, which is not installed here. The test file is
  written against the matchstick-as API and the codegen'd types, and it compiles
  as part of `graph build`. On a supported host (Ubuntu 20/22 with
  `postgresql`/`libpq` present) `pnpm --filter @nftickets/subgraph run test`
  runs the two handler tests.
