import { useState, useEffect } from "react";
import { Link } from "wouter";
import { 
  useImportCsv, 
  useGetImportStatus,
  getListEntriesQueryKey,
  getListCategoriesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export default function AdminImportPage() {
  const [csvContent, setCsvContent] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const importMutation = useImportCsv();
  
  const { data: statusData } = useGetImportStatus(jobId as string, {
    query: {
      enabled: !!jobId,
      refetchInterval: (query) => {
        // Stop polling if complete or error
        const status = query.state.data?.status;
        if (status === "complete" || status === "error") return false;
        return 2000; // Poll every 2s
      }
    }
  });

  useEffect(() => {
    if (statusData?.status === "complete") {
      toast({ title: "Import completed successfully" });
      queryClient.invalidateQueries({ queryKey: getListEntriesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
    } else if (statusData?.status === "error") {
      toast({ 
        title: "Import failed", 
        description: statusData.error || "An unknown error occurred", 
        variant: "destructive" 
      });
    }
  }, [statusData?.status, statusData?.error, toast, queryClient]);

  const handleImport = async () => {
    if (!csvContent.trim()) {
      toast({ title: "Please provide CSV content", variant: "destructive" });
      return;
    }
    
    try {
      const response = await importMutation.mutateAsync({ data: { csvContent } });
      setJobId(response.jobId);
    } catch (e: any) {
      toast({ title: "Failed to start import", description: e.message, variant: "destructive" });
    }
  };

  const handleReset = () => {
    setJobId(null);
    setCsvContent("");
  };

  if (jobId && statusData) {
    const isProcessing = statusData.status === "pending" || statusData.status === "processing";
    const isComplete = statusData.status === "complete";
    const isError = statusData.status === "error";
    
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import Status</h1>
          <p className="text-gray-500 mt-1">Directory Master is processing your data.</p>
        </div>

        <Card>
          <CardContent className="pt-10 pb-10 flex flex-col items-center text-center">
            {isProcessing && (
              <>
                <Loader2 className="h-12 w-12 text-primary animate-spin mb-6" />
                <h2 className="text-xl font-semibold mb-2">Analyzing and structuring data...</h2>
                <p className="text-muted-foreground mb-8 max-w-md">
                  Gemini AI is currently reviewing your CSV rows, extracting information, 
                  and organizing it into the directory schema. This may take a few minutes.
                </p>
                <div className="w-full max-w-md space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{statusData.progress || 0}%</span>
                  </div>
                  <Progress value={statusData.progress || 0} className="h-2" />
                </div>
                {statusData.message && (
                  <p className="text-sm font-medium text-primary mt-4">{statusData.message}</p>
                )}
              </>
            )}

            {isComplete && (
              <>
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Import Successful</h2>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6 w-full max-w-md mt-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-3xl font-bold text-gray-900 dark:text-white">{statusData.entriesCreated || 0}</div>
                      <div className="text-sm text-muted-foreground">Entries Created</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-gray-900 dark:text-white">{statusData.categoriesCreated || 0}</div>
                      <div className="text-sm text-muted-foreground">Categories Created</div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 mt-8">
                  <Button onClick={handleReset} variant="outline">Import Another</Button>
                  <Link href="/admin/entries">
                    <Button>View Entries</Button>
                  </Link>
                </div>
              </>
            )}

            {isError && (
              <>
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-6">
                  <AlertCircle className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Import Failed</h2>
                <p className="text-muted-foreground mb-8">{statusData.error || "An unexpected error occurred"}</p>
                <Button onClick={handleReset}>Try Again</Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import CSV</h1>
        <p className="text-gray-500 mt-1">Upload unstructured data and let AI organize it.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Source</CardTitle>
          <CardDescription>
            Paste your CSV content below. Our AI will automatically figure out headers like Title, Description, Location, Contacts, and Categories.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-4 flex items-start">
            <FileText className="h-5 w-5 mr-3 text-muted-foreground mt-0.5" />
            <div className="text-sm">
              <p className="font-medium mb-1">Tips for best results:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-1">
                <li>Include a header row if possible (e.g. Name, Description, Phone).</li>
                <li>Data doesn't need to be perfect; the AI will clean it up.</li>
                <li>New categories will be automatically created based on the data.</li>
              </ul>
            </div>
          </div>
          
          <Textarea
            placeholder="Name, Description, Website, Location&#10;Acme Corp, Software company in NY, https://acme.com, New York&#10;..."
            className="font-mono text-sm min-h-[300px] whitespace-pre"
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
          />
          
          <div className="flex justify-end">
            <Button onClick={handleImport} disabled={!csvContent.trim() || importMutation.isPending} size="lg">
              {importMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Upload className="mr-2 h-5 w-5" />}
              Start AI Import
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
