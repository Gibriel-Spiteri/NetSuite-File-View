import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import { logger } from "./logger";

export interface AllFileRecord {
  fileId: string;
  fileName: string;
  folderId: string;
  folderName: string;
}

export interface RecordAttachment {
  recordType: string;
  recordId: string;
  recordName: string;
  recordStatus: string;
  fileId: string;
  fileName: string;
  sizeBytes: number;
  fileType: string;
  hasStub: boolean;
}

interface DataStore {
  allFiles: Map<string, AllFileRecord>;
  recordAttachments: RecordAttachment[];
  allFilesLoaded: boolean;
  recordAttachmentsLoaded: boolean;
}

const store: DataStore = {
  allFiles: new Map(),
  recordAttachments: [],
  allFilesLoaded: false,
  recordAttachmentsLoaded: false,
};

export function parseAllFiles(content: string): number {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const records: AllFileRecord[] = [];

  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length < 4) continue;
    const [fileId, fileName, folderId, folderName] = parts.map((p) => p.trim());
    if (!fileId || fileId === "fileId") continue;
    records.push({ fileId, fileName, folderId, folderName });
  }

  store.allFiles = new Map(records.map((r) => [r.fileId, r]));
  store.allFilesLoaded = true;
  logger.info({ count: records.length }, "All files loaded");
  return records.length;
}

export function parseRecordAttachments(content: string): number {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const records: RecordAttachment[] = [];

  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 9) continue;
    const [recordType, recordId, recordName, recordStatus, fileId, fileName, sizeBytesStr, fileType, hasStubStr] = parts.map((p) => p.trim());
    if (!recordType || recordType === "record_type") continue;
    const sizeBytes = parseInt(sizeBytesStr, 10) || 0;
    const norm = hasStubStr?.toLowerCase();
    const hasStub = norm === "true" || norm === "1" || norm === "yes";
    records.push({ recordType, recordId, recordName, recordStatus: recordStatus ?? "", fileId, fileName, sizeBytes, fileType, hasStub });
  }

  store.recordAttachments = records;
  store.recordAttachmentsLoaded = true;
  logger.info({ count: records.length }, "Record attachments loaded");
  return records.length;
}

/** Stub files (.html HTMLDOC) are the stubs themselves — exclude from coverage calculations */
function isStubFile(att: { fileType: string }): boolean {
  return att.fileType === "HTMLDOC";
}

export function getDataStatus() {
  return {
    allFilesLoaded: store.allFilesLoaded,
    recordAttachmentsLoaded: store.recordAttachmentsLoaded,
    allFilesCount: store.allFiles.size,
    recordAttachmentsCount: store.recordAttachments.length,
  };
}

export function getRecordTypes() {
  const typeMap = new Map<string, { recordCount: Set<string>; fileCount: number; stubCount: number; missingStubCount: number }>();

  for (const att of store.recordAttachments) {
    if (!typeMap.has(att.recordType)) {
      typeMap.set(att.recordType, { recordCount: new Set(), fileCount: 0, stubCount: 0, missingStubCount: 0 });
    }
    const entry = typeMap.get(att.recordType)!;
    entry.recordCount.add(att.recordId);
    if (isStubFile(att)) continue;
    entry.fileCount++;
    if (att.hasStub) {
      entry.stubCount++;
    } else {
      entry.missingStubCount++;
    }
  }

  return Array.from(typeMap.entries())
    .map(([recordType, data]) => ({
      recordType,
      recordCount: data.recordCount.size,
      fileCount: data.fileCount,
      stubCount: data.stubCount,
      missingStubCount: data.missingStubCount,
    }))
    .sort((a, b) => a.recordType.localeCompare(b.recordType));
}

export function getRecords(opts: {
  recordType?: string;
  search?: string;
  stubStatus?: string;
  limit?: number;
  offset?: number;
}) {
  const { recordType, search, stubStatus, limit = 50, offset = 0 } = opts;

  const recordMap = new Map<string, { recordId: string; recordName: string; recordType: string; recordStatus: string; fileCount: number; stubCount: number; missingStubCount: number }>();

  for (const att of store.recordAttachments) {
    if (recordType && att.recordType !== recordType) continue;

    const key = att.recordId;
    if (!recordMap.has(key)) {
      recordMap.set(key, {
        recordId: att.recordId,
        recordName: att.recordName,
        recordType: att.recordType,
        recordStatus: att.recordStatus,
        fileCount: 0,
        stubCount: 0,
        missingStubCount: 0,
      });
    }
    const entry = recordMap.get(key)!;
    // Keep the first non-empty status we see
    if (!entry.recordStatus && att.recordStatus) entry.recordStatus = att.recordStatus;
    if (isStubFile(att)) continue;
    entry.fileCount++;
    if (att.hasStub) {
      entry.stubCount++;
    } else {
      entry.missingStubCount++;
    }
  }

  let records = Array.from(recordMap.values());

  if (search) {
    const q = search.toLowerCase();
    records = records.filter(
      (r) => r.recordName.toLowerCase().includes(q) || r.recordId.toLowerCase().includes(q)
    );
  }

  if (stubStatus === "has_stub") {
    records = records.filter((r) => r.stubCount > 0 && r.missingStubCount === 0);
  } else if (stubStatus === "missing_stub") {
    records = records.filter((r) => r.missingStubCount > 0);
  }

  const total = records.length;
  const paginated = records.slice(offset, offset + limit);

  return { records: paginated, total };
}

export function getRecordFiles(recordId: string) {
  const attachments = store.recordAttachments.filter((a) => a.recordId === recordId);
  if (attachments.length === 0) return null;

  return attachments.map((att) => {
    const fileInfo = store.allFiles.get(att.fileId);
    const stubFileName = att.hasStub ? att.fileName.replace(/(\.[^.]+)$/, ".html") : null;
    return {
      fileId: att.fileId,
      fileName: att.fileName,
      fileType: att.fileType,
      sizeBytes: att.sizeBytes,
      hasStub: att.hasStub,
      isStubFile: isStubFile(att),
      stubFileName,
      folderId: fileInfo?.folderId ?? null,
      folderName: fileInfo?.folderName ?? null,
      recordStatus: att.recordStatus,
    };
  });
}

export function getAllFiles(opts: {
  folderId?: string;
  search?: string;
  stubStatus?: string;
  limit?: number;
  offset?: number;
}) {
  const { folderId, search, stubStatus, limit = 50, offset = 0 } = opts;

  const attachmentCountMap = new Map<string, number>();
  const stubMap = new Map<string, boolean>();

  for (const att of store.recordAttachments) {
    attachmentCountMap.set(att.fileId, (attachmentCountMap.get(att.fileId) ?? 0) + 1);
    if (!stubMap.has(att.fileId)) {
      stubMap.set(att.fileId, att.hasStub);
    } else if (att.hasStub) {
      stubMap.set(att.fileId, true);
    }
  }

  let files = Array.from(store.allFiles.values()).map((f) => ({
    fileId: f.fileId,
    fileName: f.fileName,
    folderId: f.folderId,
    folderName: f.folderName,
    fileType: f.fileName.includes(".") ? f.fileName.split(".").pop()!.toLowerCase() : "unknown",
    sizeBytes: 0,
    hasStub: stubMap.get(f.fileId) ?? false,
    attachedRecordCount: attachmentCountMap.get(f.fileId) ?? 0,
  }));

  if (folderId) {
    files = files.filter((f) => f.folderId === folderId);
  }

  if (search) {
    const q = search.toLowerCase();
    files = files.filter((f) => f.fileName.toLowerCase().includes(q) || f.fileId.includes(q));
  }

  if (stubStatus === "has_stub") {
    files = files.filter((f) => f.hasStub);
  } else if (stubStatus === "missing_stub") {
    files = files.filter((f) => !f.hasStub);
  }

  const total = files.length;
  const paginated = files.slice(offset, offset + limit);

  return { files: paginated, total };
}

export function getDashboardSummary() {
  const totalFiles = store.allFiles.size;
  const totalAttachments = store.recordAttachments.length;

  const recordIds = new Set(store.recordAttachments.map((a) => a.recordId));
  const totalRecords = recordIds.size;

  const recordTypes = new Set(store.recordAttachments.map((a) => a.recordType));
  const totalRecordTypes = recordTypes.size;

  // Exclude stub files themselves from coverage calculations
  const fileStubMap = new Map<string, boolean>();
  for (const att of store.recordAttachments) {
    if (isStubFile(att)) continue;
    if (!fileStubMap.has(att.fileId)) {
      fileStubMap.set(att.fileId, att.hasStub);
    } else if (att.hasStub) {
      fileStubMap.set(att.fileId, true);
    }
  }

  let stubFileCount = 0;
  for (const hasStub of fileStubMap.values()) {
    if (hasStub) stubFileCount++;
  }

  const filesWithStub = stubFileCount;
  const filesMissingStub = fileStubMap.size - filesWithStub;
  const stubCoveragePercent =
    fileStubMap.size > 0 ? Math.round((filesWithStub / fileStubMap.size) * 10000) / 100 : 0;

  return {
    totalFiles,
    totalRecords,
    totalRecordTypes,
    totalAttachments,
    filesWithStub,
    filesMissingStub,
    stubCoveragePercent,
  };
}

export function getStubCoverageByType() {
  const typeMap = new Map<string, { fileSet: Map<string, boolean> }>();

  for (const att of store.recordAttachments) {
    if (isStubFile(att)) continue;
    if (!typeMap.has(att.recordType)) {
      typeMap.set(att.recordType, { fileSet: new Map() });
    }
    const entry = typeMap.get(att.recordType)!;
    if (!entry.fileSet.has(att.fileId)) {
      entry.fileSet.set(att.fileId, att.hasStub);
    } else if (att.hasStub) {
      entry.fileSet.set(att.fileId, true);
    }
  }

  return Array.from(typeMap.entries())
    .map(([recordType, data]) => {
      const fileCount = data.fileSet.size;
      const stubCount = Array.from(data.fileSet.values()).filter(Boolean).length;
      const missingStubCount = fileCount - stubCount;
      const coveragePercent = fileCount > 0 ? Math.round((stubCount / fileCount) * 10000) / 100 : 0;
      return { recordType, fileCount, stubCount, missingStubCount, coveragePercent };
    })
    .sort((a, b) => b.fileCount - a.fileCount);
}

export function updateStubStatus(fileId: string, hasStub: boolean) {
  let updated = 0;
  for (const att of store.recordAttachments) {
    if (att.fileId === fileId) {
      att.hasStub = hasStub;
      updated++;
    }
  }
  return updated;
}

function streamParseAllFilesFromPath(filePath: string): Promise<AllFileRecord[]> {
  return new Promise((resolve, reject) => {
    const records: AllFileRecord[] = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    rl.on("line", (line) => {
      const parts = line.split("|");
      if (parts.length < 4) return;
      const [fileId, fileName, folderId, folderName] = parts.map((p) => p.trim());
      if (!fileId || fileId === "fileId") return;
      records.push({ fileId, fileName, folderId, folderName });
    });
    rl.on("close", () => resolve(records));
    rl.on("error", reject);
  });
}

function streamParseRecordAttachmentsFromPath(filePath: string): Promise<RecordAttachment[]> {
  return new Promise((resolve, reject) => {
    const records: RecordAttachment[] = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    rl.on("line", (line) => {
      const parts = line.split(",");
      if (parts.length < 9) return;
      const [recordType, recordId, recordName, recordStatus, fileId, fileName, sizeBytesStr, fileType, hasStubStr] = parts.map((p) => p.trim());
      if (!recordType || recordType === "record_type") return;
      const sizeBytes = parseInt(sizeBytesStr, 10) || 0;
      const norm = hasStubStr?.toLowerCase();
      const hasStub = norm === "true" || norm === "1" || norm === "yes";
      records.push({ recordType, recordId, recordName, recordStatus: recordStatus ?? "", fileId, fileName, sizeBytes, fileType, hasStub });
    });
    rl.on("close", () => resolve(records));
    rl.on("error", reject);
  });
}

export async function loadDataFromDisk(): Promise<void> {
  const dataDir = path.resolve(process.cwd(), "../../data");

  const allFilesGlob = fs.readdirSync(dataDir)
    .filter((f) => f.startsWith("all_files_") && f.endsWith(".txt"))
    .map((f) => path.join(dataDir, f))
    .sort();

  if (allFilesGlob.length > 0) {
    logger.info({ parts: allFilesGlob.length }, "Loading all_files from disk...");
    const allParts = await Promise.all(allFilesGlob.map(streamParseAllFilesFromPath));
    const combined = allParts.flat();
    store.allFiles = new Map(combined.map((r) => [r.fileId, r]));
    store.allFilesLoaded = true;
    logger.info({ count: store.allFiles.size }, "all_files loaded from disk");
  }

  const attachmentParts = fs.readdirSync(dataDir)
    .filter((f) => f.startsWith("record-attachments") && f.endsWith(".csv"))
    .map((f) => path.join(dataDir, f))
    .sort();

  if (attachmentParts.length > 0) {
    logger.info({ parts: attachmentParts.length }, "Loading record-attachments from disk...");
    const allParts = await Promise.all(attachmentParts.map(streamParseRecordAttachmentsFromPath));
    store.recordAttachments = allParts.flat();
    store.recordAttachmentsLoaded = true;
    logger.info({ count: store.recordAttachments.length }, "record-attachments loaded from disk");
  }
}

export { store };
