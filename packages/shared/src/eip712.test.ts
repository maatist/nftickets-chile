import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  BASE_SEPOLIA_CHAIN_ID,
  ZERO_ADDRESS,
} from "./addresses.js";
import {
  buildTicketTypedData,
  isTimestampFresh,
  verifyTicketSignature,
  type TicketPayload,
} from "./eip712.js";

// Deterministic anvil test account #0.
const PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const account = privateKeyToAccount(PRIVATE_KEY);

// A different anvil test account (#1) used as a mismatched signer/owner.
const OTHER_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const otherAccount = privateKeyToAccount(OTHER_PRIVATE_KEY);

const chainId = BASE_SEPOLIA_CHAIN_ID;
const verifyingContract = "0x1111111111111111111111111111111111111111" as const;

function makePayload(owner: `0x${string}`): TicketPayload {
  return {
    eventId: 1n,
    tier: 0n,
    serial: 42n,
    owner,
    timestamp: 1_700_000_000n,
    nonce: 7n,
  };
}

describe("EIP-712 ticket signature round-trip", () => {
  it("verifies a signature produced by the matching signer (success)", async () => {
    const payload = makePayload(account.address);
    const typedData = buildTicketTypedData(payload, chainId, verifyingContract);

    const signature = await account.signTypedData(typedData);

    const ok = await verifyTicketSignature({
      payload,
      signature,
      expectedOwner: account.address,
      chainId,
      verifyingContract,
    });

    expect(ok).toBe(true);
  });

  it("fails verification against a different expected owner (wrong signer)", async () => {
    const payload = makePayload(account.address);
    const typedData = buildTicketTypedData(payload, chainId, verifyingContract);

    const signature = await account.signTypedData(typedData);

    const ok = await verifyTicketSignature({
      payload,
      signature,
      // Verifying against a different address must fail, without throwing.
      expectedOwner: otherAccount.address,
      chainId,
      verifyingContract,
    });

    expect(ok).toBe(false);
  });

  it("fails verification when the payload is tampered after signing", async () => {
    const payload = makePayload(account.address);
    const typedData = buildTicketTypedData(payload, chainId, verifyingContract);
    const signature = await account.signTypedData(typedData);

    const tampered: TicketPayload = { ...payload, serial: payload.serial + 1n };

    const ok = await verifyTicketSignature({
      payload: tampered,
      signature,
      expectedOwner: account.address,
      chainId,
      verifyingContract,
    });

    expect(ok).toBe(false);
  });

  it("fails verification when the domain (verifyingContract) differs", async () => {
    const payload = makePayload(account.address);
    const typedData = buildTicketTypedData(payload, chainId, verifyingContract);
    const signature = await account.signTypedData(typedData);

    const ok = await verifyTicketSignature({
      payload,
      signature,
      expectedOwner: account.address,
      chainId,
      verifyingContract: ZERO_ADDRESS,
    });

    expect(ok).toBe(false);
  });
});

describe("isTimestampFresh timestamp-window helper", () => {
  const now = 1_700_000_000n;
  const windowSeconds = 30n;

  it("accepts a payload created exactly now", () => {
    expect(isTimestampFresh(now, now, windowSeconds)).toBe(true);
  });

  it("accepts a payload within the window", () => {
    expect(isTimestampFresh(now - 10n, now, windowSeconds)).toBe(true);
  });

  it("accepts a payload at the window boundary", () => {
    expect(isTimestampFresh(now - 30n, now, windowSeconds)).toBe(true);
  });

  it("rejects a payload older than the window (expired)", () => {
    expect(isTimestampFresh(now - 31n, now, windowSeconds)).toBe(false);
  });

  it("rejects a payload dated in the future", () => {
    expect(isTimestampFresh(now + 5n, now, windowSeconds)).toBe(false);
  });

  it("accepts a number window argument", () => {
    expect(isTimestampFresh(now - 5n, now, 30)).toBe(true);
  });
});
