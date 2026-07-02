import * as oidc from "openid-client";
import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import {
  clearBizSession,
  getBizOidcConfig,
  getBizSessionId,
  getBizSession,
  updateBizSession,
  type BizSessionData,
} from "../lib/bizAuth.js";

declare global {
  namespace Express {
    interface BizUser extends AuthUser {}

    interface Request {
      isBizAuthenticated(): this is BizAuthedRequest;

      bizUser?: BizUser | undefined;
    }

    export interface BizAuthedRequest {
      bizUser: BizUser;
    }
  }
}

async function refreshIfExpired(
  sid: string,
  session: BizSessionData,
): Promise<BizSessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  if (!session.refresh_token) return null;

  try {
    const config = await getBizOidcConfig();
    const tokens = await oidc.refreshTokenGrant(
      config,
      session.refresh_token,
    );
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateBizSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

export async function bizAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isBizAuthenticated = function (this: Request) {
    return this.bizUser != null;
  } as Request["isBizAuthenticated"];

  const sid = getBizSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getBizSession(sid);
  if (!session?.user?.id) {
    await clearBizSession(res, sid);
    next();
    return;
  }

  const refreshed = await refreshIfExpired(sid, session);
  if (!refreshed) {
    await clearBizSession(res, sid);
    next();
    return;
  }

  req.bizUser = refreshed.user;
  next();
}
