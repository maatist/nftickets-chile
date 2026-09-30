import { afterEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { buildTicketTypedData, type TicketPayload } from "@nftickets/shared";
import { MockAuthProvider } from "./mock";
import {
  createAuthProvider,
  getAuthProvider,
  resetAuthProvider,
  resolveAuthProviderKind,
} from "./factory";

afterEach(() => {
  resetAuthProvider();
});

describe("auth provider factory", () => {
  it("defaults to the mock kind when the env flag is unset", () => {
    expect(resolveAuthProviderKind(undefined)).toBe("mock");
  });

  it("resolves the mock kind when explicitly set to mock", () => {
    expect(resolveAuthProviderKind("mock")).toBe("mock");
  });

  it("falls back to mock for unrecognized values", () => {
    expect(resolveAuthProviderKind("nonsense")).toBe("mock");
  });

  it("resolves the privy kind when explicitly set", () => {
    expect(resolveAuthProviderKind("privy")).toBe("privy");
  });

  it("creates a MockAuthProvider for the mock kind", () => {
    const provider = createAuthProvider("mock");
    expect(provider).toBeInstanceOf(MockAuthProvider);
  });

  it("createAuthProvider() defaults to the mock implementation", () => {
    const provider = createAuthProvider();
    expect(provider).toBeInstanceOf(MockAuthProvider);
  });

  it("throws for the not-yet-implemented privy kind", () => {
    expect(() => createAuthProvider("privy")).toThrow(/not implemented/i);
  });

  it("getAuthProvider() returns a memoized mock instance", () => {
    const a = getAuthProvider();
    const b = getAuthProvider();
    expect(a).toBeInstanceOf(MockAuthProvider);
    expect(a).toBe(b);
  });
});

describe("mock auth provider behavior", () => {
  const devKey =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
  const expectedAddress = privateKeyToAccount(devKey).address;

  it("exposes no address until logged in, then the dev account address", async () => {
    const provider = new MockAuthProvider({ privateKey: devKey });
    expect(await provider.getAddress()).toBeNull();

    await provider.login();
    expect(await provider.getAddress()).toBe(expectedAddress);

    await provider.logout();
    expect(await provider.getAddress()).toBeNull();
  });

  it("signs EIP-712 ticket typed data with the shared helper", async () => {
    const provider = new MockAuthProvider({ privateKey: devKey });
    await provider.login();

    const payload: TicketPayload = {
      eventId: 1n,
      tier: 0n,
      serial: 42n,
      owner: expectedAddress,
      timestamp: 1_700_000_000n,
      nonce: 7n,
    };
    const typedData = buildTicketTypedData(payload, 84532, expectedAddress);

    const signature = await provider.signTypedData(typedData);
    expect(signature).toMatch(/^0x[0-9a-fA-F]+$/);
  });

  it("returns a simulated tx hash from sendSponsoredTx", async () => {
    const provider = new MockAuthProvider({ privateKey: devKey });
    const hash = await provider.sendSponsoredTx({
      to: "0x1111111111111111111111111111111111111111",
    });
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
