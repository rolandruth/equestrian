import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import { clearBizSession, getBizSessionId, getBizSession } from "../lib/bizAuth.js";

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

  req.bizUser = session.user;
  next();
}
