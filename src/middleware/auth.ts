import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "../models/User";

type TokenPayload = {
  userId: string;
  role: UserRole;
};

export function protect(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "You need to be logged in" });
  }

  const token = header.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET as string;

    const payload = jwt.verify(token, secret) as TokenPayload;

    req.userId = payload.userId;
    req.userRole = payload.role;

    next();
  } catch {
    return res.status(401).json({ message: "Your session has expired" });
  }
}

export function identify(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next();
  }

  const token = header.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET as string;
    const payload = jwt.verify(token, secret) as TokenPayload;

    req.userId = payload.userId;
    req.userRole = payload.role;
  } catch {
  }

  next();
}

export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userRole) {
      return res.status(401).json({ message: "You need to be logged in" });
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res
        .status(403)
        .json({ message: "You do not have permission to do that" });
    }

    next();
  };
}
