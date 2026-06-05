import { useState } from "react";
import { useGetNetsuiteStatus, useListRecordTypes, useRefreshStubStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Server, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function NetsuiteConfig() {
  const { data: status, isLoading: isStatusLoading } = useGetNetsuiteStatus();
  const { data: recordTypes } = useListRecordTypes();
  const refreshStubs = useRefreshStubStatus();
  
  const [selectedType, setSelectedType] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    if (!selectedType) return;
    
    refreshStubs.mutate({ data: { recordType: selectedType } }, {
      onSuccess: (res) => {
        toast({ title: "Refresh Complete", description: res.message });
        queryClient.invalidateQueries(); // Invalidate everything to refresh tables
      },
      onError: (err: any) => {
        toast({ title: "Refresh Failed", description: err.message || "Could not reach NetSuite", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>NetSuite Connection</CardTitle>
          <CardDescription>Status of the live integration with NetSuite for checking stub existence.</CardDescription>
        </CardHeader>
        <CardContent>
          {isStatusLoading ? (
            <div className="text-muted-foreground">Checking connection...</div>
          ) : status?.configured ? (
            <div className="flex items-center gap-3 text-emerald-600 bg-emerald-50 p-4 rounded-md border border-emerald-100">
              <CheckCircle className="h-5 w-5" />
              <div>
                <div className="font-semibold">Connected to NetSuite</div>
                <div className="text-sm opacity-90">Account ID: <span className="font-mono">{status.accountId}</span></div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-amber-600 bg-amber-50 p-4 rounded-md border border-amber-100">
              <AlertCircle className="h-5 w-5" />
              <div>
                <div className="font-semibold">Not Configured</div>
                <div className="text-sm opacity-90">{status?.message || "Missing NetSuite environment variables."}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Stub Verification</CardTitle>
          <CardDescription>Trigger a real-time check against NetSuite to verify if attachments have stub files generated.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Record Type" />
                </SelectTrigger>
                <SelectContent>
                  {recordTypes?.map(t => (
                    <SelectItem key={t.recordType} value={t.recordType}>{t.recordType} ({t.fileCount} files)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              disabled={!selectedType || !status?.configured || refreshStubs.isPending}
              onClick={handleRefresh}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshStubs.isPending ? 'animate-spin' : ''}`} /> 
              Check NetSuite
            </Button>
          </div>
          {!status?.configured && (
             <p className="text-xs text-muted-foreground">Live verification requires active NetSuite credentials.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
