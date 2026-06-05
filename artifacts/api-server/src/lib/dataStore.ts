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
  isStub: boolean;
}

// RFC 4180-aware CSV line splitter. Required because file names in the
// dataset contain commas inside quoted fields (e.g. "20220316_For over
// 55 years, Jet Sanitation Service Corp. has be.pdf"). A naive
// line.split(",") shifts every column after the first internal comma —
// names truncate, sizes become 0, hasStub/isStub flip wrong.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    if (inQ) {
      if (c === '"') {
        if (line.charAt(i + 1) === '"') { buf += '"'; i++; }
        else { inQ = false; }
      } else { buf += c; }
    } else {
      if (c === ",") { out.push(buf); buf = ""; }
      else if (c === '"' && buf === "") { inQ = true; }
      else { buf += c; }
    }
  }
  out.push(buf);
  return out;
}

function parseYesNo(s: string | undefined): boolean {
  const v = s?.toLowerCase();
  return v === "true" || v === "1" || v === "yes";
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
    const parts = parseCsvLine(line);
    if (parts.length < 9) continue;
    const recordType = parts[0];
    if (!recordType || recordType === "record_type") continue;
    records.push({
      recordType,
      recordId: parts[1],
      recordName: parts[2],
      recordStatus: parts[3] ?? "",
      fileId: parts[4],
      fileName: parts[5],
      sizeBytes: parseInt(parts[6], 10) || 0,
      fileType: parts[7],
      hasStub: parseYesNo(parts[8]),
      // Column 10 (is_stub) was added 2026-06-05. Falls back to the old
      // HTMLDOC heuristic if the column is missing so older CSV uploads
      // don't break — but those uploads will mis-classify any
      // non-migration .html files.
      isStub: parts.length >= 10 ? parseYesNo(parts[9]) : parts[7] === "HTMLDOC",
    });
  }

  store.recordAttachments = records;
  store.recordAttachmentsLoaded = true;
  logger.info({ count: records.length }, "Record attachments loaded");
  return records.length;
}

/** Authoritative stub flag — keyed on the `is_stub` CSV column, not a
 *  fileType heuristic (which misfires on any plain .html file that isn't
 *  one of our migration stubs). */
function isStubFile(att: { isStub: boolean }): boolean {
  return att.isStub;
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
  const typeMap = new Map<string, { recordCount: Set<string>; fileCount: number; stubCount: number; missingStubCount: number; fileSizes: Map<string, number> }>();

  for (const att of store.recordAttachments) {
    if (!typeMap.has(att.recordType)) {
      typeMap.set(att.recordType, { recordCount: new Set(), fileCount: 0, stubCount: 0, missingStubCount: 0, fileSizes: new Map() });
    }
    const entry = typeMap.get(att.recordType)!;
    entry.recordCount.add(att.recordId);
    if (isStubFile(att)) continue;
    entry.fileCount++;
    if (!entry.fileSizes.has(att.fileId)) entry.fileSizes.set(att.fileId, att.sizeBytes);
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
      totalSizeBytes: Array.from(data.fileSizes.values()).reduce((s, n) => s + n, 0),
    }))
    .sort((a, b) => a.recordType.localeCompare(b.recordType));
}

export function getVerificationItems(opts: {
  recordType?: string;
  limit?: number;
  offset?: number;
}) {
  const { recordType, limit = 200, offset = 0 } = opts;

  let rows = store.recordAttachments.filter(
    (att) => !isStubFile(att) && !att.hasStub
  );

  if (recordType) {
    rows = rows.filter((r) => r.recordType === recordType);
  }

  rows.sort((a, b) => {
    const typeCmp = a.recordType.localeCompare(b.recordType);
    if (typeCmp !== 0) return typeCmp;
    const nameCmp = (a.recordName || a.recordId).localeCompare(b.recordName || b.recordId);
    if (nameCmp !== 0) return nameCmp;
    return a.fileName.localeCompare(b.fileName);
  });

  const total = rows.length;
  const items = rows.slice(offset, offset + limit).map((att) => ({
    recordType: att.recordType,
    recordId: att.recordId,
    recordName: att.recordName,
    recordStatus: att.recordStatus,
    fileId: att.fileId,
    fileName: att.fileName,
    sizeBytes: att.sizeBytes,
    fileType: att.fileType,
  }));

  return { items, total };
}

export function getRecords(opts: {
  recordType?: string;
  search?: string;
  stubStatus?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}) {
  const { recordType, search, stubStatus, sort, limit = 50, offset = 0 } = opts;

  const recordMap = new Map<string, { recordId: string; recordName: string; recordType: string; recordStatus: string; fileCount: number; stubCount: number; missingStubCount: number }>();

  for (const att of store.recordAttachments) {
    if (recordType && att.recordType !== recordType) continue;

    // Key by (recordType, recordId) — recordId alone is not globally
    // unique (a vendor and a customrecord_delivery can share an id).
    const key = att.recordType + "|" + att.recordId;
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

  if (sort === "missing_stubs_desc") {
    records.sort((a, b) => b.missingStubCount - a.missingStubCount);
  } else if (sort === "missing_stubs_asc") {
    records.sort((a, b) => a.missingStubCount - b.missingStubCount);
  } else if (sort === "record_name") {
    records.sort((a, b) => a.recordName.localeCompare(b.recordName));
  } else if (sort === "record_type") {
    records.sort((a, b) => a.recordType.localeCompare(b.recordType));
  }

  const total = records.length;
  const paginated = records.slice(offset, offset + limit);

  return { records: paginated, total };
}

// `recordId` is unique within a `recordType`, NOT globally (vendor 279727
// and customrecord_delivery 279727 are different records). Filtering by
// recordId alone merged files from unrelated records of different types.
export function getRecordFiles(recordType: string, recordId: string) {
  const attachments = store.recordAttachments.filter(
    (a) => a.recordType === recordType && a.recordId === recordId
  );
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

  // Count by (recordType, recordId) — same id under different types is
  // a different record.
  const recordKeys = new Set(store.recordAttachments.map((a) => a.recordType + "|" + a.recordId));
  const totalRecords = recordKeys.size;

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

  const fileSizeMap = new Map<string, number>();
  for (const att of store.recordAttachments) {
    if (isStubFile(att)) continue;
    if (!fileSizeMap.has(att.fileId)) fileSizeMap.set(att.fileId, att.sizeBytes);
  }
  const totalSizeBytes = Array.from(fileSizeMap.values()).reduce((s, n) => s + n, 0);

  return {
    totalFiles,
    totalRecords,
    totalRecordTypes,
    totalAttachments,
    filesWithStub,
    filesMissingStub,
    stubCoveragePercent,
    totalSizeBytes,
  };
}

export function getStubCoverageByType() {
  const typeMap = new Map<string, { fileSet: Map<string, boolean>; sizeMap: Map<string, number> }>();

  for (const att of store.recordAttachments) {
    if (isStubFile(att)) continue;
    if (!typeMap.has(att.recordType)) {
      typeMap.set(att.recordType, { fileSet: new Map(), sizeMap: new Map() });
    }
    const entry = typeMap.get(att.recordType)!;
    if (!entry.fileSet.has(att.fileId)) {
      entry.fileSet.set(att.fileId, att.hasStub);
      entry.sizeMap.set(att.fileId, att.sizeBytes);
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
      const totalSizeBytes = Array.from(data.sizeMap.values()).reduce((s, n) => s + n, 0);
      return { recordType, fileCount, stubCount, missingStubCount, coveragePercent, totalSizeBytes };
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
      const parts = parseCsvLine(line);
      if (parts.length < 9) return;
      const recordType = parts[0];
      if (!recordType || recordType === "record_type") return;
      records.push({
        recordType,
        recordId: parts[1],
        recordName: parts[2],
        recordStatus: parts[3] ?? "",
        fileId: parts[4],
        fileName: parts[5],
        sizeBytes: parseInt(parts[6], 10) || 0,
        fileType: parts[7],
        hasStub: parseYesNo(parts[8]),
        isStub: parts.length >= 10 ? parseYesNo(parts[9]) : parts[7] === "HTMLDOC",
      });
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
