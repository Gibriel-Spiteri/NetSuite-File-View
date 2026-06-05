import { useState } from "react";
import { useListRecords, useListRecordTypes, useGetRecordFiles, getGetRecordFilesQueryKey } from "@workspace/api-client-react";
import type { ListRecordsParams, ListRecordsStubStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

export function Records() {
  const [params, setParams] = useState<ListRecordsParams>({
    limit: 50,
    offset: 0,
    stubStatus: "all",
  });
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const { data: recordTypes } = useListRecordTypes();
  const { data, isLoading } = useListRecords(params);
  
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex gap-4 items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search records..." 
              className="pl-9"
              value={params.search || ""}
              onChange={e => setParams(p => ({ ...p, search: e.target.value || undefined, offset: 0 }))}
            />
          </div>
          
          <Select 
            value={params.recordType || "all"} 
            onValueChange={v => setParams(p => ({ ...p, recordType: v === "all" ? undefined : v, offset: 0 }))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {recordTypes?.map(t => (
                <SelectItem key={t.recordType} value={t.recordType}>{t.recordType} ({t.recordCount})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select 
            value={params.stubStatus || "all"} 
            onValueChange={v => setParams(p => ({ ...p, stubStatus: v as ListRecordsStubStatus, offset: 0 }))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Stub Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="has_stub">Has Stub</SelectItem>
              <SelectItem value="missing_stub">Missing Stub</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Type</TableHead>
                <TableHead>Record ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Files</TableHead>
                <TableHead className="text-right">Missing Stubs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading records...</TableCell></TableRow>
              ) : !data?.records.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No records found matching filters.</TableCell></TableRow>
              ) : (
                data.records.map(record => (
                  <TableRow 
                    key={record.recordId} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedRecordId(record.recordId)}
                  >
                    <TableCell className="font-medium text-xs"><Badge variant="outline">{record.recordType}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{record.recordId}</TableCell>
                    <TableCell>{record.recordName}</TableCell>
                    <TableCell className="text-right">{record.fileCount}</TableCell>
                    <TableCell className="text-right">
                      {record.missingStubCount > 0 ? (
                        <span className="text-destructive font-bold">{record.missingStubCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <RecordDetailsSheet 
        recordId={selectedRecordId} 
        onClose={() => setSelectedRecordId(null)} 
      />
    </div>
  );
}

function RecordDetailsSheet({ recordId, onClose }: { recordId: string | null, onClose: () => void }) {
  const { data: files, isLoading } = useGetRecordFiles(recordId || "", {
    query: { enabled: !!recordId, queryKey: getGetRecordFilesQueryKey(recordId || "") }
  });

  return (
    <Sheet open={!!recordId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Record Attachments</SheetTitle>
          <SheetDescription>
            Record ID: <span className="font-mono">{recordId}</span>
          </SheetDescription>
        </SheetHeader>
        
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading files...</div>
        ) : !files?.length ? (
          <div className="py-8 text-center text-muted-foreground">No files attached to this record.</div>
        ) : (
          <div className="space-y-4">
            {files.map(file => (
              <Card key={file.fileId}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="font-medium text-sm truncate" title={file.fileName}>{file.fileName}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                        <span>ID: <span className="font-mono">{file.fileId}</span></span>
                        <span>•</span>
                        <span>Size: {(file.sizeBytes / 1024).toFixed(1)} KB</span>
                      </div>
                    </div>
                    <Badge variant={file.hasStub ? "default" : "destructive"}>
                      {file.hasStub ? "Has Stub" : "Missing Stub"}
                    </Badge>
                  </div>
                  {file.hasStub && file.stubFileName && (
                    <div className="mt-3 text-xs bg-muted p-2 rounded flex gap-2">
                      <span className="text-muted-foreground font-medium shrink-0">Stub File:</span>
                      <span className="font-mono text-foreground break-all">{file.stubFileName}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
