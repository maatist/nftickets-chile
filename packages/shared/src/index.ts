// @nftickets/shared
//
// Shared domain types, contract ABI, network addresses, and EIP-712 helpers
// consumed by the web app and gate scanner.

export const SHARED_PACKAGE_NAME = "@nftickets/shared";

// EIP-712 domain types + build/verify + timestamp-window helpers.
export {
  TICKET_DOMAIN_NAME,
  TICKET_DOMAIN_VERSION,
  DEFAULT_TIMESTAMP_WINDOW_SECONDS,
  ticketTypes,
  buildTicketTypedData,
  verifyTicketSignature,
  isTimestampFresh,
  type TicketPayload,
} from "./eip712.js";

// Contract ABI (generated from the Foundry build via scripts/export-abi.ts).
export { eventTicketingAbi } from "./abi.js";

// Deployed contract addresses per network.
export {
  addresses,
  BASE_SEPOLIA_CHAIN_ID,
  ZERO_ADDRESS,
  type NetworkAddresses,
} from "./addresses.js";
