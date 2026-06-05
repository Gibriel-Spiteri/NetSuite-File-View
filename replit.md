# NS Record-File Viewer

A NetSuite Record-File database viewer for auditing file attachments across NS records and tracking stub file coverage.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/ns-file-viewer run dev` — run the frontend (port assigned dynamically)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, wouter, TanStack Query, shadcn/ui, Tailwind CSS, Recharts
- API: Express 5
- API codegen: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- NetSuite: M2M OAuth 2.0 with certificate-based JWT assertion (PS256), SuiteQL for stub queries

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `artifacts/api-server/src/lib/dataStore.ts` — in-memory data store for uploaded CSV/pipe-delimited files
- `artifacts/api-server/src/lib/netsuite.ts` — NetSuite M2M auth + SuiteQL helpers (PS256 JWT)
- `artifacts/api-server/src/routes/data.ts` — all file/record/summary endpoints
- `artifacts/api-server/src/routes/netsuite.ts` — NS status + stub refresh endpoints
- `artifacts/ns-file-viewer/src/pages/` — frontend pages (dashboard, records, files, upload, netsuite)

## Data Formats

- **all_files**: pipe-delimited `fileId|fileName|folderId|folderName`
- **record-attachments**: comma-separated `record_type,record_id,record_name,file_id,file_name,size_bytes,file_type,has_stub`

## NetSuite M2M Credentials (optional)

Required only for live stub refresh from NetSuite:

| Secret | Description |
|--------|-------------|
| `NETSUITE_ACCOUNT_ID` | NetSuite account ID (e.g. `1234567`) |
| `NETSUITE_CLIENT_ID` | OAuth 2.0 client ID from the Integration record |
| `NETSUITE_CERTIFICATE_ID` | Certificate ID from the Certificate-Based Integration record |
| `NETSUITE_PRIVATE_KEY_PEM` | PEM-encoded RSA private key (use `\n` for line breaks) |

## Architecture decisions

- **In-memory data store**: Data from uploaded CSV/pipe files is held in-memory. This is appropriate for large files that would be slow to query from a DB and don't need persistence between sessions.
- **NetSuite M2M via PS256 JWT**: Same pattern as the reference `Netsuite-S3-Sync` project — certificate-based token exchange with cached tokens (reused until 60s before expiry).
- **Stub detection logic**: A "stub" is a `.html` file with the same base name as the original file. The `has_stub` field in the record-attachments CSV is the primary source; the NS live refresh can update this from SuiteQL.
- **No database needed**: All data lives in-memory from user-uploaded CSVs. No DB provisioning required for the core functionality.

## Product

- **Dashboard**: Summary stats (total files, records, attachments, stub coverage %) + bar chart of coverage by record type
- **Records**: Searchable/filterable table by record type and stub status; click to see attached files with stub indicators
- **Files**: Browse all files with stub status and record attachment counts
- **Upload**: Paste raw CSV/pipe-delimited data into two areas to load both datasets
- **NetSuite Config**: Check M2M connection status; trigger live stub status refresh by record type

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `NETSUITE_PRIVATE_KEY_PEM` must have actual newlines or `\n` escape sequences — the server does `.replace(/\\n/g, "\n")` to normalize
- NetSuite account IDs with underscores are lowercased and the underscore is replaced with a hyphen for the API hostname
- The data store is in-memory — restarting the API server clears all uploaded data
