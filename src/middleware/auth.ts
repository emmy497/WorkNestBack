import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "../models/User";

// The extra `req.userId` and `req.userRole` fields we set below are declared
// for TypeScript in src/types/express.d.ts.

// What we put inside the token when we signed it in authController.
type TokenPayload = {
  userId: string;
  role: UserRole;
};

// ===========================================================================
// AUTHENTICATION — "who are you?"
//
// Checks the token is present and real. If it is, we attach the user's id
// to the request so the next function can use it.
// ===========================================================================
export function protect(req: Request, res: Response, next: NextFunction) {
  // The frontend sends the token in a header that looks like:
  //   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    // 401 = "unauthenticated" — we don't know who you are.
    return res.status(401).json({ message: "You need to be logged in" });
  }

  // Cut off the word "Bearer " to get just the token itself.
  const token = header.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET as string;

    // verify() does two things: checks the signature is genuine
    // (nobody tampered with it), and checks it hasn't expired.
    const payload = jwt.verify(token, secret) as TokenPayload;

    // Hand these along to the actual route handler.
    req.userId = payload.userId;
    req.userRole = payload.role;

    // next() means "I'm done, carry on to the next function".
    // Forgetting to call it is the classic middleware bug — the request
    // just hangs forever with no error.
    next();
  } catch {
    // Bad signature, or expired.
    return res.status(401).json({ message: "Your session has expired" });
  }
}

// ===========================================================================
// AUTHORIZATION — "are you ALLOWED to do this?"
//
// Authentication is about identity. Authorization is about permission.
// A logged-in candidate is authenticated, but not authorized to post a job.
//
// Notice this returns a function. That is what lets us pass in the roles:
//   router.post("/jobs", protect, authorize("recruiter", "admin"), createJob)
// ===========================================================================
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // protect() must run first — it's what sets req.userRole.
    if (!req.userRole) {
      return res.status(401).json({ message: "You need to be logged in" });
    }

    if (!allowedRoles.includes(req.userRole)) {
      // 403 = "forbidden". Different from 401: we know exactly who you are,
      // you're just not allowed to do this.
      return res
        .status(403)
        .json({ message: "You do not have permission to do that" });
    }

    next();
  };
}
