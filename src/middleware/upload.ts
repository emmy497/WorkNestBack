import multer from "multer";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
];

// Memory storage — the file lives in RAM just long enough to hand it to
// Cloudinary, and is never written to disk on our own server.
const storage = multer.memoryStorage();

export const uploadCvFile = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB, matching what the UI tells the user
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
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB — a logo, not a photo library
  fileFilter(req, file, callback) {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      return callback(new Error("Only PNG, JPEG, WEBP or SVG images are allowed"));
    }
    callback(null, true);
  },
});
