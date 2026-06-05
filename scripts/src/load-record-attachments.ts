import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const BATCH_SIZE = 2000;

type Row = [string, string, string, string, string, string, number, string, boolean];

async function insertBatch(client: pg.PoolClient, rawRows: Row[]): Promise<void> {
  const seen = new Map<string, Row>();
  for (const r of rawRows) seen.set(`${r[1]}:${r[4]}`, r);
  const rows = Array.from(seen.values());
  await client.query(
    `INSERT INTO record_attachments
       (record_type, record_id, record_name, record_status, file_id, file_name, size_bytes, file_type, has_stub)
     SELECT * FROM unnest(
       $1::text[], $2::text[], $3::text[], $4::text[],
       $5::text[], $6::text[], $7::bigint[], $8::text[], $9::boolean[]
     )
     ON CONFLICT (record_id, file_id) DO UPDATE SET
       record_type   = EXCLUDED.record_type,
       record_name   = EXCLUDED.record_name,
       record_status = EXCLUDED.record_status,
       file_name     = EXCLUDED.file_name,
       size_bytes    = EXCLUDED.size_bytes,
       file_type     = EXCLUDED.file_type,
       has_stub      = EXCLUDED.has_stub`,
    [
      rows.map(r => r[0]),
      rows.map(r => r[1]),
      rows.map(r => r[2]),
      rows.map(r => r[3]),
      rows.map(r => r[4]),
      rows.map(r => r[5]),
      rows.map(r => r[6]),
      rows.map(r => r[7]),
      rows.map(r => r[8]),
    ],
  );
}

function streamLoadFile(client: pg.PoolClient, filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let batch: Row[] = [];
    let total = 0;
    let chain = Promise.resolve();

    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });

    rl.on("line", (line) => {
      const parts = line.split(",");
      if (parts.length < 9) return;
      const [recordType, recordId, recordName, recordStatus, fileId, fileName, sizeBytesStr, fileType, hasStubStr] =
        parts.map(p => p.trim());
      if (!recordType || recordType === "record_type") return;
      const sizeBytes = parseInt(sizeBytesStr, 10) || 0;
      const norm = (hasStubStr ?? "").toLowerCase();
      const hasStub = norm === "true" || norm === "1" || norm === "yes";
      batch.push([recordType, recordId, recordName, recordStatus ?? "", fileId, fileName, sizeBytes, fileType, hasStub]);

      if (batch.length >= BATCH_SIZE) {
        rl.pause();
        const toInsert = batch;
        batch = [];
        chain = chain
          .then(() => insertBatch(client, toInsert))
          .then(() => {
            total += toInsert.length;
            process.stdout.write(`  ${total.toLocaleString()} rows...\r`);
            rl.resume();
          })
          .catch(err => { rl.close(); reject(err); });
      }
    });

    rl.on("close", () => {
      const remaining = batch;
      batch = [];
      chain
        .then(async () => {
          if (remaining.length > 0) {
            await insertBatch(client, remaining);
            total += remaining.length;
          }
          resolve(total);
        })
        .catch(reject);
    });

    rl.on("error", reject);
  });
}

async function main() {
  const parts = fs
    .readdirSync(DATA_DIR)
    .filter(f => f.startsWith("record-attachments") && f.endsWith(".csv"))
    .sort()
    .map(f => path.join(DATA_DIR, f));

  if (parts.length === 0) {
    console.error(`No record-attachments CSV files found in ${DATA_DIR}`);
    process.exit(1);
  }

  console.log(`Found ${parts.length} CSV part(s):`);
  parts.forEach(p => console.log(`  ${path.basename(p)}`));

  const client = await pool.connect();
  try {
    const noTruncate = process.argv.includes("--no-truncate");
    if (!noTruncate) {
      console.log("\nTruncating record_attachments...");
      await client.query("TRUNCATE record_attachments");
    } else {
      console.log("\nSkipping truncate (--no-truncate).");
    }

    let grandTotal = 0;
    for (const part of parts) {
      const start = Date.now();
      process.stdout.write(`\nLoading ${path.basename(part)}...\n`);
      const count = await streamLoadFile(client, part);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  Done: ${count.toLocaleString()} rows in ${elapsed}s`);
      grandTotal += count;
    }

    const res = await client.query<{ count: string }>("SELECT COUNT(*) FROM record_attachments");
    const dbCount = parseInt(res.rows[0].count, 10);
    console.log(`\nTotal inserted: ${grandTotal.toLocaleString()}`);
    console.log(`Verified in DB: ${dbCount.toLocaleString()} rows`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
