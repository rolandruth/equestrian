import * as client from "openid-client";
import crypto from "crypto";
import { type Request, type Response } from "express";
import { db, bizSessions } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthUser } from "@workspace/api-zod";

export const ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc";
export const BIZ_SESSION_COOKIE = "biz_sid";
export const BIZ_SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export interface BizSessionData {
  user: AuthUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

let oidcConfig: client.Configuration | null = null;

export async function getBizOidcConfig(): Promise<client.Configuration> {
  if (!oidcConfig) {
    oidcConfig = await client.discovery(
      new URL(ISSUER_URL),
      process.env.REPL_ID!,
    );
  }
  return oidcConfig;
}

export async function createBizSession(data: BizSessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(bizSessions).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + BIZ_SESSION_TTL),
  });
  return sid;
}

export async function getBizSession(sid: string): Promise<BizSessionData | null> {
  const [row] = await db
    .select()
    .from(bizSessions)
    .where(eq(bizSessions.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteBizSession(sid);
    return null;
  }

  return row.sess as unknown as BizSessionData;
}

export async function updateBizSession(
  sid: string,
  data: BizSessionData,
): Promise<void> {
  await db
    .update(bizSessions)
    .set({
      sess: data as unknown as Record<string, unknown>,
      expire: new Date(Date.now() + BIZ_SESSION_TTL),
    })
    .where(eq(bizSessions.sid, sid));
}

export async function deleteBizSession(sid: string): Promise<void> {
  await db.delete(bizSessions).where(eq(bizSessions.sid, sid));
}

export async function clearBizSession(
  res: Response,
  sid?: string,
): Promise<void> {
  if (sid) await deleteBizSession(sid);
  res.clearCookie(BIZ_SESSION_COOKIE, { path: "/" });
}

// Business-owner sessions are always resolved from the dedicated `biz_sid`
// cookie, never from the `Authorization` header. The frontend's shared API
// client always attaches a Bearer token for staff (admin/editor/viewer)
// auth whenever one exists in localStorage, completely independent of
// whether the current user is signed in as a business owner. If this
// function preferred that header, a browser holding a stale/valid staff
// token would have its business session hijacked/cleared on every request,
// breaking the "fully separate" auth requirement. Bearer tokens are simply
// not part of the business-auth contract.
export function getBizSessionId(req: Request): string | undefined {
  return req.cookies?.[BIZ_SESSION_COOKIE];
}
