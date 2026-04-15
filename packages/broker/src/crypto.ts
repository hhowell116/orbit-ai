import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const KEY_FILE = process.env.ENCRYPTION_KEY_FILE || join(import.meta.dir, "..", ".encryption-key");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  if (process.env.ENCRYPTION_KEY) {
    return Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  }

  if (existsSync(KEY_FILE)) {
    return Buffer.from(readFileSync(KEY_FILE, "utf-8").trim(), "hex");
  }

  // First run — generate and persist a key
  const key = randomBytes(32);
  writeFileSync(KEY_FILE, key.toString("hex"), { mode: 0o600 });
  console.log(`[crypto] Generated encryption key at ${KEY_FILE}`);
  return key;
}

const KEY = getEncryptionKey();

/** Encrypt a plaintext string. Returns a hex-encoded "iv:ciphertext:tag" string. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

/** Decrypt an "iv:ciphertext:tag" hex string back to plaintext. */
export function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }
  const [ivHex, encHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

/** Check if a value looks like it's already encrypted (iv:ciphertext:tag hex format). */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  return parts.every((p) => /^[0-9a-f]+$/i.test(p));
}
