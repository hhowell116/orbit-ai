import { randomBytes, createCipheriv, createDecipheriv, createHmac } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

// --- Master key management ---
// The master key is read from a file OUTSIDE the repo so PTY users can't find it
// in the broker directory. It never touches process.env or /proc/PID/environ.

const MASTER_KEY_FILE = join(process.env.HOME || "/home/rowecasa", ".config", "orbit-ai", ".mk");
const LEGACY_KEY_FILE = join(import.meta.dir, "..", ".encryption-key");

function getMasterKey(): Buffer {
  // Primary: read from the secure key file (outside repo, 0600)
  if (existsSync(MASTER_KEY_FILE)) {
    return Buffer.from(readFileSync(MASTER_KEY_FILE, "utf-8").trim(), "hex");
  }

  // Legacy fallback: old .encryption-key in broker dir (will be deleted after migration)
  if (existsSync(LEGACY_KEY_FILE)) {
    const key = Buffer.from(readFileSync(LEGACY_KEY_FILE, "utf-8").trim(), "hex");
    // Auto-migrate: copy to the secure location
    const dir = join(process.env.HOME || "/home/rowecasa", ".config", "orbit-ai");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(MASTER_KEY_FILE, key.toString("hex"), { mode: 0o600 });
    console.log(`[crypto] Migrated master key to ${MASTER_KEY_FILE}`);
    return key;
  }

  // First run — generate and save to secure location
  const key = randomBytes(32);
  const dir = join(process.env.HOME || "/home/rowecasa", ".config", "orbit-ai");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(MASTER_KEY_FILE, key.toString("hex"), { mode: 0o600 });
  console.log(`[crypto] Generated new master key at ${MASTER_KEY_FILE}`);
  return key;
}

const MASTER_KEY = getMasterKey();

/** Derive a per-user AES-256 key from the master key + userId. */
function deriveUserKey(userId: string): Buffer {
  return createHmac("sha256", MASTER_KEY).update(userId).digest();
}

// --- Per-user encrypt/decrypt (new API) ---

/** Encrypt a plaintext string with a per-user derived key. Returns "iv:ciphertext:tag" hex string. */
export function encrypt(plaintext: string, userId: string): string {
  const key = deriveUserKey(userId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

/** Decrypt an "iv:ciphertext:tag" hex string with a per-user derived key. */
export function decrypt(encoded: string, userId: string): string {
  const key = deriveUserKey(userId);
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }
  const [ivHex, encHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

// --- Legacy global key encrypt/decrypt (for migration only) ---

/** Decrypt using the old global key (no per-user derivation). Used only during migration. */
export function legacyDecrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }
  const [ivHex, encHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, MASTER_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

/** Check if a value looks like it's already encrypted (iv:ciphertext:tag hex format). */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  return parts.every((p) => /^[0-9a-f]+$/i.test(p));
}

/** Delete the legacy key file from disk if it exists. Call after migration is complete. */
export function removeLegacyKeyFile(): void {
  if (existsSync(LEGACY_KEY_FILE)) {
    unlinkSync(LEGACY_KEY_FILE);
    console.log("[crypto] Deleted legacy .encryption-key file from disk");
  }
}
