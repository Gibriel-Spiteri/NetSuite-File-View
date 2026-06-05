import { useState } from "react";
import { useListAllFiles } from "@workspace/api-client-react";
import type { ListAllFilesParams, ListAllFilesStubStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

export function Files() {
  const [params, setParams] = useState<ListAllFilesParams>({
    limit: 100,
    offset: 0,
    stubStatus: "all",
  });

  const { data, isLoading } = useListAllFiles(params);
  
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex gap-4 items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search files by name or ID..." 
              className="pl-9"
              value={params.search || ""}
              onChange={e => setParams(p => ({ ...p, search: e.target.value || undefined, offset: 0 }))}
            />
          </div>

          <Select 
            value={params.stubStatus || "all"} 
            onValueChange={v => setParams(p => ({ ...p, stubStatus: v as ListAllFilesStubStatus, offset: 0 }))}
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
                <TableHead>File ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Folder</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead className="text-center">Stub Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading files...</TableCell></TableRow>
              ) : !data?.files.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No files found matching filters.</TableCell></TableRow>
              ) : (
                data.files.map(file => (
                  <TableRow key={file.fileId}>
                    <TableCell className="font-mono text-xs">{file.fileId}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={file.fileName}>{file.fileName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{file.folderName || "-"}</TableCell>
                    <TableCell className="text-xs">{(file.sizeBytes / 1024).toFixed(1)} KB</TableCell>
                    <TableCell className="text-right font-medium">{file.attachedRecordCount}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={file.hasStub ? "outline" : "destructive"}>
                        {file.hasStub ? "Stubbed" : "Missing"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
