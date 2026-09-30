# Implementation Plan

- [x] 1. Bootstrap the monorepo
  - Initialize pnpm workspace and turborepo with `packages/contracts`, `packages/subgraph`, `packages/shared`, and `apps/web`.
  - Add root config: `pnpm-workspace.yaml`, `turbo.json` (build/test/lint pipelines), `tsconfig.base.json`, prettier, eslint, `.gitignore`, and a root README skeleton.
  - Add minimal placeholders in each package so `pnpm install` and `turbo build` run clean.
  - _Requirements: R13 (structure/pipelines)_

- [x] 2. Scaffold Foundry and the minimal ERC-1155 contract
  - Run `forge init` in `packages/contracts` and install OpenZeppelin Contracts v5.
  - Implement `EventTicketing.sol` extending `ERC1155` + `Ownable` with the data model structs and `createEvent`/`addTier`, emitting `EventCreated`/`TierAdded`.
  - Validate inputs (existing event, non-organizer, `maxSupply == 0`, `maxResalePrice < price`).
  - Write `EventTicketing.t.sol` covering event/tier creation, unauthorized revert, and invalid inputs.
  - _Requirements: R1_

- [x] 3. Implement ticket purchase with native + ERC-20 and serial tracking
  - Implement `buyTicket(eventId, tier, quantity)` handling native (`payable`, exact value) and ERC-20 (`SafeERC20.safeTransferFrom`) per tier `payToken`.
  - Enforce supply (`minted + quantity <= maxSupply`), assign sequential serials via `nextSerial`, record `serialOwner`, batch-mint, and emit `TicketPurchased`.
  - Apply `ReentrancyGuard`; credit the per-event proceeds ledger.
  - Extend tests: native ok, ERC-20 ok (mock token), insufficient payment revert, sold-out revert, serial assignment, reentrancy attempt.
  - _Requirements: R2, R6 (reentrancy/inputs)_

- [x] 4. Implement anti-scalping transfer enforcement and on-chain resale
  - Override `_update` to allow mint/burn and resale-flagged transfers only; revert direct `safeTransferFrom`/`safeBatchTransferFrom`.
  - Implement `resellTicket(eventId, tier, serial, buyer, price)` enforcing `price <= maxResalePrice`, transferring one unit via the resale flag, updating `serialOwner`, routing payment (native/ERC-20), emitting `TicketResold`.
  - Apply `ReentrancyGuard` and safe transfers.
  - Extend tests: direct transfer reverts, resale within cap ok, resale above cap reverts, ownership update, seller payout.
  - _Requirements: R3, R6_

- [x] 5. Implement gate validation and gate-staff roles
  - Implement `setGateStaff(eventId, staff, authorized)` (organizer-only) and `validateTicket(eventId, tier, serial, ticketOwner)` marking `isTicketUsed` and emitting `TicketValidated`.
  - Add read views `ownerOfSerial` and `isUsed` for the scanner.
  - Extend tests: staff validation ok, non-staff revert, double-validation revert, owner-mismatch revert.
  - _Requirements: R4_

- [x] 6. Implement withdrawal, deploy script, and complete the exploit/fuzz suite
  - Implement `withdraw(eventId, token)` (organizer-only, reentrancy-safe, native + ERC-20) zeroing the withdrawn balance.
  - Add `script/Deploy.s.sol` targeting Base Sepolia with `.env.example`.
  - Complete the test suite: exploit vectors (unauthorized minting, transfer bypass, resale above cap, double validation, unauthorized validation) plus fuzz (prices/quantities) and invariants (`minted <= maxSupply`, used serial never resets).
  - _Requirements: R5, R6_

- [x] 7. Build the `shared` package with types, ABI, and EIP-712 helpers
  - Add a script to export the contract ABI from `packages/contracts/out` and define `addresses` per network.
  - Define domain types and `TicketPayload`; implement `buildTicketTypedData` and `verifyTicketSignature` using viem.
  - Add vitest tests: sign→verify round-trip success, wrong-signer failure, timestamp-window helper.
  - _Requirements: R7_

- [x] 8. Scaffold Next.js (App Router) with Tailwind, PWA, and the mocked Web3 layer
  - Initialize `apps/web` (App Router, TS, Tailwind, Lucide) and configure Wagmi/Viem for Base Sepolia.
  - Define `AuthProvider` interface and a mock implementation (local viem account); add a provider factory keyed by env flag.
  - Configure PWA (manifest + service worker).
  - Add tests: factory resolves the mock, layout renders, typecheck passes.
  - _Requirements: R8, R9 (PWA)_

- [x] 9. Build the user portal — discovery feed and My Tickets with dynamic QR
  - Define `DataProvider` interface and a mock implementation (fixtures); add the event discovery feed and "My Tickets" dashboard.
  - Implement the dynamic QR component: build/sign `TicketPayload` via `AuthProvider` + shared helpers, render with `qrcode`, and regenerate on a fixed interval.
  - Ensure responsive/PWA layout.
  - Add tests: QR regenerates on interval, event list renders from mock.
  - _Requirements: R9, R7 (helper use)_

- [x] 10. Build the gate scanner (Gatekeeper) with off-chain and on-chain verification
  - Implement the scanner view reading QR via camera; verify EIP-712 signature and timestamp window with shared helpers.
  - Query on-chain `isUsed`/`ownerOfSerial` (viem) and trigger `validateTicket` when valid, fresh, unused, and owned.
  - Implement UI states (`valid`, `used`, `invalid-signature`, `expired`, `owner-mismatch`) and an offline mode that verifies locally and queues validations.
  - Add tests: valid/invalid/expired signature handling; double-validation blocked (contract mock).
  - _Requirements: R10_

- [x] 11. Build the organizer dashboard with IPFS upload and analytics
  - Define `StorageProvider` interface and a mock implementation; add the event creation modal (event/tier fields + image).
  - On submit, upload image/metadata via `StorageProvider` and trigger `createEvent`/`addTier` through `AuthProvider`.
  - Add the analytics panel (sales + validation counts) sourced via `DataProvider`.
  - Add tests: form submit calls create with correct args (mock); analytics render from mock.
  - _Requirements: R11_

- [x] 12. Implement the subgraph and the GraphQL DataProvider
  - Define `schema.graphql` (Event, Tier, Ticket, Validation) and `subgraph.yaml` for Base Sepolia; implement `src/mapping.ts` handlers for the five events.
  - Implement the GraphQL `DataProvider` matching the mock's view shapes and wire it behind the env flag.
  - Add tests: `graph build` compiles with codegen; matchstick test for one handler; GraphQL provider integration test against mock responses.
  - _Requirements: R12_

- [x] 13. Wire the end-to-end flow and document service swaps
  - Connect the full mock flow: create event → buy → generate QR → validate → analytics update.
  - Centralize provider selection behind env flags; ensure each mock has a documented real-service replacement point.
  - Write the root README runbook and `.env.example` per package (Privy + paymaster, Pinata, deployed subgraph).
  - Add a Playwright happy-path E2E test over mocks; ensure `turbo run build lint test` passes globally.
  - _Requirements: R13_
