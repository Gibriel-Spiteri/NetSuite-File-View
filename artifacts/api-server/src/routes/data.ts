import { Router, type IRouter } from "express";
import {
  parseAllFiles,
  parseRecordAttachments,
  parseDeletionLog,
  clearDeletionLog,
  getDataStatus,
  getRecordTypes,
  getRecords,
  getRecordFiles,
  getAllFiles,
  getDashboardSummary,
  getStubCoverageByType,
  getVerificationItems,
  reloadDataFromDisk,
  getCompletion,
  getCompletionErrors,
} from "../lib/dataStore";
import {
  UploadDataBody,
  GetRecordFilesParams,
  ListRecordsQueryParams,
  ListAllFilesQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/data/upload", async (req, res): Promise<void> => {
  const parsed = UploadDataBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { type, content } = parsed.data;
  let rowCount = 0;

  if (type === "all_files") {
    rowCount = await parseAllFiles(content);
  } else if (type === "record_attachments") {
    rowCount = await parseRecordAttachments(content);
  } else if (type === "deletion_log") {
    const source = typeof (parsed.data as { source?: string }).source === "string"
      ? (parsed.data as { source?: string }).source!
      : `upload_${new Date().toISOString()}`;
    rowCount = parseDeletionLog(content, source);
  } else {
    res.status(400).json({ error: "Invalid type. Must be 'all_files', 'record_attachments', or 'deletion_log'" });
    return;
  }

  res.json({ success: true, rowCount, type });
});

router.post("/data/reload", async (_req, res): Promise<void> => {
  const result = await reloadDataFromDisk();
  res.json(result);
});

router.get("/data/status", async (_req, res): Promise<void> => {
  res.json(await getDataStatus());
});

router.get("/data/record-types", async (_req, res): Promise<void> => {
  res.json(await getRecordTypes());
});

router.get("/data/records", async (req, res): Promise<void> => {
  const parsed = ListRecordsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { recordType, search, stubStatus, sort, limit, offset } = parsed.data;
  const result = await getRecords({
    recordType: recordType ?? undefined,
    search: search ?? undefined,
    stubStatus: stubStatus ?? undefined,
    sort: sort ?? undefined,
    limit: limit ?? 50,
    offset: offset ?? 0,
  });

  res.json(result);
});

router.get("/data/records/:recordType/:recordId/files", async (req, res): Promise<void> => {
  const params = GetRecordFilesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const files = await getRecordFiles(params.data.recordType, params.data.recordId);
  if (files === null) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  res.json(files);
});

router.get("/data/files", async (req, res): Promise<void> => {
  const parsed = ListAllFilesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { folderId, search, stubStatus, limit, offset } = parsed.data;
  const result = await getAllFiles({
    folderId: folderId ?? undefined,
    search: search ?? undefined,
    stubStatus: stubStatus ?? undefined,
    limit: limit ?? 50,
    offset: offset ?? 0,
  });

  res.json(result);
});

router.get("/data/verification", async (req, res): Promise<void> => {
  const recordType = typeof req.query.recordType === "string" ? req.query.recordType : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 500;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
  res.json(await getVerificationItems({ recordType, limit, offset }));
});

router.get("/data/summary", async (_req, res): Promise<void> => {
  res.json(await getDashboardSummary());
});

router.get("/data/stub-coverage", async (_req, res): Promise<void> => {
  res.json(await getStubCoverageByType());
});

router.get("/data/completion", async (_req, res): Promise<void> => {
  res.json(await getCompletion());
});

router.get("/data/completion/errors", async (_req, res): Promise<void> => {
  res.json(await getCompletionErrors());
});

router.delete("/data/deletion-log", async (_req, res): Promise<void> => {
  clearDeletionLog();
  res.json({ success: true });
});

export default router;
