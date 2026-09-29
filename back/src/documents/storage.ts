import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { encryptionKey, env } from "../config/env.js";
import { decrypt, encrypt } from "./encryption.js";

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

export function storageKeyFor(applicationId: string, documentId: string): string {
  return `applications/${applicationId}/${documentId}`;
}

export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status !== 404) {
      throw error;
    }
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
  }
}

export async function putEncryptedObject(key: string, content: Buffer): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: encrypt(content, encryptionKey),
      ContentType: "application/octet-stream",
    }),
  );
}

export async function getDecryptedObject(key: string): Promise<Buffer> {
  const response = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  if (!response.Body) {
    throw new Error("Objet de stockage vide.");
  }
  const payload = Buffer.from(await response.Body.transformToByteArray());
  return decrypt(payload, encryptionKey);
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}
