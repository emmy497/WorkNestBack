import { UserRole } from "../models/User";

// ---------------------------------------------------------------------------
// Our `protect` middleware adds two extra fields to the request object.
// TypeScript doesn't know about them, so we tell it here.
//
// This file has no runtime code — it only exists to teach the compiler.
// It lives on its own (rather than inside middleware/auth.ts) so that EVERY
// file gets these types, not just the ones that import the middleware.
// ---------------------------------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: UserRole;
    }
  }
}

// An empty export is what makes this file a module, which is required
// for `declare global` to work.
export {};
