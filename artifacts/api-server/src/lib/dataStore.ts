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

const BATCH_SIZE = 500;

// ── Simple in-memory cache ──────────────────────────────────────────────────
// These aggregation queries scan millions of rows; cache results until data changes.
type CacheEntry<T> = { value: T; ts: number };
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
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
    const [fileId, fileName, folderId, folderName] = parts.map((p) => p.trim());
    if (!fileId || fileId === "fileId") continue;
    records.push({ fileId, fileName, folderId, folderName });
  }
  return records;
}

function parseRecordAttachmentsContent(content: string): RecordAttachment[] {
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

export async function getRecordFiles(recordId: string) {
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
     WHERE ra.record_id = $1`,
    [recordId],
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

export async function getAllFiles(opts: {
  folderId?: string;
  search?: string;
  stubStatus?: string;
  limit?: number;
  offset?: number;
}) {
  const { folderId, search, limit = 50, offset = 0 } = opts;
  const stubStatus = opts.stubStatus === "all" ? null : (opts.stubStatus ?? null);

  // Fast path: when no stub filter, paginate all_files first, then join only the
  // current page's rows for stats — avoids a 2M-row HashAggregate.
  if (stubStatus === null) {
    const baseParams: (string | number | null)[] = [folderId ?? null, search ?? null];
    const whereClause = `
      ($1::text IS NULL OR folder_id = $1)
      AND ($2::text IS NULL OR file_name ILIKE '%' || $2 || '%' OR file_id ILIKE '%' || $2 || '%')`;

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
          ORDER BY file_name
          LIMIT $3 OFFSET $4
        ) af
        LEFT JOIN record_attachments ra ON af.file_id = ra.file_id
        GROUP BY af.file_id, af.file_name, af.folder_id, af.folder_name
        ORDER BY af.file_name`,
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
      })),
      total,
    };
  }

  // Filtered path (has_stub / missing_stub): must aggregate all rows to apply stub filter.
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
    ),
    filtered AS (
      SELECT * FROM file_stats
      WHERE ($3 = 'has_stub' AND has_stub = true)
         OR ($3 = 'missing_stub' AND has_stub = false)
    )
    SELECT *, COUNT(*) OVER() AS total_count
    FROM filtered
    ORDER BY file_name
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
      const parts = line.split(",");
      if (parts.length < 9) return;
      const [recordType, recordId, recordName, recordStatus, fileId, fileName, sizeBytesStr, fileType, hasStubStr] = parts.map((p) => p.trim());
      if (!recordType || recordType === "record_type") return;
      const sizeBytes = parseInt(sizeBytesStr, 10) || 0;
      const norm = hasStubStr?.toLowerCase();
      const hasStub = norm === "true" || norm === "1" || norm === "yes";
      batch.push({ recordType, recordId, recordName, recordStatus: recordStatus ?? "", fileId, fileName, sizeBytes, fileType, hasStub });
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
}
