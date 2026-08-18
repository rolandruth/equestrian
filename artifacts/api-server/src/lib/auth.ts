import crypto from "crypto";
import { db } from "@workspace/db";
import { sessions, users } from "@workspace/db";
import { eq, lt } from "drizzle-orm";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const inputHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return hash === inputHash;
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(userId: number, role: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await db.insert(sessions).values({ token, userId, role, expiresAt });
  // Clean up old expired sessions occasionally
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).catch(() => {});
  return token;
}

export async function getSession(token: string): Promise<{ userId: number; role: string } | null> {
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.token, token));
    return null;
  }
  // Always resolve the user's CURRENT role (not the role snapshotted at
  // login) so deleting a user or demoting their role takes effect
  // immediately instead of persisting for up to 30 days.
  const [user] = await db.select({ id: users.id, role: users.role }).from(users)
    .where(eq(users.id, session.userId)).limit(1);
  if (!user) {
    await db.delete(sessions).where(eq(sessions.token, token));
    return null;
  }
  return { userId: user.id, role: user.role };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}
