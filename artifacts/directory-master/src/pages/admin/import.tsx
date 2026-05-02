import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import {
  useAnalyzeImport,
  useImportCsv,
  useGetImportStatus,
  getListEntriesQueryKey,
  getListCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2,
  CloudUpload, X, ArrowRight, ArrowLeft, Eye, Tag, FolderOpen, Info
} from "lucide-react";

type Step = "upload" | "map" | "progress";

interface ColumnMapping {
  csvColumn: string;
  targetField: string;
  sampleValues: string[];
  confidence: number;
  approved: boolean;
}

interface AvailableField {
  value: string;
  label: string;
  description: string;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color = confidence >= 0.85
    ? "bg-green-500"
    : confidence >= 0.6
    ? "bg-yellow-400"
    : "bg-gray-300";
  const label = confidence >= 0.85 ? "High" : confidence >= 0.6 ? "Medium" : "Low";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

export default function AdminImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [csvContent, setCsvContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [availableFields, setAvailableFields] = useState<AvailableField[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const analyzeMutation = useAnalyzeImport();
  const importMutation = useImportCsv();

  const { data: statusData } = useGetImportStatus(jobId as string, {
    query: {
      enabled: !!jobId,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "complete" || status === "error" ? false : 2000;
      },
    },
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
        variant: "destructive",
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

  const handleFileSelect = useCallback(
    async (file: File) => {
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
    },
    [toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleReset = () => {
    setStep("upload");
    setJobId(null);
    setCsvContent("");
    setSelectedFile(null);
    setMappings([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Step 1 → Step 2: analyze headers
  const handleAnalyze = async () => {
    const content = csvContent.trim();
    if (!content) {
      toast({ title: "Please provide CSV content", variant: "destructive" });
      return;
    }
    const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
    if (lines.length < 2) {
      toast({ title: "CSV must have at least a header row and one data row", variant: "destructive" });
      return;
    }
    const headers = parseCSVLine(lines[0]);
    const sampleRows = lines.slice(1, 4).map(l => parseCSVLine(l));

    try {
      const result = await analyzeMutation.mutateAsync({ data: { headers, sampleRows } });
      setMappings(result.mappings as ColumnMapping[]);
      setAvailableFields(result.availableFields as AvailableField[]);
      setStep("map");
    } catch (e: any) {
      toast({ title: "Failed to analyze CSV", description: e.message, variant: "destructive" });
    }
  };

  // Step 2 → Step 3: run import
  const handleImport = async () => {
    const hasTitleMapping = mappings.some(m => m.approved && m.targetField === "title");
    if (!hasTitleMapping) {
      toast({
        title: "Title mapping required",
        description: "At least one column must be mapped to Title / Name",
        variant: "destructive",
      });
      return;
    }
    try {
      const response = await importMutation.mutateAsync({
        data: { csvContent: csvContent.trim(), fieldMappings: mappings },
      });
      setJobId(response.jobId);
      setStep("progress");
    } catch (e: any) {
      toast({ title: "Failed to start import", description: e.message, variant: "destructive" });
    }
  };

  const updateMapping = (csvColumn: string, field: keyof ColumnMapping, value: any) => {
    setMappings(prev =>
      prev.map(m => m.csvColumn === csvColumn ? { ...m, [field]: value } : m)
    );
  };

  const approvedCount = mappings.filter(m => m.approved).length;
  const skippedCount = mappings.filter(m => !m.approved || m.targetField === "skip").length;
  const rowCount = csvContent.trim().split("\n").filter(Boolean).length - 1;

  // ── STEP 3: Progress / Result ──────────────────────────────────────
  if (step === "progress" && jobId) {
    const isProcessing = !statusData || statusData.status === "pending" || statusData.status === "processing";
    const isComplete = statusData?.status === "complete";
    const isError = statusData?.status === "error";

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Importing…</h1>
          <p className="text-gray-500 mt-1">Your data is being structured and saved.</p>
        </div>

        <Card>
          <CardContent className="pt-10 pb-10 flex flex-col items-center text-center">
            {isProcessing && (
              <>
                <Loader2 className="h-12 w-12 text-primary animate-spin mb-6" />
                <h2 className="text-xl font-semibold mb-2">Processing your data…</h2>
                <p className="text-muted-foreground mb-8 max-w-md">
                  Mapping fields, generating summaries where needed, and saving everything to the database.
                </p>
                <div className="w-full max-w-md space-y-2">
                  {(statusData?.progress ?? 0) > 0 ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>{statusData?.progress}%</span>
                      </div>
                      <Progress value={statusData?.progress ?? 0} className="h-2" />
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span className="text-muted-foreground">Starting…</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full animate-pulse w-1/3" />
                      </div>
                    </>
                  )}
                </div>
                {statusData?.message && (
                  <p className="text-sm font-medium text-primary mt-4">{statusData.message}</p>
                )}
              </>
            )}

            {isComplete && (
              <>
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Import Successful</h2>
                <p className="text-muted-foreground mb-6">{statusData?.message}</p>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6 w-full max-w-md">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-3xl font-bold">{statusData?.entriesCreated || 0}</div>
                      <div className="text-sm text-muted-foreground">Entries Created</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold">{statusData?.categoriesCreated || 0}</div>
                      <div className="text-sm text-muted-foreground">Categories Created</div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 mt-8">
                  <Button onClick={handleReset} variant="outline">Import Another</Button>
                  <Link href="/admin/entries"><Button>View Entries</Button></Link>
                </div>
              </>
            )}

            {isError && (
              <>
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mb-6">
                  <AlertCircle className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Import Failed</h2>
                <p className="text-muted-foreground mb-8">{statusData?.error || "An unexpected error occurred"}</p>
                <Button onClick={handleReset}>Try Again</Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── STEP 2: Column Mapping ─────────────────────────────────────────
  const categoryMapped = mappings.find(m => m.approved && m.targetField === "category");
  const tagsMapped = mappings.find(m => m.approved && m.targetField === "tags");

  if (step === "map") {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Map Your Columns</h1>
            <p className="text-gray-500 mt-1">
              Review how each CSV column maps to a directory field. Toggle off columns to skip them.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
            <Badge variant="outline">{rowCount} data rows</Badge>
            <Badge variant="secondary">{approvedCount} columns mapped</Badge>
            {skippedCount > 0 && <Badge variant="outline">{skippedCount} skipped</Badge>}
          </div>
        </div>

        {/* Special fields callout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Category */}
          <div className={`rounded-lg border p-4 flex items-start gap-3 transition-colors ${
            categoryMapped
              ? "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800"
              : "bg-gray-50 dark:bg-gray-800/40 border-dashed"
          }`}>
            <div className={`mt-0.5 rounded-md p-1.5 ${categoryMapped ? "bg-violet-100 dark:bg-violet-900/50 text-violet-600" : "bg-gray-200 dark:bg-gray-700 text-gray-400"}`}>
              <FolderOpen className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${categoryMapped ? "text-violet-900 dark:text-violet-100" : "text-muted-foreground"}`}>
                  Category
                </span>
                {categoryMapped ? (
                  <Badge className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300 border-0">
                    ✓ mapped from <code className="font-mono ml-1">{categoryMapped.csvColumn}</code>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">not mapped</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Each value is matched to an existing category or created automatically. One category per entry.
              </p>
            </div>
          </div>

          {/* Tags */}
          <div className={`rounded-lg border p-4 flex items-start gap-3 transition-colors ${
            tagsMapped
              ? "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800"
              : "bg-gray-50 dark:bg-gray-800/40 border-dashed"
          }`}>
            <div className={`mt-0.5 rounded-md p-1.5 ${tagsMapped ? "bg-teal-100 dark:bg-teal-900/50 text-teal-600" : "bg-gray-200 dark:bg-gray-700 text-gray-400"}`}>
              <Tag className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${tagsMapped ? "text-teal-900 dark:text-teal-100" : "text-muted-foreground"}`}>
                  Tags
                </span>
                {tagsMapped ? (
                  <Badge className="text-xs bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300 border-0">
                    ✓ mapped from <code className="font-mono ml-1">{tagsMapped.csvColumn}</code>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">not mapped</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Accepts a comma-separated list of keywords (e.g. <span className="font-mono">react, startup, saas</span>). Multiple tags per entry.
              </p>
            </div>
          </div>
        </div>

        {/* Mapping table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Column Mappings</CardTitle>
            <CardDescription>
              The system has automatically suggested mappings based on your column names.
              Adjust the dropdown or toggle off columns you don't need.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase bg-gray-50/70 dark:bg-gray-800/50 border-y">
                    <th className="px-4 py-3 text-left font-medium w-10">Import</th>
                    <th className="px-4 py-3 text-left font-medium">CSV Column</th>
                    <th className="px-4 py-3 text-left font-medium">Sample Values</th>
                    <th className="px-4 py-3 text-left font-medium">Maps To</th>
                    <th className="px-4 py-3 text-left font-medium">Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {mappings.map((m) => {
                    const isCategory = m.approved && m.targetField === "category";
                    const isTags = m.approved && m.targetField === "tags";
                    return (
                      <tr
                        key={m.csvColumn}
                        className={`transition-colors ${
                          !m.approved || m.targetField === "skip"
                            ? "opacity-50 bg-gray-50/50 dark:bg-gray-900/30"
                            : isCategory
                            ? "bg-violet-50/50 dark:bg-violet-950/20 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                            : isTags
                            ? "bg-teal-50/50 dark:bg-teal-950/20 hover:bg-teal-50 dark:hover:bg-teal-950/30"
                            : "hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                        }`}
                      >
                        {/* Toggle */}
                        <td className="px-4 py-3">
                          <Switch
                            checked={m.approved && m.targetField !== "skip"}
                            onCheckedChange={(checked) => {
                              updateMapping(m.csvColumn, "approved", checked);
                              if (!checked) updateMapping(m.csvColumn, "targetField", "skip");
                            }}
                          />
                        </td>

                        {/* Column name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                              {m.csvColumn}
                            </code>
                            {isCategory && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400">
                                <FolderOpen className="h-3 w-3" /> Category
                              </span>
                            )}
                            {isTags && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400">
                                <Tag className="h-3 w-3" /> Tags
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Sample values */}
                        <td className="px-4 py-3 max-w-[260px]">
                          <div className="space-y-0.5">
                            {m.sampleValues.slice(0, 2).map((v, i) => (
                              <div key={i} className="text-xs text-muted-foreground truncate" title={v}>
                                <Eye className="inline h-3 w-3 mr-1 opacity-50" />
                                {v || <span className="italic opacity-40">empty</span>}
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* Target field dropdown */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <Select
                              value={m.targetField}
                              onValueChange={(val) => {
                                updateMapping(m.csvColumn, "targetField", val);
                                updateMapping(m.csvColumn, "approved", val !== "skip");
                              }}
                              disabled={!m.approved}
                            >
                              <SelectTrigger className={`h-8 text-xs w-[220px] ${
                                isCategory ? "border-violet-300 dark:border-violet-700 ring-violet-100" :
                                isTags ? "border-teal-300 dark:border-teal-700 ring-teal-100" : ""
                              }`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {availableFields.map(f => (
                                  <SelectItem key={f.value} value={f.value}>
                                    <div className="flex items-center gap-2">
                                      {f.value === "category" && <FolderOpen className="h-3 w-3 text-violet-500 shrink-0" />}
                                      {f.value === "tags" && <Tag className="h-3 w-3 text-teal-500 shrink-0" />}
                                      <span className="font-medium">{f.label}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {isCategory && (
                              <p className="text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1">
                                <Info className="h-3 w-3 shrink-0" />
                                Creates a new category if the value doesn't exist yet
                              </p>
                            )}
                            {isTags && (
                              <p className="text-xs text-teal-600 dark:text-teal-400 flex items-center gap-1">
                                <Info className="h-3 w-3 shrink-0" />
                                Comma-separated — each value becomes a searchable tag
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Confidence */}
                        <td className="px-4 py-3">
                          <ConfidenceDot confidence={m.confidence} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep("upload")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Upload
          </Button>
          <Button
            onClick={handleImport}
            disabled={importMutation.isPending || approvedCount === 0}
            size="lg"
          >
            {importMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…</>
            ) : (
              <>Start Import ({rowCount} rows) <ArrowRight className="ml-2 h-4 w-4" /></>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── STEP 1: Upload ─────────────────────────────────────────────────
  const hasContent = csvContent.trim().length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import CSV</h1>
        <p className="text-gray-500 mt-1">
          Upload your CSV to map its columns to directory fields before importing.
        </p>
      </div>

      {/* Process steps callout */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { n: "1", title: "Upload CSV", desc: "Drop your file or paste raw CSV" },
          { n: "2", title: "Map Columns", desc: "Review and approve each field mapping" },
          { n: "3", title: "Import", desc: "Data is saved with correct structure" },
        ].map((s) => (
          <div key={s.n} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg p-3 border">
            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shrink-0">
              {s.n}
            </div>
            <div>
              <div className="font-medium text-sm">{s.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Source</CardTitle>
          <CardDescription>
            Upload a CSV file or paste the content directly. Your column headers will be matched
            to directory fields in the next step.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900 p-4 flex items-start">
            <FileText className="h-5 w-5 mr-3 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium mb-1 text-blue-900 dark:text-blue-100">CSV requirements</p>
              <ul className="list-disc list-inside text-blue-700 dark:text-blue-300 space-y-1 ml-1">
                <li>First row must be a header row (column names)</li>
                <li>Any column structure supported — you'll map each one in Step 2</li>
                <li>Supported fields: name, description, dates, venue, location, category, website, and more</li>
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
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => !selectedFile && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />

                {selectedFile ? (
                  <div className="p-8 flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                    </div>
                    <p className="font-semibold">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {(selectedFile.size / 1024).toFixed(1)} KB · {rowCount} data rows detected
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
                    <p className="text-base font-medium text-gray-700 dark:text-gray-300">Drop your CSV file here</p>
                    <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    >
                      <Upload className="h-4 w-4 mr-2" /> Choose File
                    </Button>
                    <p className="text-xs text-muted-foreground mt-3">Supports .csv files</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="paste" className="mt-0">
              <Textarea
                placeholder={"name,description,website,city,start_date\nAcme Expo,Annual tech expo,https://acme.com,Austin,2026-03-15\n..."}
                className="font-mono text-sm min-h-[280px] whitespace-pre"
                value={csvContent}
                onChange={(e) => { setCsvContent(e.target.value); setSelectedFile(null); }}
              />
              {csvContent.trim() && (
                <p className="text-xs text-muted-foreground mt-2">
                  {rowCount} data rows detected
                </p>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleAnalyze}
              disabled={!hasContent || analyzeMutation.isPending}
              size="lg"
            >
              {analyzeMutation.isPending ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analyzing…</>
              ) : (
                <>Review Column Mapping <ArrowRight className="ml-2 h-5 w-5" /></>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
