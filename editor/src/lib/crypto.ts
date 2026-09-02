import crypto from "node:crypto";

/**
 * Server-side encryption for user-provided AI provider API keys.
 * Format: v1:<iv_b64>:<ciphertext_b64>:<tag_b64>
 * Requires APP_ENCRYPTION_KEY env var (any string; hashed to a 32-byte key).
 * We never decrypt on the client and never return the key material to the UI.
 */
const VERSION = "v1";

function getKey(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret || secret.length < 8) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not configured. Set it in .env.local (any long random string) to enable AI provider storage."
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${enc.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Malformed encrypted secret");
  }
  const [, ivB64, dataB64, tagB64] = parts;
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getKey(),
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Could not decrypt stored API key — was APP_ENCRYPTION_KEY changed? Re-save the provider."
    );
  }
}

/** Masked display form, safe to render in the UI: sk-abcdefgh → sk-ab…fghi */
export function maskKey(key: string): string {
  if (!key) return "—";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
