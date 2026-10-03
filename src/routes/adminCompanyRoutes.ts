import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import {
  getCompanies,
  getClients,
  getClientDetail,
  createClient,
  updateClient,
  uploadClientLogo,
} from "../controllers/adminCompanyController";
import { uploadLogoFile } from "../middleware/upload";
import { protect, authorize } from "../middleware/auth";

const router = Router();

// Same wrapper idea as profileRoutes.ts's handleCvUpload — turns a bad
// upload (wrong type, too large) into a normal { message } JSON 400 instead
// of an unhandled exception.
function handleLogoUpload(req: Request, res: Response, next: NextFunction) {
  uploadLogoFile.single("logo")(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "That file is too large — 2MB max" });
      }
      return res.status(400).json({ message: error.message });
    }
    if (error) {
      return res.status(400).json({ message: (error as Error).message });
    }
    next();
  });
}

router.get("/", protect, authorize("admin", "recruiter"), getCompanies); // GET /api/admin/companies
router.get("/clients", protect, authorize("admin", "recruiter"), getClients); // GET /api/admin/companies/clients
router.get("/clients/:id", protect, authorize("admin", "recruiter"), getClientDetail); // GET /api/admin/companies/clients/:id
router.post("/clients", protect, authorize("admin", "recruiter"), createClient); // POST /api/admin/companies/clients
router.patch("/clients/:id", protect, authorize("admin", "recruiter"), updateClient); // PATCH /api/admin/companies/clients/:id
router.post(
  "/clients/logo",
  protect,
  authorize("admin", "recruiter"),
  handleLogoUpload,
  uploadClientLogo
); // POST /api/admin/companies/clients/logo

export default router;
