import { useState, useEffect, useRef, useCallback } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, CloudUpload, X } from "lucide-react";

export default function AdminImportPage() {
  const [csvContent, setCsvContent] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const importMutation = useImportCsv();

  const { data: statusData } = useGetImportStatus(jobId as string, {
    query: {
      enabled: !!jobId,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "complete" || status === "error") return false;
        return 2000;
      }
    }
  });

  useEffect(() => {
    if (statusData?.status === "complete") {
      toast({ title: "Import completed successfully!" });
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

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv" && file.type !== "text/plain") {
      toast({ title: "Please select a CSV file", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    try {
      const text = await readFileAsText(file);
      setCsvContent(text);
    } catch {
      toast({ title: "Failed to read file", variant: "destructive" });
    }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleImport = async () => {
    const content = csvContent.trim();
    if (!content) {
      toast({ title: "Please provide CSV content", variant: "destructive" });
      return;
    }

    try {
      const response = await importMutation.mutateAsync({ data: { csvContent: content } });
      setJobId(response.jobId);
    } catch (e: any) {
      toast({ title: "Failed to start import", description: e.message, variant: "destructive" });
    }
  };

  const handleReset = () => {
    setJobId(null);
    setCsvContent("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (jobId && statusData) {
    const isProcessing = statusData.status === "pending" || statusData.status === "processing";
    const isComplete = statusData.status === "complete";
    const isError = statusData.status === "error";

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import Status</h1>
          <p className="text-gray-500 mt-1">Gemini AI is processing your data.</p>
        </div>

        <Card>
          <CardContent className="pt-10 pb-10 flex flex-col items-center text-center">
            {isProcessing && (
              <>
                <Loader2 className="h-12 w-12 text-primary animate-spin mb-6" />
                <h2 className="text-xl font-semibold mb-2">Analyzing and structuring data...</h2>
                <p className="text-muted-foreground mb-8 max-w-md">
                  Gemini AI is reviewing your CSV rows, extracting information,
                  and organizing it into categories and entries. This may take a minute.
                </p>
                <div className="w-full max-w-md space-y-2">
                  {(statusData.progress ?? 0) > 0 ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>{statusData.progress}%</span>
                      </div>
                      <Progress value={statusData.progress ?? 0} className="h-2" />
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span className="text-muted-foreground">Waiting for Gemini...</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full animate-pulse w-1/3" />
                      </div>
                    </>
                  )}
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
                <p className="text-muted-foreground mb-6">{statusData.message}</p>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6 w-full max-w-md">
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

  const hasContent = csvContent.trim().length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import CSV</h1>
        <p className="text-gray-500 mt-1">Upload your CSV and Gemini AI will organize it into structured directory entries.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Source</CardTitle>
          <CardDescription>
            Upload a CSV file or paste the content directly. Gemini AI will automatically detect headers and create categories, summaries, and entry details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900 p-4 flex items-start">
            <FileText className="h-5 w-5 mr-3 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium mb-1 text-blue-900 dark:text-blue-100">Tips for best results</p>
              <ul className="list-disc list-inside text-blue-700 dark:text-blue-300 space-y-1 ml-1">
                <li>Include a header row (e.g. Name, Description, Phone, Website)</li>
                <li>Data doesn't need to be perfect — Gemini will clean and structure it</li>
                <li>Categories are created automatically based on your data</li>
                <li>Supports any CSV format: business directories, product lists, contacts, etc.</li>
              </ul>
            </div>
          </div>

          <Tabs defaultValue="upload">
            <TabsList className="mb-4">
              <TabsTrigger value="upload">Upload File</TabsTrigger>
              <TabsTrigger value="paste">Paste CSV</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-0">
              <div
                className={`relative border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : selectedFile
                    ? "border-green-400 bg-green-50 dark:bg-green-950/20"
                    : "border-gray-300 dark:border-gray-700 hover:border-primary hover:bg-primary/5"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !selectedFile && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={handleFileInputChange}
                />

                {selectedFile ? (
                  <div className="p-8 flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-white">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {(selectedFile.size / 1024).toFixed(1)} KB · {csvContent.split("\n").length} rows detected
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleReset(); }}
                    >
                      <X className="h-4 w-4 mr-1" /> Remove file
                    </Button>
                  </div>
                ) : (
                  <div className="p-12 flex flex-col items-center text-center">
                    <CloudUpload className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                      Drop your CSV file here
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                      <Upload className="h-4 w-4 mr-2" /> Choose File
                    </Button>
                    <p className="text-xs text-muted-foreground mt-3">Supports .csv files</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="paste" className="mt-0">
              <Textarea
                placeholder={"Name,Description,Website,Location\nAcme Corp,Software company in NY,https://acme.com,New York\n..."}
                className="font-mono text-sm min-h-[280px] whitespace-pre"
                value={csvContent}
                onChange={(e) => { setCsvContent(e.target.value); setSelectedFile(null); }}
              />
              {csvContent.trim() && (
                <p className="text-xs text-muted-foreground mt-2">
                  {csvContent.split("\n").filter(Boolean).length} rows detected
                </p>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleImport}
              disabled={!hasContent || importMutation.isPending}
              size="lg"
            >
              {importMutation.isPending
                ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Starting...</>
                : <><Upload className="mr-2 h-5 w-5" /> Import with Gemini AI</>
              }
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
