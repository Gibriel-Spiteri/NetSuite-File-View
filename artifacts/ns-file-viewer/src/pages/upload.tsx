import { useState } from "react";
import { useUploadData, useGetDataStatus, getGetDataStatusQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, UploadCloud } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function Upload() {
  const [filesData, setFilesData] = useState("");
  const [attachmentsData, setAttachmentsData] = useState("");
  
  const { data: status } = useGetDataStatus();
  const uploadData = useUploadData();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleUpload = (type: "all_files" | "record_attachments", content: string, setter: (v: string) => void) => {
    if (!content.trim()) return;

    uploadData.mutate({ data: { type, content } }, {
      onSuccess: (res) => {
        toast({ title: "Upload Successful", description: `Loaded ${res.rowCount} rows.` });
        setter("");
        queryClient.invalidateQueries({ queryKey: getGetDataStatusQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Upload Failed", description: err.message || "Could not parse data", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>All Files (Pipe-delimited)</span>
              {status?.allFilesLoaded && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            </CardTitle>
            <CardDescription>
              Format: <code className="text-xs bg-muted px-1 py-0.5 rounded">fileId|fileName|folderId|folderName</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea 
              placeholder="Paste pipe-delimited text here..." 
              className="h-64 font-mono text-xs whitespace-pre"
              value={filesData}
              onChange={(e) => setFilesData(e.target.value)}
            />
            <Button 
              className="w-full" 
              disabled={!filesData.trim() || uploadData.isPending}
              onClick={() => handleUpload("all_files", filesData, setFilesData)}
            >
              <UploadCloud className="w-4 h-4 mr-2" /> Load Files Data
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Record Attachments (CSV)</span>
              {status?.recordAttachmentsLoaded && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            </CardTitle>
            <CardDescription>
              Format: <code className="text-xs bg-muted px-1 py-0.5 rounded">record_type,record_id,record_name,file_id,file_name,size_bytes,file_type,has_stub</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea 
              placeholder="Paste CSV text here..." 
              className="h-64 font-mono text-xs whitespace-pre"
              value={attachmentsData}
              onChange={(e) => setAttachmentsData(e.target.value)}
            />
            <Button 
              className="w-full" 
              disabled={!attachmentsData.trim() || uploadData.isPending}
              onClick={() => handleUpload("record_attachments", attachmentsData, setAttachmentsData)}
            >
              <UploadCloud className="w-4 h-4 mr-2" /> Load Attachments Data
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
