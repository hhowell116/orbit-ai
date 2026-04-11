import { SignJWT, jwtVerify } from "jose";
import type { Context, Next } from "hono";
import { db } from "./db";

const JWT_SECRET = new TextEncoder().encode(
  process.env.BROKER_JWT_SECRET || "dev-secret-change-in-production"
);
const JWT_EXPIRY = "24h";

export interface JWTPayload {
  sub: string; // user id
  username: string;
  display_name: string;
}

export async function createToken(user: {
  id: string;
  username: string;
  display_name: string;
}): Promise<string> {
  return new SignJWT({
    sub: user.id,
    username: user.username,
    display_name: user.display_name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as unknown as JWTPayload;
}

// Hono middleware: extracts JWT from Authorization header, sets user on context
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token);
    c.set("user", payload);

    // Update last_seen
    db.run("UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?", [
      payload.sub,
    ]);

    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}
