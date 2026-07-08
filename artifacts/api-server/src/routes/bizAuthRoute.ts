import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCurrentAuthUserResponse,
  BusinessSignupBody,
  BusinessLoginBody,
} from "@workspace/api-zod";
import { db, bizUsers } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getBizSessionId,
  createBizSession,
  clearBizSession,
  setBizSessionCookie,
  hashBizPassword,
  verifyBizPassword,
  type BizSessionData,
} from "../lib/bizAuth.js";

const router: IRouter = Router();

function toAuthUser(user: typeof bizUsers.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
  };
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isBizAuthenticated() ? req.bizUser : null,
    }),
  );
});

router.post("/business/signup", async (req: Request, res: Response) => {
  const parsed = BusinessSignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid signup details" });
    return;
  }
  const { email, password, firstName, lastName } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [existing] = await db
    .select()
    .from(bizUsers)
    .where(eq(bizUsers.email, normalizedEmail));
  if (existing) {
    res.status(400).json({ error: "An account with this email already exists" });
    return;
  }

  const [user] = await db
    .insert(bizUsers)
    .values({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      passwordHash: hashBizPassword(password),
      firstName: firstName ?? null,
      lastName: lastName ?? null,
    })
    .returning();

  const sessionData: BizSessionData = { user: toAuthUser(user) };
  const sid = await createBizSession(sessionData);
  setBizSessionCookie(res, sid);
  res.json(GetCurrentAuthUserResponse.parse({ user: sessionData.user }));
});

router.post("/business/login", async (req: Request, res: Response) => {
  const parsed = BusinessLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const normalizedEmail = parsed.data.email.trim().toLowerCase();

  const [user] = await db
    .select()
    .from(bizUsers)
    .where(eq(bizUsers.email, normalizedEmail));

  if (!user || !verifyBizPassword(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const sessionData: BizSessionData = { user: toAuthUser(user) };
  const sid = await createBizSession(sessionData);
  setBizSessionCookie(res, sid);
  res.json(GetCurrentAuthUserResponse.parse({ user: sessionData.user }));
});

router.post("/business/logout", async (req: Request, res: Response) => {
  const sid = getBizSessionId(req);
  await clearBizSession(res, sid);
  res.json({ success: true, message: null });
});

export default router;
