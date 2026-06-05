import { Router, type IRouter } from "express";
import { getNetsuiteStatus, isConfigured, queryStubStatusForRecordType } from "../lib/netsuite";
import { updateStubStatus, store } from "../lib/dataStore";
import { RefreshStubStatusBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/netsuite/status", async (_req, res): Promise<void> => {
  res.json(getNetsuiteStatus());
});

router.post("/netsuite/refresh-stubs", async (req, res): Promise<void> => {
  const parsed = RefreshStubStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!isConfigured()) {
    res.status(400).json({
      success: false,
      updated: 0,
      message: "NetSuite credentials not configured",
    });
    return;
  }

  const { recordType } = parsed.data;

  const fileIds = [
    ...new Set(
      store.recordAttachments
        .filter((a) => a.recordType === recordType)
        .map((a) => a.fileId)
    ),
  ];

  if (fileIds.length === 0) {
    res.json({
      success: true,
      updated: 0,
      message: `No files found for record type: ${recordType}`,
    });
    return;
  }

  try {
    const stubMap = await queryStubStatusForRecordType(recordType, fileIds);
    let updated = 0;
    for (const [fileId, hasStub] of stubMap.entries()) {
      updated += updateStubStatus(fileId, hasStub);
    }

    res.json({
      success: true,
      updated,
      message: `Refreshed stub status for ${fileIds.length} files in ${recordType} (${updated} records updated)`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      updated: 0,
      message: `Failed to refresh stub status: ${message}`,
    });
  }
});

export default router;
