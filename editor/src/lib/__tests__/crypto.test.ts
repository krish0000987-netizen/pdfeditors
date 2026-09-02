import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, maskKey } from "@/lib/crypto";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = "test-key-for-vitest-0123456789";
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret", () => {
    const secret = "sk-my-very-secret-api-key-123";
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const enc1 = encryptSecret("same-value");
    const enc2 = encryptSecret("same-value");
    expect(enc1).not.toBe(enc2);
    expect(decryptSecret(enc1)).toBe("same-value");
    expect(decryptSecret(enc2)).toBe("same-value");
  });

  it("uses the v1 format", () => {
    const parts = encryptSecret("hello").split(":");
    expect(parts[0]).toBe("v1");
    expect(parts).toHaveLength(4);
  });

  it("refuses to decrypt tampered ciphertext", () => {
    const enc = encryptSecret("important");
    const tampered = enc.slice(0, -4) + "AAAA";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("refuses malformed payloads", () => {
    expect(() => decryptSecret("not-encrypted")).toThrow("Malformed encrypted secret");
  });

  it("fails without APP_ENCRYPTION_KEY", () => {
    const original = process.env.APP_ENCRYPTION_KEY;
    delete process.env.APP_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/APP_ENCRYPTION_KEY/);
    process.env.APP_ENCRYPTION_KEY = original;
  });
});

describe("maskKey", () => {
  it("masks long keys", () => {
    expect(maskKey("sk-abcdefghijklmnop")).toBe("sk-a…mnop");
  });
  it("masks short keys fully", () => {
    expect(maskKey("short")).toBe("••••");
    expect(maskKey("")).toBe("—");
  });
});
