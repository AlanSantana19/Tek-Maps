import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export interface AuthRequest extends Request {
  user?: { sub: string; role: "admin" | "operator" | "viewer" };
}

export function signUserToken(user: { email: string; role: "admin" | "operator" | "viewer" }) {
  return jwt.sign({ sub: user.email, role: user.role }, config.JWT_SECRET, {
    expiresIn: "8h"
  });
}

export function signChallengeToken(user: { id: string; email: string; role: "admin" | "operator" | "viewer" }) {
  return jwt.sign({ sub: user.email, uid: user.id, role: user.role, totp_pending: true }, config.JWT_SECRET, {
    expiresIn: "5m"
  });
}

export function verifyChallengeToken(token: string): { sub: string; uid: string; role: "admin" | "operator" | "viewer" } | null {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as { sub: string; uid: string; role: "admin" | "operator" | "viewer"; totp_pending: boolean };
    if (!payload.totp_pending) return null;
    return { sub: payload.sub, uid: payload.uid, role: payload.role };
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: "missing_token" });
    return;
  }

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as AuthRequest["user"] & { totp_pending?: boolean };
    if (payload?.totp_pending) {
      res.status(401).json({ error: "totp_required" });
      return;
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}
