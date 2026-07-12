import type { Express, RequestHandler } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

interface UploadIntent {
  userId: string;
  expiresAt: number;
}

/**
 * Register object storage routes for file uploads.
 *
 * Upload URL minting requires authentication — anonymous callers must not be
 * able to write arbitrary files into the application's private storage bucket.
 *
 * When a signed upload URL is issued, the requesting user's ID is recorded
 * in the shared uploadIntents map (keyed by object path). Routes that later
 * accept object paths (verification docs, dispute evidence) must validate that
 * an unconsumed intent exists for the submitted path and that it belongs to the
 * requesting user. This prevents one user from claiming another user's object
 * path and gaining unauthorized access or ACL ownership.
 *
 * Object serving is intentionally NOT registered here. The domain-aware
 * authorization check for private documents lives in the application's main
 * route file where it has access to storage, session context, and business-level
 * ownership rules.
 */
export function registerObjectStorageRoutes(
  app: Express,
  isAuthenticated: RequestHandler,
  uploadIntents: Map<string, UploadIntent>
): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   *
   * Requires authentication — only logged-in users may mint upload URLs.
   * Records an upload intent server-side (objectPath → userId) so that
   * subsequent persist routes can prove the submitter actually uploaded the file.
   *
   * Request body (JSON):
   * {
   *   "name": "filename.jpg",
   *   "size": 12345,
   *   "contentType": "image/jpeg"
   * }
   *
   * Response:
   * {
   *   "uploadURL": "https://<account>.r2.cloudflarestorage.com/...",
   *   "objectPath": "/objects/uploads/uuid"
   * }
   *
   * IMPORTANT: The client should NOT send the file to this endpoint.
   * Send JSON metadata only, then upload the file directly to uploadURL.
   */
  app.post("/api/uploads/request-url", isAuthenticated, async (req: any, res) => {
    try {
      const { name, size, contentType } = req.body;
      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }
      const userId: string =
        req.user?.claims?.sub || req.session?.manualUserId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      // Bind this object path to the requesting user for 30 minutes.
      // Persist routes must consume this intent before accepting the path.
      uploadIntents.set(objectPath, {
        userId,
        expiresAt: Date.now() + 30 * 60 * 1000,
      });
      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });
}