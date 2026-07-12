import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Response } from "express";
import { randomUUID } from "crypto";
import type { Readable } from "stream";
import {
  ObjectAclPolicy,
  ObjectPermission,
  StorageObjectRef,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

/**
 * CLOUDFLARE R2 CONFIGURATION
 * ===========================
 * Replaces the Replit sidecar / external_account credential exchange with a
 * standard static-credential S3Client pointed at the R2 S3-compatible API.
 *
 * R2_ENDPOINT is expected to be the account-level endpoint, e.g.:
 *   https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
 * (no bucket name in the endpoint itself — the bucket is passed per-request
 * as R2_BUCKET_NAME). If R2_ENDPOINT isn't set for some reason, we fall back
 * to building it from R2_ACCOUNT_ID.
 *
 * `forcePathStyle: true` is required for R2: it makes the SDK address
 * objects as `<endpoint>/<bucket>/<key>` rather than
 * `<bucket>.<endpoint>/<key>`, which is what `normalizeObjectEntityPath()`
 * below assumes when parsing signed URLs back into `/objects/...` paths.
 */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "abibjobs";
const R2_ENDPOINT =
  process.env.R2_ENDPOINT ||
  (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

for (const [name, value] of Object.entries({
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
})) {
  if (!value) {
    throw new Error(
      `Missing required R2 environment variable: ${name}. ` +
        "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, " +
        "R2_BUCKET_NAME, and R2_ENDPOINT."
    );
  }
}

// The object storage client is used to interact with Cloudflare R2 via its
// S3-compatible API.
export const objectStorageClient = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
});

// The prefix under which private uploads live in the bucket. Previously this
// was derived from an env var (PRIVATE_OBJECT_DIR) because the Replit setup
// allowed an arbitrary bucket/subfolder combination. Since R2 uses one fixed
// bucket (R2_BUCKET_NAME) for this app, the "private directory" collapses to
// a constant top-level prefix. `getPrivateObjectDir()` is preserved as a
// method (rather than inlined) purely for API compatibility with any
// existing callers.
const PRIVATE_UPLOAD_PREFIX = "uploads";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Checks whether an object exists at the given key, using HeadObjectCommand.
async function objectExists(key: string): Promise<boolean> {
  try {
    await objectStorageClient.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })
    );
    return true;
  } catch (error: any) {
    if (
      error?.name === "NotFound" ||
      error?.$metadata?.httpStatusCode === 404
    ) {
      return false;
    }
    throw error;
  }
}

// The object storage service is used to interact with the object storage service.
// Public method names and shapes are preserved from the original GCS-backed
// implementation wherever possible. Where a signature had to change, it's
// called out in a comment on that method.
export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  // Preserved unchanged from the original — still env-driven, still throws
  // if unset. Not used by the current /api/uploads/request-url flow, but
  // kept in case other parts of the app rely on public object lookups.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Set the PUBLIC_OBJECT_SEARCH_PATHS " +
          "env var (comma-separated key prefixes within the R2 bucket)."
      );
    }
    return paths;
  }

  // Gets the private object directory (prefix) within the R2 bucket.
  //
  // SIGNATURE PRESERVED, BEHAVIOR CHANGED: previously read PRIVATE_OBJECT_DIR
  // from the environment (a GCS bucket-relative path). Now returns a fixed
  // constant since the app uses a single dedicated R2 bucket
  // (R2_BUCKET_NAME) with a static "uploads" prefix. No env var is consulted.
  getPrivateObjectDir(): string {
    return PRIVATE_UPLOAD_PREFIX;
  }

  // Search for a public object from the search paths.
  //
  // SIGNATURE CHANGED: returns `StorageObjectRef | null` instead of the GCS
  // `File | null`, since there is no GCS File type anymore. `StorageObjectRef`
  // is a minimal `{ key: string }` handle — see objectAcl.ts.
  async searchPublicObject(filePath: string): Promise<StorageObjectRef | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const key = `${searchPath.replace(/\/+$/, "")}/${filePath.replace(/^\/+/, "")}`;
      if (await objectExists(key)) {
        return { key };
      }
    }
    return null;
  }

  // Downloads an object to the response.
  //
  // SIGNATURE CHANGED: takes a `StorageObjectRef` (`{ key }`) instead of a
  // GCS `File`. Behavior (headers set, streaming, error handling) is
  // preserved as closely as possible.
  async downloadObject(
    objectFile: StorageObjectRef,
    res: Response,
    cacheTtlSec: number = 3600
  ) {
    try {
      // Get object metadata via HEAD.
      const head = await objectStorageClient.send(
        new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectFile.key })
      );

      // Get the ACL policy for the object (now a compatibility default —
      // see objectAcl.ts).
      const aclPolicy = await getObjectAclPolicy(objectFile);
      const isPublic = aclPolicy?.visibility === "public";

      // Set appropriate headers.
      res.set({
        "Content-Type": head.ContentType || "application/octet-stream",
        "Content-Length": String(head.ContentLength ?? 0),
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
      });

      // Stream the object body to the response.
      const getResult = await objectStorageClient.send(
        new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: objectFile.key })
      );
      const stream = getResult.Body as Readable;

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error: any) {
      if (
        error?.name === "NotFound" ||
        error?.$metadata?.httpStatusCode === 404
      ) {
        if (!res.headersSent) {
          res.status(404).json({ error: "Object not found" });
        }
        return;
      }
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Gets the upload URL for an object entity.
  //
  // Preserved unchanged in signature and return type (Promise<string>).
  // Internally: generates a UUID, builds the key `uploads/<uuid>` directly
  // (getPrivateObjectDir() already returns "uploads"), and signs a
  // PutObjectCommand via the R2 S3-compatible presigner instead of calling
  // the Replit sidecar.
  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const key = `${this.getPrivateObjectDir()}/${objectId}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    return getSignedUrl(objectStorageClient, command, { expiresIn: 900 });
  }

  // Gets the object entity file from the object path.
  //
  // SIGNATURE CHANGED: returns `Promise<StorageObjectRef>` instead of
  // `Promise<File>`. Logic is actually simpler than before: since the R2
  // bucket is fixed and the mapping is a direct
  // `/objects/uploads/<uuid>` -> `uploads/<uuid>` rename, there's no need to
  // re-parse a bucket name out of the path the way parseObjectPath() did for
  // GCS. Existence check now uses HeadObjectCommand; ObjectNotFoundError
  // behavior is preserved exactly.
  async getObjectEntityFile(objectPath: string): Promise<StorageObjectRef> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const key = objectPath.slice("/objects/".length);
    if (!key) {
      throw new ObjectNotFoundError();
    }

    if (!(await objectExists(key))) {
      throw new ObjectNotFoundError();
    }

    return { key };
  }

  // Normalizes a raw signed-upload-URL (or already-normalized path) into the
  // stable `/objects/uploads/<uuid>` form the rest of the app persists to
  // Postgres.
  //
  // BEHAVIOR CHANGED (host parsed): previously recognized
  // `https://storage.googleapis.com/...` URLs. Now recognizes R2's
  // path-style signed URLs, i.e.
  //   `${R2_ENDPOINT}/${R2_BUCKET_NAME}/uploads/<uuid>?X-Amz-...`
  // Anything that isn't a URL at all (e.g. an already-normalized
  // "/objects/..." path) is returned unchanged, preserving the original
  // passthrough behavior for non-GCS-looking input.
  normalizeObjectEntityPath(rawPath: string): string {
    let url: URL;
    try {
      url = new URL(rawPath);
    } catch {
      // Not a full URL — already a plain path (e.g. "/objects/uploads/xyz").
      return rawPath;
    }

    const endpointHost = new URL(R2_ENDPOINT!).host;
    if (url.host !== endpointHost) {
      return rawPath;
    }

    const bucketPrefix = `/${R2_BUCKET_NAME}/`;
    if (!url.pathname.startsWith(bucketPrefix)) {
      return url.pathname;
    }

    const key = url.pathname.slice(bucketPrefix.length);
    return `/objects/${key}`;
  }

  // Tries to set the ACL policy for the object entity and return the normalized path.
  //
  // Preserved unchanged. setObjectAclPolicy() is now a no-op internally (see
  // objectAcl.ts), but the call shape here — normalize, look up the object,
  // apply the policy, return the normalized path — is untouched so callers
  // don't need to change.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  // Checks if the user can access the object entity.
  //
  // SIGNATURE CHANGED (objectFile type only): now takes a `StorageObjectRef`
  // rather than a GCS `File`. Delegates to canAccessObject(), which now
  // defaults to allow — see the security note in objectAcl.ts.
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StorageObjectRef;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  // NEW: not present in the original GCS implementation, added for
  // completeness per the migration's requirement to use DeleteObjectCommand
  // "where appropriate." Nothing in the existing routes calls this yet — add
  // a route if/when the app needs to let users delete an uploaded object.
  async deleteObjectEntity(objectPath: string): Promise<void> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const key = objectPath.slice("/objects/".length);
    await objectStorageClient.send(
      new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })
    );
  }
}