# Requirements Document

## Introduction

This document specifies the requirements for a decentralized event ticketing platform (dApp) that fights ticket scalping, fraudulent resale, and high intermediary fees. The platform issues event tickets as ERC-1155 NFTs with individual serial tracking, enforces on-chain resale price caps, provides a Web2-like experience through social login and gasless transactions (ERC-4337 Account Abstraction), and validates entry through dynamic time-sensitive QR codes signed off-chain (EIP-712).

The system is organized as a full monorepo with four phases: smart contracts (Foundry), subgraph & storage, frontend & authentication, and ticket scanner & off-chain verification. External services (Privy, Biconomy/ZeroDev, Pinata, The Graph) are abstracted behind provider interfaces with mock implementations first, so real credentials can be connected later without refactoring. The deployment target is Base Sepolia (testnet).

### Confirmed Scope Decisions

- **Repository structure:** Full monorepo (pnpm + turborepo) with `packages/contracts`, `packages/subgraph`, `packages/shared`, and `apps/web`, planning all four phases.
- **Ticket identity model:** ERC-1155 with serial tracking per entry. Serials are assigned per `(eventId, tier)` combination. The QR payload carries `(eventId, tier, serial)`.
- **Anti-scalping policy:** Mandatory on-chain resale. Direct transfers are blocked except for controlled exceptions (mint, burn, organizer, gate); the only P2P transfer path is `resellTicket`, which enforces `price <= maxResalePrice`.
- **Payments:** Native token (ETH on Base) and ERC-20 (e.g., USDC), configurable per event tier. Organizer withdrawal is protected by a reentrancy guard.
- **External services:** Mocked/abstracted first (Privy, Biconomy/ZeroDev, Pinata, The Graph). Real keys connected later. Network: Base Sepolia.

## Glossary

- **Event:** A ticketed event created by an organizer, identified by `eventId`.
- **Tier:** A ticket category within an event (e.g., General, VIP, Early Bird), each with its own supply, price, payment token, and resale cap.
- **Serial:** A per-`(eventId, tier)` sequential identifier assigned to each individual ticket at mint time, enabling individual ticket state tracking within a fungible ERC-1155 token.
- **Gate staff:** An address authorized by an organizer to validate tickets at an event entrance.
- **Dynamic QR:** A time-sensitive QR code whose payload is signed off-chain via EIP-712 and refreshed periodically to defeat screenshots.
- **Provider abstraction:** An interface (`AuthProvider`, `StorageProvider`, `DataProvider`) with a mock implementation and an environment flag to swap in the real service.
- **SCW:** Smart Contract Wallet, generated per user via Account Abstraction (ERC-4337).
- **Paymaster:** An ERC-4337 component that sponsors gas fees so end users transact gasless.

## Requirements

### Requirement 1: Event and Tier Creation

**User Story:** As an event organizer, I want to create events and define ticket tiers with independent pricing and supply, so that I can sell differentiated tickets (General, VIP, Early Bird) from a single contract.

#### Acceptance Criteria

1. WHEN an organizer calls `createEvent` with a unique `eventId` THEN the system SHALL register the event with the caller as its organizer and mark it active.
2. IF a caller who is not authorized as owner/organizer attempts `createEvent` THEN the system SHALL revert the transaction.
3. IF an `eventId` that already exists is used in `createEvent` THEN the system SHALL revert the transaction.
4. WHEN an organizer calls `addTier` for an event they own with a `maxSupply`, `price`, `maxResalePrice`, and `payToken` THEN the system SHALL register the tier and emit a `TierAdded` event.
5. IF `addTier` is called with `maxSupply` equal to zero THEN the system SHALL revert the transaction.
6. IF `addTier` is called with `maxResalePrice` less than `price` THEN the system SHALL revert the transaction.
7. IF a caller who is not the event organizer attempts `addTier` for that event THEN the system SHALL revert the transaction.
8. WHEN an event is successfully created THEN the system SHALL emit an `EventCreated` event containing the `eventId` and organizer address.

### Requirement 2: Ticket Purchase with Native and ERC-20 Payment

**User Story:** As a ticket buyer, I want to buy tickets paying with either native token or a configured ERC-20 (e.g., USDC), so that I can pay with my preferred asset.

#### Acceptance Criteria

1. WHEN a buyer calls `buyTicket` for a tier whose `payToken` is native (address zero) with the exact required value for the requested quantity THEN the system SHALL mint the tickets and assign sequential serials for that `(eventId, tier)`.
2. WHEN a buyer calls `buyTicket` for a tier whose `payToken` is an ERC-20 with sufficient approval THEN the system SHALL transfer the ERC-20 amount using a safe transfer and mint the tickets.
3. IF the native value sent is less than the required total price THEN the system SHALL revert the transaction.
4. IF the requested quantity would cause `minted + quantity` to exceed `maxSupply` THEN the system SHALL revert the transaction.
5. WHEN tickets are purchased THEN the system SHALL record the serial-to-owner association for each minted ticket.
6. WHEN a purchase succeeds THEN the system SHALL emit a `TicketPurchased` event with `eventId`, `tier`, quantity, and starting serial.
7. WHILE a payment is being processed THE system SHALL prevent reentrancy on state changes and value transfers.
8. WHEN a buyer purchases multiple tickets in a single call THEN the system SHALL mint them as a batch to minimize storage operations.

### Requirement 3: Anti-Scalping Transfer Enforcement and On-Chain Resale

**User Story:** As a platform operator, I want direct ticket transfers blocked and resale forced through an on-chain function with a price cap, so that scalping above the allowed resale price is prevented.

#### Acceptance Criteria

1. WHEN a token transfer occurs THE system SHALL allow it only if it is a mint, a burn, an organizer-permitted transfer, a gate-related transfer, or a transfer initiated by `resellTicket`.
2. IF a holder attempts a direct `safeTransferFrom` or `safeBatchTransferFrom` outside the allowed exceptions THEN the system SHALL revert the transaction.
3. WHEN a holder calls `resellTicket` with a `price` less than or equal to the tier `maxResalePrice` THEN the system SHALL transfer the specified serial to the buyer and route the payment to the seller.
4. IF `resellTicket` is called with a `price` greater than `maxResalePrice` THEN the system SHALL revert the transaction.
5. WHEN a resale succeeds THEN the system SHALL update the serial-to-owner association to the buyer.
6. WHEN a resale succeeds THEN the system SHALL emit a `TicketResold` event with `eventId`, `tier`, `serial`, seller, buyer, and price.
7. WHILE a resale payment is being processed THE system SHALL prevent reentrancy and use safe value/ERC-20 transfers.

### Requirement 4: Ticket Validation at the Gate

**User Story:** As authorized gate staff, I want to validate a ticket at the entrance and mark it used, so that a ticket cannot be reused or shared.

#### Acceptance Criteria

1. WHEN an organizer calls `setGateStaff` for an address on their event THEN the system SHALL grant or revoke gate-staff authorization for that address on that event.
2. WHEN authorized gate staff calls `validateTicket` with a valid `(eventId, tier, serial)` owned by the claimed `ticketOwner` THEN the system SHALL mark `isTicketUsed[eventId][tier][serial]` as true and emit a `TicketValidated` event.
3. IF `validateTicket` is called by an address that is not authorized gate staff for the event THEN the system SHALL revert the transaction.
4. IF `validateTicket` is called for a serial already marked used THEN the system SHALL revert the transaction (double-validation prevention).
5. IF the claimed `ticketOwner` does not match the recorded serial owner THEN the system SHALL revert the transaction.
6. WHEN queried THE system SHALL expose read-only views returning the current owner of a serial and whether a serial has been used, for use by the scanner.

### Requirement 5: Organizer Fund Withdrawal

**User Story:** As an event organizer, I want to withdraw the funds collected from my ticket sales, so that I receive the proceeds securely.

#### Acceptance Criteria

1. WHEN an organizer calls `withdraw` for their event THEN the system SHALL transfer the accumulated native and/or ERC-20 proceeds for that event to the organizer.
2. IF a caller who is not the event organizer calls `withdraw` THEN the system SHALL revert the transaction.
3. WHILE a withdrawal is being processed THE system SHALL prevent reentrancy and use safe value/ERC-20 transfers.
4. WHEN a withdrawal succeeds THEN the system SHALL reduce the recorded balance for that event to zero for the withdrawn asset.

### Requirement 6: Contract Security and Test Coverage

**User Story:** As a platform operator, I want the contract to be resistant to known exploit vectors and covered by a comprehensive test suite, so that funds and ticket integrity are protected.

#### Acceptance Criteria

1. THE system SHALL apply reentrancy protection on all functions that transfer value or ERC-20 tokens.
2. THE system SHALL validate inputs for supply, pricing, quantity, and ticket ownership on all state-changing functions.
3. THE test suite SHALL cover positive cases for creation, purchase, resale, validation, and withdrawal.
4. THE test suite SHALL cover exploit vectors including double validation, unauthorized minting, unauthorized validation, direct transfer bypass attempts, and resale above cap.
5. THE test suite SHALL include fuzz tests over prices and quantities and invariant checks that `minted` never exceeds `maxSupply` and that a used serial never returns to unused.
6. THE system SHALL provide a Foundry deployment script targeting Base Sepolia with a documented `.env.example`.

### Requirement 7: Shared Domain Types and EIP-712 Helpers

**User Story:** As a frontend developer, I want shared domain types, the contract ABI, and reusable EIP-712 helpers, so that the web app and scanner build and verify ticket signatures consistently.

#### Acceptance Criteria

1. THE shared package SHALL export TypeScript domain types and the contract ABI generated from the Foundry build, plus contract addresses per network.
2. THE shared package SHALL provide a helper to build the EIP-712 typed data for a ticket payload containing `eventId`, `tier`, `serial`, `owner`, `timestamp`, and a nonce.
3. THE shared package SHALL provide a helper to verify a ticket signature against a claimed owner address.
4. WHEN a payload is signed and then verified with the matching signer THEN the verification helper SHALL return success (round-trip).
5. WHEN a payload signature is verified against a different address THEN the verification helper SHALL return failure.

### Requirement 8: Authentication and Account Abstraction (Web2 UX)

**User Story:** As an end user, I want to sign up with social login and transact without paying gas, so that I can use the platform like a familiar Web2 app.

#### Acceptance Criteria

1. THE system SHALL define an `AuthProvider` interface exposing `login`, `logout`, `getAddress`, `signTypedData`, and `sendSponsoredTx`.
2. THE system SHALL provide a mock `AuthProvider` implementation using a local development account, selectable via an environment flag.
3. THE `AuthProvider` interface SHALL be designed so a Privy plus paymaster implementation can replace the mock without changing consumer code.
4. WHEN a user logs in through the mock provider THEN the system SHALL expose a wallet address for that session.
5. WHEN a user signs typed data through the provider THEN the system SHALL return a signature without requiring gas.

### Requirement 9: User Portal — Discovery and My Tickets with Dynamic QR

**User Story:** As a ticket holder, I want to browse events and view my tickets with a live dynamic QR, so that I can discover events and present a secure entry code.

#### Acceptance Criteria

1. THE user portal SHALL display an event discovery feed sourced through a `DataProvider` abstraction.
2. THE user portal SHALL display a "My Tickets" dashboard listing the tickets owned by the logged-in user.
3. WHEN a user opens a ticket THEN the system SHALL render a dynamic QR whose payload is signed via EIP-712 through the `AuthProvider`.
4. WHILE a ticket QR is displayed THE system SHALL regenerate the QR payload with a new timestamp on a fixed interval so screenshots expire.
5. THE user portal SHALL be responsive and PWA-installable for mobile use.

### Requirement 10: Gate Scanner (Gatekeeper) Verification

**User Story:** As gate staff, I want to scan a ticket QR, verify its signature and freshness, and validate it on-chain, so that only valid, unused tickets grant entry.

#### Acceptance Criteria

1. WHEN the scanner reads a QR THEN the system SHALL parse the payload and verify the EIP-712 signature against the claimed owner using the shared helper.
2. IF the signature is invalid THEN the scanner SHALL display an invalid state and SHALL NOT attempt on-chain validation.
3. IF the payload timestamp is outside the allowed time window THEN the scanner SHALL display an expired state and SHALL NOT attempt on-chain validation.
4. WHEN a signature is valid and fresh THEN the scanner SHALL query on-chain owner and used-state and, if unused and owned, trigger `validateTicket`.
5. IF a ticket has already been validated THEN the scanner SHALL display a used state and SHALL NOT re-validate.
6. WHILE offline THE scanner SHALL perform local signature and freshness verification and queue on-chain validations for later submission.

### Requirement 11: Organizer Dashboard, IPFS Upload, and Analytics

**User Story:** As an event organizer, I want to create events through a dashboard that uploads metadata to IPFS and shows sales and validation analytics, so that I can manage and monitor my events.

#### Acceptance Criteria

1. THE organizer dashboard SHALL provide an event creation modal that collects event and tier details and an image.
2. WHEN the organizer submits the creation form THEN the system SHALL upload image and metadata through a `StorageProvider` abstraction and trigger `createEvent` and `addTier` with the corresponding arguments.
3. THE system SHALL provide a mock `StorageProvider` implementation, selectable via an environment flag, that can be replaced by Pinata without changing consumer code.
4. THE organizer dashboard SHALL display real-time ticket sales and entrance validation counts sourced through the `DataProvider`.

### Requirement 12: Subgraph Indexing and Data Provider Integration

**User Story:** As a frontend developer, I want contract events indexed by a subgraph exposed over GraphQL, so that the app can render event, ticket, and validation data quickly.

#### Acceptance Criteria

1. THE subgraph SHALL define a schema with Event, Tier, Ticket, and Validation entities.
2. THE subgraph SHALL implement mappings for `EventCreated`, `TierAdded`, `TicketPurchased`, `TicketResold`, and `TicketValidated` events, configured for Base Sepolia.
3. THE system SHALL provide a GraphQL `DataProvider` implementation that is interchangeable with the mock via an environment flag.
4. WHEN the subgraph project is built THEN the build SHALL compile successfully with codegen and at least one mapping handler unit test.

### Requirement 13: End-to-End Integration and Service Swap Documentation

**User Story:** As a developer onboarding to the project, I want a working end-to-end flow over mocks and clear instructions to connect real services, so that I can run the dApp locally and later go live on Base Sepolia.

#### Acceptance Criteria

1. THE system SHALL support a complete local flow over mocks: create event, buy ticket, generate QR, validate, and view analytics.
2. THE system SHALL centralize provider selection behind environment flags so each mock (`AuthProvider`, `StorageProvider`, `DataProvider`) has a clear real-service replacement point.
3. THE repository SHALL include a root README runbook and a `.env.example` per package documenting how to connect Privy plus paymaster, Pinata, and the deployed subgraph.
4. THE system SHALL include an end-to-end happy-path test over mocks, and the global `build`, `lint`, and `test` pipelines SHALL pass.
