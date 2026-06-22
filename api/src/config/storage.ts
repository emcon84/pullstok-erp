// Cloudflare R2 storage (S3-compatible) for product images.
// Replaces the legacy local-disk multer storage.
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { randomUUID } from "crypto";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return _client;
}

const BUCKET = () => process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = () => process.env.R2_PUBLIC_URL!;

// MIME types that should NOT be converted to webp (keep as-is).
const SKIP_CONVERSION = new Set(["image/svg+xml", "image/gif"]);

/**
 * Uploads a raw buffer to R2 and returns its public URL.
 */
export async function uploadToR2(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: filename,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return `${PUBLIC_URL()}/${filename}`;
}

type MulterLikeFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

/**
 * Takes a multer (memoryStorage) file, optimizes it to webp via sharp
 * (skipping svg/gif), uploads it to R2 under a unique key prefixed with
 * `prefix`, and returns the public URL.
 *
 * Key shape: `${prefix}_<uuid>.webp` (or original extension when conversion is skipped).
 */
export async function uploadImageToR2(
  file: MulterLikeFile,
  prefix = "products"
): Promise<string> {
  const uuid = randomUUID();

  if (SKIP_CONVERSION.has(file.mimetype)) {
    const ext = file.mimetype === "image/svg+xml" ? "svg" : "gif";
    const filename = `${prefix}_${uuid}.${ext}`;
    return uploadToR2(file.buffer, filename, file.mimetype);
  }

  const optimized = await sharp(file.buffer)
    .resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const filename = `${prefix}_${uuid}.webp`;
  return uploadToR2(optimized, filename, "image/webp");
}
