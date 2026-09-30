/**
 * Deployed contract addresses, keyed by EVM chain id.
 *
 * Base Sepolia is chain id 84532 and is the deployment target for this project.
 * The address below is a documented placeholder (the zero address) until the
 * `EventTicketing` contract is deployed via `packages/contracts/script/Deploy.s.sol`.
 * After deployment, replace the placeholder with the real address.
 */

/** Base Sepolia testnet chain id. */
export const BASE_SEPOLIA_CHAIN_ID = 84532 as const;

/** Convenience zero address placeholder for undeployed networks. */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export interface NetworkAddresses {
  eventTicketing: `0x${string}`;
}

export const addresses: Record<number, NetworkAddresses> = {
  // Base Sepolia — placeholder until deployment. Replace after `Deploy.s.sol` runs.
  [BASE_SEPOLIA_CHAIN_ID]: {
    eventTicketing: ZERO_ADDRESS,
  },
};
