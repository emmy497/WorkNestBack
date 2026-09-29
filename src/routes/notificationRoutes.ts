import { Router } from "express";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/notificationController";
import { protect } from "../middleware/auth";

const router = Router();

// Every route here needs a logged-in user — a notification always belongs
// to somebody.
router.get("/", protect, getNotifications); //                 GET /api/notifications
router.patch("/read-all", protect, markAllNotificationsRead); // PATCH /api/notifications/read-all
router.patch("/:id/read", protect, markNotificationRead); //    PATCH /api/notifications/:id/read

export default router;
