import multer from "multer";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const storage = multer.memoryStorage();

export const uploadCvFile = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return callback(new Error("Only PDF or Word documents are allowed"));
    }
    callback(null, true);
  },
});

const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export const uploadLogoFile = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      return callback(new Error("Only PNG, JPEG, WEBP or SVG images are allowed"));
    }
    callback(null, true);
  },
});
