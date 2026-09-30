import { afterEach, describe, expect, it } from "vitest";
import {
  MockStorageProvider,
  createStorageProvider,
  getStorageProvider,
  resetStorageProvider,
  resolveStorageProviderKind,
  type EventMetadata,
} from "./index";

const META: EventMetadata = {
  eventId: "1",
  name: "Test Event",
  description: "desc",
  image: "ipfs://image-cid",
  location: "Santiago",
  startsAt: "2026-01-01T00:00:00Z",
  tiers: [],
};

afterEach(() => {
  resetStorageProvider();
});

describe("resolveStorageProviderKind", () => {
  it("defaults to mock when unset or unrecognized", () => {
    expect(resolveStorageProviderKind(undefined)).toBe("mock");
    expect(resolveStorageProviderKind("nonsense")).toBe("mock");
  });

  it("resolves pinata when explicitly set", () => {
    expect(resolveStorageProviderKind("pinata")).toBe("pinata");
  });
});

describe("createStorageProvider", () => {
  it("returns a MockStorageProvider for the mock kind", () => {
    expect(createStorageProvider("mock")).toBeInstanceOf(MockStorageProvider);
  });

  it("throws for the not-yet-implemented pinata kind", () => {
    expect(() => createStorageProvider("pinata")).toThrow(/not implemented/i);
  });
});

describe("getStorageProvider", () => {
  it("memoizes a single instance", () => {
    const a = getStorageProvider();
    const b = getStorageProvider();
    expect(a).toBe(b);
  });
});

describe("MockStorageProvider", () => {
  it("returns deterministic ipfs:// URIs for images and metadata", async () => {
    const storage = new MockStorageProvider();
    const image = new Blob(["bytes"], { type: "image/png" });

    const imageUri = await storage.uploadImage(image);
    const metaUri = await storage.uploadMetadata(META);

    expect(imageUri).toMatch(/^ipfs:\/\//);
    expect(metaUri).toMatch(/^ipfs:\/\//);
    // Deterministic per input.
    expect(await storage.uploadImage(image)).toBe(imageUri);
    expect(await storage.uploadMetadata(META)).toBe(metaUri);
  });

  it("rejects when configured to simulate errors", async () => {
    const storage = new MockStorageProvider({ simulateError: true });
    await expect(
      storage.uploadImage(new Blob(["x"])),
    ).rejects.toThrow(/failed/i);
    await expect(storage.uploadMetadata(META)).rejects.toThrow(/failed/i);
  });
});
