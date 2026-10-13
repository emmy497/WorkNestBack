import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export function uploadBufferToCloudinary(
  buffer: Buffer,
  options: { folder: string; filename: string; resourceType?: "raw" | "image" }
): Promise<{ secureUrl: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: options.filename,
        resource_type: options.resourceType ?? "raw",
        overwrite: true,
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error("Cloudinary upload failed"));
        }
        resolve({ secureUrl: result.secure_url });
      }
    );

    uploadStream.end(buffer);
  });
}

export default cloudinary;
