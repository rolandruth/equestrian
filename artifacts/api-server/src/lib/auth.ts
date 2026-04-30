import crypto from "crypto";

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

const sessions = new Map<string, { userId: number; role: string; expiresAt: Date }>();

export function createSession(userId: number, role: string): string {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  sessions.set(token, { userId, role, expiresAt });
  return token;
}

export function getSession(token: string): { userId: number; role: string } | null {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    sessions.delete(token);
    return null;
  }
  return { userId: session.userId, role: session.role };
}

export function deleteSession(token: string): void {
  sessions.delete(token);
}
