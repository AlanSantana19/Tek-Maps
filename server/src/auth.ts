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

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: "missing_token" });
    return;
  }

  try {
    req.user = jwt.verify(token, config.JWT_SECRET) as AuthRequest["user"];
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}
