import { pgTable, text, integer, bigint, boolean, index, primaryKey } from "drizzle-orm/pg-core";

export const allFilesTable = pgTable(
  "all_files",
  {
    fileId: text("file_id").primaryKey(),
    fileName: text("file_name").notNull(),
    folderId: text("folder_id").notNull(),
    folderName: text("folder_name").notNull(),
  },
  (t) => [index("all_files_folder_id_idx").on(t.folderId)],
);

export const recordAttachmentsTable = pgTable(
  "record_attachments",
  {
    recordType: text("record_type").notNull(),
    recordId: text("record_id").notNull(),
    recordName: text("record_name").notNull(),
    recordStatus: text("record_status").notNull().default(""),
    fileId: text("file_id").notNull(),
    fileName: text("file_name").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    fileType: text("file_type").notNull(),
    hasStub: boolean("has_stub").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.recordId, t.fileId] }),
    index("record_attachments_record_type_idx").on(t.recordType),
    index("record_attachments_has_stub_idx").on(t.hasStub),
  ],
);
