import { Response } from "express";
import { basePrisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { requireOrganizationId } from "../config/tenantContext";
import { downloadFromR2 } from "../config/storage";
import { sanitizeSlug } from "../services/backupService";

/**
 * GET /api/backups/latest
 *
 * Streams the current organization's latest daily backup directly from R2.
 *
 * Auth: JWT required, ADMIN role required, tenant-scoped.
 *
 * Responses:
 *   200 — file download (Content-Disposition: attachment)
 *   401 — No token / invalid token
 *   403 — Not ADMIN
 *   404 — No backup found for today
 *   500 — R2 unreachable or other error
 */
export const getLatestBackup = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();

    // Get org slug
    const org = await basePrisma.organization.findUnique({
      where: { id: organizationId },
      select: { slug: true, name: true },
    });

    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    const safeSlug = sanitizeSlug(org.slug);
    const today = new Date();
    const dateStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    const key = `backups/${safeSlug}/${dateStr}.sql.gz`;

    // Download from R2 and stream to client
    const { body, contentType, contentLength } = await downloadFromR2(key);

    const filename = `${safeSlug}-${dateStr}.sql.gz`;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", contentLength);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(body);
  } catch (error: any) {
    if (error.name === "NoSuchKey" || error.Code === "NoSuchKey") {
      return res.status(404).json({ message: "No backup available for today." });
    }
    console.error(`[backupController] Error downloading backup: ${error.message}`);
    return res.status(500).json({
      message: "Could not download backup. Please try again later.",
    });
  }
};

export default { getLatestBackup };
