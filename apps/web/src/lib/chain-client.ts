import {
  createPublicClient,
  encodeFunctionData,
  http,
  type PublicClient,
} from "viem";
import { baseSepolia } from "viem/chains";
import {
  addresses,
  BASE_SEPOLIA_CHAIN_ID,
  eventTicketingAbi,
} from "@nftickets/shared";
import type { AuthProvider } from "@/providers/auth";

/**
 * The set of on-chain reads/writes the gate scanner needs, abstracted behind a
 * small interface so tests can inject a mock contract client (the
 * double-validation test drives `isUsed` from a mock). The concrete
 * implementation ({@link ViemScannerChainClient}) uses a viem public client for
 * Base Sepolia for reads, and the {@link AuthProvider} for the state-changing
 * `validateTicket` write.
 */
export interface ScannerChainClient {
  /** On-chain owner recorded for a `(eventId, tier, serial)` triple. */
  ownerOfSerial(
    eventId: bigint,
    tier: bigint,
    serial: bigint,
  ): Promise<`0x${string}`>;
  /** Whether a `(eventId, tier, serial)` triple has already been validated. */
  isUsed(eventId: bigint, tier: bigint, serial: bigint): Promise<boolean>;
  /**
   * Submit the state-changing `validateTicket` transaction, marking the ticket
   * used at the gate. Returns the transaction hash.
   */
  validateTicket(
    eventId: bigint,
    tier: bigint,
    serial: bigint,
    ticketOwner: `0x${string}`,
  ): Promise<`0x${string}`>;
}

export interface ViemScannerChainClientOptions {
  /**
   * AuthProvider used to submit the sponsored `validateTicket` transaction.
   *
   * DESIGN NOTE: `validateTicket` is state-changing. We submit it through
   * `AuthProvider.sendSponsoredTx` (encoding the calldata with viem's
   * `encodeFunctionData` + `eventTicketingAbi`) rather than a raw wagmi/viem
   * `writeContract`. This keeps the gate flow consistent with the gasless
   * (ERC-4337 paymaster) design used everywhere else in the app: gate staff can
   * validate tickets without holding gas, and the same abstraction swaps from
   * the mock to Privy + paymaster without touching the scanner.
   */
  authProvider: AuthProvider;
  /** Public client for reads. Defaults to a Base Sepolia HTTP client. */
  publicClient?: PublicClient;
  /** EventTicketing contract address. Defaults to the shared address book. */
  contractAddress?: `0x${string}`;
}

/**
 * Production {@link ScannerChainClient}: viem public client for reads, and
 * `AuthProvider.sendSponsoredTx` for the `validateTicket` write.
 */
export class ViemScannerChainClient implements ScannerChainClient {
  private readonly authProvider: AuthProvider;
  private readonly publicClient: PublicClient;
  private readonly contractAddress: `0x${string}`;

  constructor(options: ViemScannerChainClientOptions) {
    this.authProvider = options.authProvider;
    this.publicClient =
      options.publicClient ??
      (createPublicClient({
        chain: baseSepolia,
        transport: http(),
      }) as PublicClient);
    this.contractAddress =
      options.contractAddress ??
      addresses[BASE_SEPOLIA_CHAIN_ID]?.eventTicketing ??
      "0x0000000000000000000000000000000000000000";
  }

  async ownerOfSerial(
    eventId: bigint,
    tier: bigint,
    serial: bigint,
  ): Promise<`0x${string}`> {
    return this.publicClient.readContract({
      address: this.contractAddress,
      abi: eventTicketingAbi,
      functionName: "ownerOfSerial",
      args: [eventId, tier, serial],
    }) as Promise<`0x${string}`>;
  }

  async isUsed(
    eventId: bigint,
    tier: bigint,
    serial: bigint,
  ): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.contractAddress,
      abi: eventTicketingAbi,
      functionName: "isUsed",
      args: [eventId, tier, serial],
    }) as Promise<boolean>;
  }

  async validateTicket(
    eventId: bigint,
    tier: bigint,
    serial: bigint,
    ticketOwner: `0x${string}`,
  ): Promise<`0x${string}`> {
    const data = encodeFunctionData({
      abi: eventTicketingAbi,
      functionName: "validateTicket",
      args: [eventId, tier, serial, ticketOwner],
    });
    return this.authProvider.sendSponsoredTx({
      to: this.contractAddress,
      data,
    });
  }
}
