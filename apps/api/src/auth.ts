import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import type { Role, User } from "./domain.js";
import { getDb } from "./store.js";

export interface AuthedRequest extends Request {
  user?: User;
}

export function signToken(user: User) {
  return jwt.sign({ sub: user.id, clinicId: user.clinicId, role: user.role }, config.jwtSecret, {
    expiresIn: "12h",
  });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    const user = getDb().users.find((u) => u.id === payload.sub);
    if (!user) throw new Error("unknown user");
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (req.user && roles.includes(req.user.role)) return next();
    res.status(403).json({ error: "forbidden" });
  };
