import { BASE_SEPOLIA_CHAIN_ID } from "@nftickets/shared";
import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";

// Sanity check: the shared package's chain id must match viem/wagmi's baseSepolia.
// This keeps the on-chain reads/writes and the EIP-712 domain aligned.
if (baseSepolia.id !== BASE_SEPOLIA_CHAIN_ID) {
  throw new Error(
    `Chain id mismatch: wagmi baseSepolia=${baseSepolia.id} vs shared=${BASE_SEPOLIA_CHAIN_ID}`,
  );
}

/**
 * Wagmi config targeting Base Sepolia. The scanner and portal use this to read
 * on-chain state (isUsed / ownerOfSerial) and, later, to submit sponsored
 * transactions via the AuthProvider.
 */
export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http(),
  },
  // Wagmi/React Query manage their own state; disable SSR auto-connect quirks
  // by keeping this a plain client config consumed inside a client provider.
  ssr: true,
});

export { baseSepolia };
