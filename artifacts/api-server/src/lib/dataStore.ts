import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import { db, pool, allFilesTable, recordAttachmentsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export interface AllFileRecord {
  fileId: string;
  fileName: string;
  folderId: string;
  folderName: string;
  createdDate: string | null;
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

const BATCH_SIZE = 500;

// ── Simple in-memory cache ──────────────────────────────────────────────────
type CacheEntry<T> = { value: T; ts: number };
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache: {
  summary?: CacheEntry<Awaited<ReturnType<typeof _getDashboardSummary>>>;
  coverage?: CacheEntry<Awaited<ReturnType<typeof _getStubCoverageByType>>>;
  recordTypes?: CacheEntry<Awaited<ReturnType<typeof _getRecordTypes>>>;
} = {};

export function invalidateSummaryCache() {
  delete cache.summary;
  delete cache.coverage;
  delete cache.recordTypes;
}

// ── Deletion log (in-memory, uploaded by user) ───────────────────────────────
// Not persisted in the DB — cleared on server restart (intentional).
export type DeletionStatus =
  | "deleted"
  | "already_deleted"
  | "protected_stub_deleted"
  | "protected_no_stub"
  | "error:protected_stub_refused"
  | "error:protected_stub_error"
  | "error:delete"
  | "error:bad_row"
  | string;

const deletionLog = new Map<string, DeletionStatus>();
const deletionLogSources: string[] = [];

// Statuses that count as "file is gone from cabinet" for Phase 3 progress.
const DELETED_STATUSES = new Set<string>(["deleted", "already_deleted"]);
const PROTECTED_STATUSES = new Set<string>([
  "protected_stub_deleted",
  "protected_no_stub",
  "error:protected_stub_refused",
  "error:protected_stub_error",
]);

async function upsertAllFiles(records: AllFileRecord[]): Promise<void> {
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await db
      .insert(allFilesTable)
      .values(
        batch.map((r) => ({
          fileId: r.fileId,
          fileName: r.fileName,
          folderId: r.folderId,
          folderName: r.folderName,
        })),
      )
      .onConflictDoUpdate({
        target: allFilesTable.fileId,
        set: {
          fileName: sql`excluded.file_name`,
          folderId: sql`excluded.folder_id`,
          folderName: sql`excluded.folder_name`,
        },
      });
  }
  invalidateSummaryCache();
}

async function upsertRecordAttachments(records: RecordAttachment[]): Promise<void> {
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await db
      .insert(recordAttachmentsTable)
      .values(
        batch.map((r) => ({
          recordType: r.recordType,
          recordId: r.recordId,
          recordName: r.recordName,
          recordStatus: r.recordStatus,
          fileId: r.fileId,
          fileName: r.fileName,
          sizeBytes: r.sizeBytes,
          fileType: r.fileType,
          hasStub: r.hasStub,
        })),
      )
      .onConflictDoUpdate({
        target: [recordAttachmentsTable.recordId, recordAttachmentsTable.fileId],
        set: {
          recordType: sql`excluded.record_type`,
          recordName: sql`excluded.record_name`,
          recordStatus: sql`excluded.record_status`,
          fileName: sql`excluded.file_name`,
          sizeBytes: sql`excluded.size_bytes`,
          fileType: sql`excluded.file_type`,
          hasStub: sql`excluded.has_stub`,
        },
      });
  }
  invalidateSummaryCache();
}

function parseAllFilesContent(content: string): AllFileRecord[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const records: AllFileRecord[] = [];
  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length < 4) continue;
    const [fileId, fileName, folderId, folderName, createdDateRaw] = parts.map((p) => p.trim());
    if (!fileId || fileId === "fileId") continue;
    // createddate column was added 2026-06-08. Older dumps without it
    // still parse — createdDate just lands as null.
    const createdDate = parts.length >= 5 && createdDateRaw ? createdDateRaw : null;
    records.push({ fileId, fileName, folderId, folderName, createdDate });
  }
  return records;
}

function parseRecordAttachmentsContent(content: string): RecordAttachment[] {
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
  return records;
}

export async function parseAllFiles(content: string): Promise<number> {
  const records = parseAllFilesContent(content);
  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE all_files CASCADE`);
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await tx.insert(allFilesTable).values(
        batch.map((r) => ({
          fileId: r.fileId,
          fileName: r.fileName,
          folderId: r.folderId,
          folderName: r.folderName,
        })),
      );
    }
  });
  logger.info({ count: records.length }, "All files loaded into DB");
  return records.length;
}

export async function parseRecordAttachments(content: string): Promise<number> {
  const records = parseRecordAttachmentsContent(content);
  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE record_attachments`);
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await tx.insert(recordAttachmentsTable).values(
        batch.map((r) => ({
          recordType: r.recordType,
          recordId: r.recordId,
          recordName: r.recordName,
          recordStatus: r.recordStatus,
          fileId: r.fileId,
          fileName: r.fileName,
          sizeBytes: r.sizeBytes,
          fileType: r.fileType,
          hasStub: r.hasStub,
        })),
      );
    }
  });
  logger.info({ count: records.length }, "Record attachments loaded into DB");
  return records.length;
}

export function parseDeletionLog(content: string, source: string): number {
  const lines = content.split(/\r?\n/);
  let added = 0;
  let first = true;
  for (const line of lines) {
    if (!line) continue;
    if (first) {
      first = false;
      if (line.startsWith("fileId|")) continue;
    }
    const i = line.indexOf("|");
    if (i < 0) continue;
    const fileId = line.substring(0, i).trim();
    const status = line.substring(i + 1).trim();
    if (!fileId || !/^\d+$/.test(fileId)) continue;
    deletionLog.set(fileId, status);
    added++;
  }
  if (source && !deletionLogSources.includes(source)) {
    deletionLogSources.push(source);
  }
  logger.info({ source, added, totalEntries: deletionLog.size }, "Deletion log merged");
  return added;
}

export function clearDeletionLog(): void {
  deletionLog.clear();
  deletionLogSources.length = 0;
  logger.info("Deletion log cleared");
}

export async function getDataStatus() {
  const [filesRes, attachmentsRes] = await Promise.all([
    pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM all_files"),
    pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM record_attachments"),
  ]);
  const allFilesCount = parseInt(filesRes.rows[0]?.count ?? "0", 10);
  const recordAttachmentsCount = parseInt(attachmentsRes.rows[0]?.count ?? "0", 10);
  return {
    allFilesLoaded: allFilesCount > 0,
    recordAttachmentsLoaded: recordAttachmentsCount > 0,
    allFilesCount,
    recordAttachmentsCount,
  };
}

async function _getRecordTypes() {
  const result = await pool.query<{
    record_type: string;
    record_count: string;
    file_count: string;
    stub_count: string;
    missing_stub_count: string;
    total_size_bytes: string;
  }>(`
    WITH file_sizes AS (
      SELECT record_type, file_id, MAX(size_bytes) AS size_bytes
      FROM record_attachments
      WHERE file_type != 'HTMLDOC'
      GROUP BY record_type, file_id
    ),
    type_sizes AS (
      SELECT record_type, COALESCE(SUM(size_bytes), 0) AS total_size_bytes
      FROM file_sizes
      GROUP BY record_type
    )
    SELECT
      ra.record_type,
      COUNT(DISTINCT ra.record_id) AS record_count,
      COUNT(CASE WHEN ra.file_type != 'HTMLDOC' THEN 1 END) AS file_count,
      SUM(CASE WHEN ra.file_type != 'HTMLDOC' AND ra.has_stub THEN 1 ELSE 0 END) AS stub_count,
      SUM(CASE WHEN ra.file_type != 'HTMLDOC' AND NOT ra.has_stub THEN 1 ELSE 0 END) AS missing_stub_count,
      COALESCE(ts.total_size_bytes, 0) AS total_size_bytes
    FROM record_attachments ra
    LEFT JOIN type_sizes ts ON ra.record_type = ts.record_type
    GROUP BY ra.record_type, ts.total_size_bytes
    ORDER BY ra.record_type
  `);

  return result.rows.map((row) => ({
    recordType: row.record_type,
    recordCount: parseInt(row.record_count, 10),
    fileCount: parseInt(row.file_count, 10),
    stubCount: parseInt(row.stub_count, 10),
    missingStubCount: parseInt(row.missing_stub_count, 10),
    totalSizeBytes: parseInt(row.total_size_bytes, 10),
  }));
}

export async function getRecordTypes() {
  const now = Date.now();
  if (cache.recordTypes && now - cache.recordTypes.ts < CACHE_TTL_MS) {
    return cache.recordTypes.value;
  }
  const value = await _getRecordTypes();
  cache.recordTypes = { value, ts: now };
  return value;
}

export async function getVerificationItems(opts: {
  recordType?: string;
  limit?: number;
  offset?: number;
}) {
  const { recordType, limit = 200, offset = 0 } = opts;

  const [itemsRes, countRes] = await Promise.all([
    pool.query<{
      record_type: string;
      record_id: string;
      record_name: string;
      record_status: string;
      file_id: string;
      file_name: string;
      size_bytes: number;
      file_type: string;
    }>(
      `SELECT record_type, record_id, record_name, record_status, file_id, file_name, size_bytes, file_type
       FROM record_attachments
       WHERE file_type != 'HTMLDOC'
         AND has_stub = false
         AND ($1::text IS NULL OR record_type = $1)
       ORDER BY record_type ASC,
                COALESCE(NULLIF(record_name, ''), record_id) ASC,
                file_name ASC
       LIMIT $2 OFFSET $3`,
      [recordType ?? null, limit, offset],
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM record_attachments
       WHERE file_type != 'HTMLDOC'
         AND has_stub = false
         AND ($1::text IS NULL OR record_type = $1)`,
      [recordType ?? null],
    ),
  ]);

  return {
    items: itemsRes.rows.map((r) => ({
      recordType: r.record_type,
      recordId: r.record_id,
      recordName: r.record_name,
      recordStatus: r.record_status,
      fileId: r.file_id,
      fileName: r.file_name,
      sizeBytes: r.size_bytes,
      fileType: r.file_type,
    })),
    total: parseInt(countRes.rows[0]?.total ?? "0", 10),
  };
}

const ALLOWED_SORTS: Record<string, string> = {
  missing_stubs_desc: "missing_stub_count DESC",
  missing_stubs_asc: "missing_stub_count ASC",
  record_name: "record_name ASC",
  record_type: "record_type ASC",
};

export async function getRecords(opts: {
  recordType?: string;
  search?: string;
  stubStatus?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}) {
  const { recordType, search, sort, limit = 50, offset = 0 } = opts;
  const stubStatus = opts.stubStatus === "all" ? null : (opts.stubStatus ?? null);

  const orderBy = (sort && ALLOWED_SORTS[sort]) ?? "record_name ASC";

  const result = await pool.query<{
    record_id: string;
    record_name: string;
    record_type: string;
    record_status: string;
    file_count: string;
    stub_count: string;
    missing_stub_count: string;
    total_count: string;
  }>(
    `WITH record_stats AS (
      SELECT
        record_id,
        MAX(record_name) AS record_name,
        MAX(record_type) AS record_type,
        COALESCE(MIN(NULLIF(record_status, '')), '') AS record_status,
        COUNT(CASE WHEN file_type != 'HTMLDOC' THEN 1 END) AS file_count,
        SUM(CASE WHEN file_type != 'HTMLDOC' AND has_stub THEN 1 ELSE 0 END) AS stub_count,
        SUM(CASE WHEN file_type != 'HTMLDOC' AND NOT has_stub THEN 1 ELSE 0 END) AS missing_stub_count
      FROM record_attachments
      WHERE ($1::text IS NULL OR record_type = $1)
      GROUP BY record_id
    ),
    filtered AS (
      SELECT *
      FROM record_stats
      WHERE ($2::text IS NULL OR record_name ILIKE '%' || $2 || '%' OR record_id ILIKE '%' || $2 || '%')
        AND (
          $3::text IS NULL
          OR ($3 = 'has_stub' AND stub_count > 0 AND missing_stub_count = 0)
          OR ($3 = 'missing_stub' AND missing_stub_count > 0)
        )
    )
    SELECT *, COUNT(*) OVER() AS total_count
    FROM filtered
    ORDER BY ${orderBy}
    LIMIT $4 OFFSET $5`,
    [recordType ?? null, search ?? null, stubStatus ?? null, limit, offset],
  );

  const total = result.rows.length > 0 ? parseInt(result.rows[0]!.total_count, 10) : 0;

  return {
    records: result.rows.map((r) => ({
      recordId: r.record_id,
      recordName: r.record_name,
      recordType: r.record_type,
      recordStatus: r.record_status,
      fileCount: parseInt(r.file_count, 10),
      stubCount: parseInt(r.stub_count, 10),
      missingStubCount: parseInt(r.missing_stub_count, 10),
    })),
    total,
  };
}

// `recordId` is unique within a `recordType`, NOT globally (vendor 279727
// and customrecord_delivery 279727 are different records). Filter by both.
export async function getRecordFiles(recordType: string, recordId: string) {
  const result = await pool.query<{
    file_id: string;
    file_name: string;
    file_type: string;
    size_bytes: number;
    has_stub: boolean;
    record_status: string;
    folder_id: string | null;
    folder_name: string | null;
  }>(
    `SELECT ra.file_id, ra.file_name, ra.file_type, ra.size_bytes, ra.has_stub, ra.record_status,
            af.folder_id, af.folder_name
     FROM record_attachments ra
     LEFT JOIN all_files af ON ra.file_id = af.file_id
     WHERE ra.record_type = $1 AND ra.record_id = $2`,
    [recordType, recordId],
  );

  if (result.rows.length === 0) return null;

  return result.rows.map((r) => {
    const isStubFile = r.file_type === "HTMLDOC";
    const stubFileName = r.has_stub ? r.file_name.replace(/(\.[^.]+)$/, ".html") : null;
    return {
      fileId: r.file_id,
      fileName: r.file_name,
      fileType: r.file_type,
      sizeBytes: Number(r.size_bytes) || 0,
      hasStub: r.has_stub,
      isStubFile,
      stubFileName,
      folderId: r.folder_id ?? null,
      folderName: r.folder_name ?? null,
      recordStatus: r.record_status,
    };
  });
}

export async function getFileRecords(fileId: string) {
  const result = await pool.query<{
    record_type: string;
    record_id: string;
    record_name: string;
    record_status: string;
  }>(
    `SELECT DISTINCT record_type, record_id, record_name, record_status
     FROM record_attachments
     WHERE file_id = $1
     ORDER BY record_type, record_id`,
    [fileId],
  );
  return result.rows.map((r) => ({
    recordType: r.record_type,
    recordId: r.record_id,
    recordName: r.record_name,
    recordStatus: r.record_status,
  }));
}

export async function getAllFiles(opts: {
  folderId?: string;
  search?: string;
  stubStatus?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}) {
  const { folderId, search, sort, limit = 50, offset = 0 } = opts;
  const stubStatus = opts.stubStatus === "all" ? null : (opts.stubStatus ?? null);
  const sortByRecords = sort === "records_desc" || sort === "records_asc";

  // ORDER BY without any table alias — safe to use in subqueries and CTEs
  const sortExpr = sort === "file_id_desc" ? "CAST(file_id AS BIGINT) DESC"
    : sort === "file_id_asc" ? "CAST(file_id AS BIGINT) ASC"
    : sort === "records_desc" ? "attached_record_count DESC, file_name"
    : sort === "records_asc" ? "attached_record_count ASC, file_name"
    : "file_name";

  // Fast path: no stub filter AND no records sort.
  // Paginates all_files first, then joins only the current page — avoids a 2M-row HashAggregate.
  if (stubStatus === null && !sortByRecords) {
    const baseParams: (string | number | null)[] = [folderId ?? null, search ?? null];
    const whereClause = `
      ($1::text IS NULL OR folder_id = $1)
      AND ($2::text IS NULL OR file_name ILIKE '%' || $2 || '%' OR file_id ILIKE '%' || $2 || '%')`;
    // Outer query alias prefix is safe here because af comes from the subquery alias
    const outerSortExpr = sort === "file_id_desc" ? "CAST(af.file_id AS BIGINT) DESC"
      : sort === "file_id_asc" ? "CAST(af.file_id AS BIGINT) ASC"
      : "af.file_name";

    const [countResult, pageResult] = await Promise.all([
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM all_files WHERE ${whereClause}`,
        baseParams,
      ),
      pool.query<{
        file_id: string;
        file_name: string;
        folder_id: string;
        folder_name: string;
        size_bytes: string;
        has_stub: boolean;
        attached_record_count: string;
      }>(
        `SELECT
          af.file_id, af.file_name, af.folder_id, af.folder_name,
          COALESCE(MAX(ra.size_bytes), 0) AS size_bytes,
          BOOL_OR(COALESCE(ra.has_stub, false)) AS has_stub,
          COUNT(ra.record_id) AS attached_record_count
        FROM (
          SELECT file_id, file_name, folder_id, folder_name
          FROM all_files
          WHERE ${whereClause}
          ORDER BY ${sortExpr}
          LIMIT $3 OFFSET $4
        ) af
        LEFT JOIN record_attachments ra ON af.file_id = ra.file_id
        GROUP BY af.file_id, af.file_name, af.folder_id, af.folder_name
        ORDER BY ${outerSortExpr}`,
        [...baseParams, limit, offset],
      ),
    ]);

    const total = parseInt(countResult.rows[0]?.total ?? "0", 10);
    return {
      files: pageResult.rows.map((r) => ({
        fileId: r.file_id,
        fileName: r.file_name,
        folderId: r.folder_id,
        folderName: r.folder_name,
        fileType: r.file_name.includes(".") ? r.file_name.split(".").pop()!.toLowerCase() : "unknown",
        sizeBytes: parseInt(r.size_bytes, 10),
        hasStub: r.has_stub,
        attachedRecordCount: parseInt(r.attached_record_count, 10),
        createdDate: null,
      })),
      total,
    };
  }

  // Aggregate path: stub filter (has_stub/missing_stub) OR records-count sort.
  // Scans all matching rows to compute counts/stubs, then filters/sorts/paginates.
  // $3 IS NULL means no stub filter (all rows pass).
  const result = await pool.query<{
    file_id: string;
    file_name: string;
    folder_id: string;
    folder_name: string;
    size_bytes: string;
    has_stub: boolean;
    attached_record_count: string;
    total_count: string;
  }>(
    `WITH file_stats AS (
      SELECT
        af.file_id,
        af.file_name,
        af.folder_id,
        af.folder_name,
        COALESCE(MAX(ra.size_bytes), 0) AS size_bytes,
        BOOL_OR(COALESCE(ra.has_stub, false)) AS has_stub,
        COUNT(ra.record_id) AS attached_record_count
      FROM all_files af
      LEFT JOIN record_attachments ra ON af.file_id = ra.file_id
      WHERE ($1::text IS NULL OR af.folder_id = $1)
        AND ($2::text IS NULL OR af.file_name ILIKE '%' || $2 || '%' OR af.file_id ILIKE '%' || $2 || '%')
      GROUP BY af.file_id, af.file_name, af.folder_id, af.folder_name
    )
    SELECT *, COUNT(*) OVER() AS total_count
    FROM file_stats
    WHERE ($3::text IS NULL
       OR ($3 = 'has_stub' AND has_stub = true)
       OR ($3 = 'missing_stub' AND has_stub = false))
    ORDER BY ${sortExpr}
    LIMIT $4 OFFSET $5`,
    [folderId ?? null, search ?? null, stubStatus, limit, offset],
  );

  const total = result.rows.length > 0 ? parseInt(result.rows[0]!.total_count, 10) : 0;

  return {
    files: result.rows.map((r) => ({
      fileId: r.file_id,
      fileName: r.file_name,
      folderId: r.folder_id,
      folderName: r.folder_name,
      fileType: r.file_name.includes(".") ? r.file_name.split(".").pop()!.toLowerCase() : "unknown",
      sizeBytes: parseInt(r.size_bytes, 10),
      hasStub: r.has_stub,
      attachedRecordCount: parseInt(r.attached_record_count, 10),
      createdDate: null,
    })),
    total,
  };
}

async function _getDashboardSummary() {
  const result = await pool.query<{
    total_files: string;
    total_records: string;
    total_record_types: string;
    total_attachments: string;
    files_with_stub: string;
    files_missing_stub: string;
    total_size_bytes: string;
  }>(`
    WITH non_stub_deduped AS (
      SELECT file_id, MAX(size_bytes) AS size_bytes, BOOL_OR(has_stub) AS has_stub
      FROM record_attachments
      WHERE file_type != 'HTMLDOC'
      GROUP BY file_id
    )
    SELECT
      (SELECT COUNT(*) FROM all_files) AS total_files,
      (SELECT COUNT(DISTINCT record_id) FROM record_attachments) AS total_records,
      (SELECT COUNT(DISTINCT record_type) FROM record_attachments) AS total_record_types,
      (SELECT COUNT(*) FROM record_attachments) AS total_attachments,
      COUNT(*) FILTER (WHERE has_stub) AS files_with_stub,
      COUNT(*) FILTER (WHERE NOT has_stub) AS files_missing_stub,
      COALESCE(SUM(size_bytes), 0) AS total_size_bytes
    FROM non_stub_deduped
  `);

  const row = result.rows[0];
  if (!row) {
    return {
      totalFiles: 0,
      totalRecords: 0,
      totalRecordTypes: 0,
      totalAttachments: 0,
      filesWithStub: 0,
      filesMissingStub: 0,
      stubCoveragePercent: 0,
      totalSizeBytes: 0,
    };
  }

  const filesWithStub = parseInt(row.files_with_stub, 10);
  const filesMissingStub = parseInt(row.files_missing_stub, 10);
  const nonStubTotal = filesWithStub + filesMissingStub;
  const stubCoveragePercent = nonStubTotal > 0
    ? Math.round((filesWithStub / nonStubTotal) * 10000) / 100
    : 0;

  return {
    totalFiles: parseInt(row.total_files, 10),
    totalRecords: parseInt(row.total_records, 10),
    totalRecordTypes: parseInt(row.total_record_types, 10),
    totalAttachments: parseInt(row.total_attachments, 10),
    filesWithStub,
    filesMissingStub,
    stubCoveragePercent,
    totalSizeBytes: parseInt(row.total_size_bytes, 10),
  };
}

export async function getDashboardSummary() {
  const now = Date.now();
  if (cache.summary && now - cache.summary.ts < CACHE_TTL_MS) return cache.summary.value;
  const value = await _getDashboardSummary();
  cache.summary = { value, ts: now };
  return value;
}

async function _getStubCoverageByType() {
  const result = await pool.query<{
    record_type: string;
    file_count: string;
    stub_count: string;
    missing_stub_count: string;
    total_size_bytes: string;
  }>(`
    WITH file_stubs AS (
      SELECT record_type, file_id, MAX(size_bytes) AS size_bytes, BOOL_OR(has_stub) AS has_stub
      FROM record_attachments
      WHERE file_type != 'HTMLDOC'
      GROUP BY record_type, file_id
    )
    SELECT
      record_type,
      COUNT(*) AS file_count,
      COUNT(*) FILTER (WHERE has_stub) AS stub_count,
      COUNT(*) FILTER (WHERE NOT has_stub) AS missing_stub_count,
      COALESCE(SUM(size_bytes), 0) AS total_size_bytes
    FROM file_stubs
    GROUP BY record_type
    ORDER BY file_count DESC
  `);

  return result.rows.map((row) => {
    const fileCount = parseInt(row.file_count, 10);
    const stubCount = parseInt(row.stub_count, 10);
    const missingStubCount = parseInt(row.missing_stub_count, 10);
    const coveragePercent = fileCount > 0
      ? Math.round((stubCount / fileCount) * 10000) / 100
      : 0;
    return {
      recordType: row.record_type,
      fileCount,
      stubCount,
      missingStubCount,
      coveragePercent,
      totalSizeBytes: parseInt(row.total_size_bytes, 10),
    };
  });
}

export async function getStubCoverageByType() {
  const now = Date.now();
  if (cache.coverage && now - cache.coverage.ts < CACHE_TTL_MS) return cache.coverage.value;
  const value = await _getStubCoverageByType();
  cache.coverage = { value, ts: now };
  return value;
}

export async function updateStubStatus(fileId: string, hasStub: boolean): Promise<number> {
  const result = await pool.query<{ file_id: string }>(
    "UPDATE record_attachments SET has_stub = $1 WHERE file_id = $2 RETURNING file_id",
    [hasStub, fileId],
  );
  invalidateSummaryCache();
  return result.rowCount ?? 0;
}

// Files with error statuses in the deletion log, joined with their attached records.
export async function getCompletionErrors() {
  const errorEntries: Array<{ fileId: string; status: string }> = [];
  for (const [fileId, status] of deletionLog.entries()) {
    if (status.startsWith("error:")) {
      errorEntries.push({ fileId, status });
    }
  }

  if (errorEntries.length === 0) {
    return { errors: [], totalErrorFiles: 0 };
  }

  const fileIds = errorEntries.map((e) => e.fileId);
  const result = await pool.query<{
    file_id: string;
    file_name: string;
    record_type: string;
    record_id: string;
    record_name: string;
  }>(
    `SELECT DISTINCT ra.file_id, ra.file_name, ra.record_type, ra.record_id, ra.record_name
     FROM record_attachments ra
     WHERE ra.file_id = ANY($1) AND ra.file_type != 'HTMLDOC'
     ORDER BY ra.file_id, ra.record_type`,
    [fileIds],
  );

  const byFileId = new Map<string, { fileName: string; records: Array<{ recordType: string; recordId: string; recordName: string }> }>();
  for (const row of result.rows) {
    if (!byFileId.has(row.file_id)) {
      byFileId.set(row.file_id, { fileName: row.file_name, records: [] });
    }
    byFileId.get(row.file_id)!.records.push({
      recordType: row.record_type,
      recordId: row.record_id,
      recordName: row.record_name,
    });
  }

  const errors = errorEntries.map(({ fileId, status }) => ({
    fileId,
    status,
    fileName: byFileId.get(fileId)?.fileName ?? null,
    records: byFileId.get(fileId)?.records ?? [],
  }));

  errors.sort((a, b) => a.status.localeCompare(b.status) || a.fileId.localeCompare(b.fileId));

  return { errors, totalErrorFiles: errors.length };
}

// Per-recordType Phase 3 completion stats. Queries distinct orig fileIds
// from the DB (has_stub=true, non-HTMLDOC), then cross-references with
// the in-memory deletion log uploaded by the user.
//
// Note on overlapping coverage: an orig attached to BOTH `task` and
// `salesorder` shows up in both buckets. When it's deleted, both
// buckets advance — correct, since NS detaches system-wide. Sum of
// `totalOrigs` across types therefore exceeds the distinct orig count.
export async function getCompletion() {
  const result = await pool.query<{ record_type: string; file_id: string }>(
    `SELECT DISTINCT record_type, file_id
     FROM record_attachments
     WHERE has_stub = true AND file_type != 'HTMLDOC'`,
  );

  // recordType -> Set of distinct orig fileIds attached to records of that type
  const origsByType = new Map<string, Set<string>>();
  for (const row of result.rows) {
    let set = origsByType.get(row.record_type);
    if (!set) { set = new Set(); origsByType.set(row.record_type, set); }
    set.add(row.file_id);
  }

  const perType: Array<{
    recordType: string;
    totalOrigs: number;
    deletedCount: number;
    remainingCount: number;
    coveragePercent: number;
    errorCount: number;
    protectedCount: number;
  }> = [];

  for (const [recordType, origs] of origsByType) {
    let deletedCount = 0;
    let errorCount = 0;
    let protectedCount = 0;
    for (const fid of origs) {
      const status = deletionLog.get(fid);
      if (!status) continue;
      if (DELETED_STATUSES.has(status)) deletedCount++;
      else if (PROTECTED_STATUSES.has(status)) protectedCount++;
      else if (status.startsWith("error")) errorCount++;
    }
    const totalOrigs = origs.size;
    const remainingCount = totalOrigs - deletedCount - protectedCount;
    const coveragePercent = totalOrigs > 0
      ? Math.round((deletedCount / totalOrigs) * 10000) / 100
      : 0;
    perType.push({
      recordType,
      totalOrigs,
      deletedCount,
      remainingCount,
      coveragePercent,
      errorCount,
      protectedCount,
    });
  }

  perType.sort((a, b) => b.deletedCount - a.deletedCount || a.recordType.localeCompare(b.recordType));

  // Account-wide totals — counted by DISTINCT fileId so each orig is tallied once.
  const allOrigs = new Set<string>();
  for (const set of origsByType.values()) for (const fid of set) allOrigs.add(fid);
  let totalDeleted = 0, totalErrors = 0, totalProtected = 0;
  for (const fid of allOrigs) {
    const status = deletionLog.get(fid);
    if (!status) continue;
    if (DELETED_STATUSES.has(status)) totalDeleted++;
    else if (PROTECTED_STATUSES.has(status)) totalProtected++;
    else if (status.startsWith("error")) totalErrors++;
  }

  const statusCounts: Record<string, number> = {};
  for (const status of deletionLog.values()) {
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  return {
    perType,
    overall: {
      totalOrigs: allOrigs.size,
      totalDeleted,
      totalRemaining: allOrigs.size - totalDeleted - totalProtected,
      totalErrors,
      totalProtected,
      coveragePercent: allOrigs.size > 0
        ? Math.round((totalDeleted / allOrigs.size) * 10000) / 100
        : 0,
    },
    deletionLogEntryCount: deletionLog.size,
    sources: deletionLogSources,
    statusCounts,
  };
}

// ── Completion state (persisted in DB) ────────────────────────────────────────

export async function ensureCompletionStateTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS completion_state (
      record_type  TEXT PRIMARY KEY,
      manually_done BOOLEAN NOT NULL DEFAULT FALSE,
      notes        TEXT    NOT NULL DEFAULT ''
    )
  `);
}

export async function getCompletionState(): Promise<Array<{ recordType: string; manuallyDone: boolean; notes: string }>> {
  const result = await pool.query<{ record_type: string; manually_done: boolean; notes: string }>(
    "SELECT record_type, manually_done, notes FROM completion_state",
  );
  return result.rows.map((r) => ({
    recordType: r.record_type,
    manuallyDone: r.manually_done,
    notes: r.notes,
  }));
}

export async function upsertCompletionState(
  recordType: string,
  patch: { manuallyDone?: boolean; notes?: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO completion_state (record_type, manually_done, notes)
     VALUES ($1, $2, $3)
     ON CONFLICT (record_type) DO UPDATE SET
       manually_done = COALESCE(EXCLUDED.manually_done, completion_state.manually_done),
       notes         = COALESCE(EXCLUDED.notes,         completion_state.notes)`,
    [
      recordType,
      patch.manuallyDone ?? null,
      patch.notes ?? null,
    ],
  );
}

function streamParseAllFilesFromPath(filePath: string): Promise<AllFileRecord[]> {
  return new Promise((resolve, reject) => {
    const records: AllFileRecord[] = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    rl.on("line", (line) => {
      const parts = line.split("|");
      if (parts.length < 4) return;
      const [fileId, fileName, folderId, folderName, createdDateRaw] = parts.map((p) => p.trim());
      if (!fileId || fileId === "fileId") return;
      const createdDate = parts.length >= 5 && createdDateRaw ? createdDateRaw : null;
      records.push({ fileId, fileName, folderId, folderName, createdDate });
    });
    rl.on("close", () => resolve(records));
    rl.on("error", reject);
  });
}

function streamInsertRecordAttachmentsFromPath(filePath: string): Promise<number> {
  const STREAM_BATCH = 2000;
  return new Promise((resolve, reject) => {
    let batch: RecordAttachment[] = [];
    let total = 0;
    let chain = Promise.resolve();

    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });

    const flush = (rows: RecordAttachment[]) => {
      rl.pause();
      chain = chain
        .then(() => upsertRecordAttachments(rows))
        .then(() => {
          total += rows.length;
          rl.resume();
        })
        .catch((err) => { rl.close(); reject(err); });
    };

    rl.on("line", (line) => {
      const parts = parseCsvLine(line);
      if (parts.length < 9) return;
      const [recordType, recordId, recordName, recordStatus, fileId, fileName, sizeBytesStr, fileType, hasStubStr, isStubStr] = parts;
      if (!recordType || recordType === "record_type") return;
      const sizeBytes = parseInt(sizeBytesStr, 10) || 0;
      const norm = hasStubStr?.toLowerCase();
      const hasStub = norm === "true" || norm === "1" || norm === "yes";
      const isStubNorm = isStubStr?.toLowerCase();
      const isStub = isStubNorm === "true" || isStubNorm === "1" || isStubNorm === "yes";
      batch.push({ recordType, recordId, recordName, recordStatus: recordStatus ?? "", fileId, fileName, sizeBytes, fileType, hasStub, isStub });
      if (batch.length >= STREAM_BATCH) {
        flush(batch);
        batch = [];
      }
    });

    rl.on("close", () => {
      const remaining = batch;
      batch = [];
      chain
        .then(async () => {
          if (remaining.length > 0) {
            await upsertRecordAttachments(remaining);
            total += remaining.length;
          }
          resolve(total);
        })
        .catch(reject);
    });

    rl.on("error", reject);
  });
}

function resolveDataDir(): string {
  const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
    ? path.resolve(process.cwd(), "../..")
    : process.cwd();
  return path.resolve(workspaceRoot, "data");
}

export async function reloadDataFromDisk(): Promise<{ allFilesCount: number; recordAttachmentsCount: number; durationMs: number }> {
  const start = Date.now();
  const dataDir = resolveDataDir();

  if (!fs.existsSync(dataDir)) {
    return { allFilesCount: 0, recordAttachmentsCount: 0, durationMs: Date.now() - start };
  }

  const allFilesGlob = fs
    .readdirSync(dataDir)
    .filter((f) => f.startsWith("all_files_") && f.endsWith(".txt"))
    .map((f) => path.join(dataDir, f))
    .sort();

  let allFilesCount = 0;
  if (allFilesGlob.length > 0) {
    logger.info({ parts: allFilesGlob.length }, "reload: loading all_files from disk");
    await db.execute(sql`TRUNCATE all_files CASCADE`);
    const allParts = await Promise.all(allFilesGlob.map(streamParseAllFilesFromPath));
    const combined = allParts.flat();
    await upsertAllFiles(combined);
    allFilesCount = combined.length;
    logger.info({ count: allFilesCount }, "reload: all_files done");
  }

  const attachmentParts = fs
    .readdirSync(dataDir)
    .filter((f) => f.startsWith("record-attachments") && f.endsWith(".csv"))
    .map((f) => path.join(dataDir, f))
    .sort();

  let recordAttachmentsCount = 0;
  if (attachmentParts.length > 0) {
    logger.info({ parts: attachmentParts.length }, "reload: streaming record-attachments from disk");
    await pool.query("TRUNCATE record_attachments");
    for (const part of attachmentParts) {
      const count = await streamInsertRecordAttachmentsFromPath(part);
      recordAttachmentsCount += count;
      logger.info({ file: path.basename(part), count }, "reload: part done");
    }
    logger.info({ count: recordAttachmentsCount }, "reload: record-attachments done");
  }

  invalidateSummaryCache();
  return { allFilesCount, recordAttachmentsCount, durationMs: Date.now() - start };
}

export async function loadDataFromDisk(): Promise<void> {
  const dataDir = resolveDataDir();

  if (!fs.existsSync(dataDir)) {
    logger.info("No data directory found, skipping disk load");
    return;
  }

  const allFilesGlob = fs
    .readdirSync(dataDir)
    .filter((f) => f.startsWith("all_files_") && f.endsWith(".txt"))
    .map((f) => path.join(dataDir, f))
    .sort();

  if (allFilesGlob.length > 0) {
    logger.info({ parts: allFilesGlob.length }, "Loading all_files from disk...");
    const allParts = await Promise.all(allFilesGlob.map(streamParseAllFilesFromPath));
    const combined = allParts.flat();
    await upsertAllFiles(combined);
    logger.info({ count: combined.length }, "all_files upserted from disk");
  }

  const attachmentParts = fs
    .readdirSync(dataDir)
    .filter((f) => f.startsWith("record-attachments") && f.endsWith(".csv"))
    .map((f) => path.join(dataDir, f))
    .sort();

  if (attachmentParts.length > 0) {
    const { rows } = await pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM record_attachments");
    const existing = parseInt(rows[0]?.count ?? "0", 10);
    if (existing > 0) {
      logger.info({ count: existing }, "record-attachments already in DB, skipping disk load");
    } else {
      logger.info({ parts: attachmentParts.length }, "Loading record-attachments from disk (DB empty)...");
      let totalAttachments = 0;
      for (const part of attachmentParts) {
        const count = await streamInsertRecordAttachmentsFromPath(part);
        totalAttachments += count;
        logger.info({ file: path.basename(part), count }, "record-attachments part loaded");
      }
      logger.info({ count: totalAttachments }, "record-attachments loaded from disk");
    }
  }

  // Phase 3 delete logs — optional. Drop any phase3_delete_log_*.txt into
  // data/ (root or data/deletion-logs/) and we pick it up automatically.
  const candidateDirs = [dataDir, path.join(dataDir, "deletion-logs")];
  for (const d of candidateDirs) {
    if (!fs.existsSync(d)) continue;
    const logFiles = fs.readdirSync(d)
      .filter((f) => f.startsWith("phase3_delete_log_") && f.endsWith(".txt"))
      .map((f) => path.join(d, f))
      .sort();
    for (const lf of logFiles) {
      try {
        const content = fs.readFileSync(lf, "utf8");
        const added = parseDeletionLog(content, path.basename(lf));
        logger.info({ file: lf, added }, "Phase 3 deletion log loaded from disk");
      } catch (e) {
        logger.error({ file: lf, err: (e as Error).message }, "Failed to load deletion log");
      }
    }
  }
}
