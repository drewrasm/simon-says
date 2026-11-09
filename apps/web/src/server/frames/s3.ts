import "server-only";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { FrameStore } from "./upload";

/** Runtime-only configuration; never import into capture code or client components. */
export function s3FrameStore(
  env: Readonly<Record<string, string | undefined>>,
): FrameStore {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`Missing ${name}`);
    return value;
  };
  const bucket = required("S3_BUCKET");
  const client = new S3Client({
    endpoint: required("S3_ENDPOINT"),
    region: required("S3_REGION"),
    credentials: {
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    maxAttempts: 3,
  });
  return {
    async put(key, bytes, mimeType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: mimeType,
        }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
    },
  };
}
