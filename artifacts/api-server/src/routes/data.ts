import { Router, type IRouter } from "express";
import {
  parseAllFiles,
  parseRecordAttachments,
  getDataStatus,
  getRecordTypes,
  getRecords,
  getRecordFiles,
  getAllFiles,
  getDashboardSummary,
  getStubCoverageByType,
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
    rowCount = parseAllFiles(content);
  } else if (type === "record_attachments") {
    rowCount = parseRecordAttachments(content);
  } else {
    res.status(400).json({ error: "Invalid type. Must be 'all_files' or 'record_attachments'" });
    return;
  }

  res.json({ success: true, rowCount, type });
});

router.get("/data/status", async (_req, res): Promise<void> => {
  res.json(getDataStatus());
});

router.get("/data/record-types", async (_req, res): Promise<void> => {
  res.json(getRecordTypes());
});

router.get("/data/records", async (req, res): Promise<void> => {
  const parsed = ListRecordsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { recordType, search, stubStatus, limit, offset } = parsed.data;
  const result = getRecords({
    recordType: recordType ?? undefined,
    search: search ?? undefined,
    stubStatus: stubStatus ?? undefined,
    limit: limit ?? 50,
    offset: offset ?? 0,
  });

  res.json(result);
});

router.get("/data/records/:recordId/files", async (req, res): Promise<void> => {
  const params = GetRecordFilesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const files = getRecordFiles(params.data.recordId);
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
  const result = getAllFiles({
    folderId: folderId ?? undefined,
    search: search ?? undefined,
    stubStatus: stubStatus ?? undefined,
    limit: limit ?? 50,
    offset: offset ?? 0,
  });

  res.json(result);
});

router.get("/data/summary", async (_req, res): Promise<void> => {
  res.json(getDashboardSummary());
});

router.get("/data/stub-coverage", async (_req, res): Promise<void> => {
  res.json(getStubCoverageByType());
});

export default router;
