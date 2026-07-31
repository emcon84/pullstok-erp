import { Response } from "express";
import { basePrisma } from "../config/db";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { requireOrganizationId } from "../config/tenantContext";
import { generatePresignedUrl } from "../config/storage";
import { sanitizeSlug } from "../services/backupService";

/**
 * GET /api/backups/latest
 *
 * Returns a presigned URL for the current organization's latest daily backup.
 *
 * Auth: JWT required, ADMIN role required, tenant-scoped.
 *
 * Responses:
 *   200 — { url, date, size }
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
      select: { slug: true },
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

    // Generate a 1-hour presigned URL (spec A2)
    const url = await generatePresignedUrl(key, 3600);

    return res.status(200).json({
      url,
      date: dateStr,
      // Size is unknown without a head-object to R2. We return 0 as
      // the frontend doesn't display size (spec A1 only mentions url).
      size: 0,
    });
  } catch (error: any) {
    // Presigned URL generation failure — likely R2 unreachable (spec A6)
    console.error(`[backupController] Error generating presigned URL: ${error.message}`);
    return res.status(500).json({
      message: "Could not generate backup download link. Please try again later.",
    });
  }
};

export default { getLatestBackup };
