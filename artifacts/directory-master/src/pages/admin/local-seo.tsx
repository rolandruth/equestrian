import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useGetLocalSeoSummary,
  usePreviewLocalSeoClassifications,
  useApplyLocalSeoClassifications,
  useGetLocalSeoReview,
  useUpdateEntryClassification,
} from "@workspace/api-client-react";
import type { 
  LocalSeoReviewRow,
  EntryClassificationUpdate 
} from "@workspace/api-client-react";
import {
  MapPin,
  Sparkles,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  Map,
} from "lucide-react";

export default function AdminLocalSeoPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  
  const authHeaders = { "Authorization": `Bearer ${token}` };
  
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useGetLocalSeoSummary({
    request: { headers: authHeaders }
  });
  
  const [page, setPage] = useState(1);
  const { data: reviewData, isLoading: reviewLoading, refetch: refetchReview } = useGetLocalSeoReview(
    { page, limit: 20 },
    { request: { headers: authHeaders } }
  );

  const previewMutation = usePreviewLocalSeoClassifications({ request: { headers: authHeaders } });
  const applyMutation = useApplyLocalSeoClassifications({ request: { headers: authHeaders } });
  const updateMutation = useUpdateEntryClassification({ request: { headers: authHeaders } });

  const [previewData, setPreviewData] = useState<any | null>(null);
  
  const handlePreview = async () => {
    try {
      const res = await previewMutation.mutateAsync({ data: { limit: 5 } });
      setPreviewData(res.previews);
    } catch (e: any) {
      toast({ title: "Preview Failed", description: e.message || "An error occurred", variant: "destructive" });
    }
  };

  const handleApply = async () => {
    try {
      const res = await applyMutation.mutateAsync();
      toast({ 
        title: "Classifications Applied", 
        description: `Auto-applied ${res.locationsApplied} locations and queued ${res.servicesQueued} entries for service review.` 
      });
      setPreviewData(null);
      refetchSummary();
      refetchReview();
    } catch (e: any) {
      toast({ title: "Apply Failed", description: e.message || "An error occurred", variant: "destructive" });
    }
  };

  const handleUpdate = async (entryId: number, payload: EntryClassificationUpdate) => {
    try {
      await updateMutation.mutateAsync({ id: entryId, data: payload });
      toast({ title: "Updated successfully" });
      refetchSummary();
      refetchReview();
    } catch (e: any) {
      toast({ title: "Update Failed", description: e.message || "An error occurred", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Map className="h-6 w-6 text-primary" />
            Local SEO
          </h1>
          <p className="text-muted-foreground mt-1">
            Extract locations and services from entries to build programmatic SEO pages.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetchSummary(); refetchReview(); }}>
          <RefreshCw className={`h-4 w-4 mr-2 ${summaryLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalEntries ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Locations Extracted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.confirmedLocations ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.locationReviewQueue ?? 0} in review queue
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Services Classified</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.confirmedServices ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.serviceReviewQueue ?? 0} in review queue
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Eligible Hubs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(summary?.eligibleStateHubs ?? 0) + (summary?.eligibleCityHubs ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.eligibleStateHubs ?? 0} states, {summary?.eligibleCityHubs ?? 0} cities
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Auto-Extract Data</CardTitle>
          <CardDescription>
            Automatically analyze entry titles and contents to classify locations and services. High-confidence locations are applied instantly. Others go to the review queue. Your existing data is never overwritten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div aria-live="polite" className="sr-only">
            {applyMutation.isPending ? "Applying classifications..." : ""}
            {previewMutation.isPending ? "Loading preview..." : ""}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handlePreview} variant="outline" disabled={previewMutation.isPending || applyMutation.isPending}>
              {previewMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Preview Safe Classifications (Limit 5)
            </Button>
            <Button onClick={handleApply} disabled={previewMutation.isPending || applyMutation.isPending}>
              {applyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Apply Safe Classifications
            </Button>
          </div>
          
          {previewData && (
            <div className="mt-4 border rounded-md p-4 bg-muted/20">
              <h4 className="font-semibold mb-3">Preview Results</h4>
              {previewData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No unclassified entries found.</p>
              ) : (
                <div className="space-y-4">
                  {previewData.map((p: any) => (
                    <div key={p.entryId} className="text-sm pb-4 border-b last:border-0 last:pb-0">
                      <div className="font-medium">{p.entryTitle}</div>
                      {p.locationSuggestion && (
                        <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {p.locationSuggestion.cityName}, {p.locationSuggestion.stateName} 
                          ({Math.round((p.locationSuggestion.confidence ?? 0) * 100)}%)
                        </div>
                      )}
                      {p.serviceSuggestions?.length > 0 && (
                        <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                          <Sparkles className="h-3.5 w-3.5" />
                          {p.serviceSuggestions.map((s: any) => s.serviceSlug).join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Review Queue</CardTitle>
          <CardDescription>
            Review and approve low-confidence location or service classifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reviewLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : reviewData?.rows.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground border rounded-md border-dashed">
              No entries in the review queue.
            </div>
          ) : (
            <div className="space-y-6">
              <div aria-live="polite" className="sr-only">
                {updateMutation.isPending ? "Saving..." : updateMutation.isSuccess ? "Saved successfully" : ""}
              </div>
              {reviewData?.rows.map((row) => (
                <ReviewRow 
                  key={row.entryId} 
                  row={row} 
                  onUpdate={(payload) => handleUpdate(row.entryId, payload)} 
                  isSaving={updateMutation.isPending && updateMutation.variables?.id === row.entryId}
                />
              ))}
              
              <div className="flex items-center justify-between border-t pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {reviewData?.totalPages ?? 1}
                </span>
                <Button 
                  variant="outline" 
                  onClick={() => setPage(page + 1)}
                  disabled={page >= (reviewData?.totalPages ?? 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewRow({ row, onUpdate, isSaving }: { row: LocalSeoReviewRow; onUpdate: (payload: EntryClassificationUpdate) => void; isSaving?: boolean }) {
  const [cityName, setCityName] = useState(row.location?.cityName ?? "");
  const [stateName, setStateName] = useState(row.location?.stateName ?? "");
  const [postalCode, setPostalCode] = useState(row.location?.postalCode ?? "");
  
  const [selectedServices, setSelectedServices] = useState<Set<string>>(
    new Set((row.serviceSuggestions ?? []).map((s) => s.serviceSlug).filter(Boolean) as string[])
  );

  const handleToggleService = (slug: string) => {
    const next = new Set(selectedServices);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelectedServices(next);
  };

  const handleApprove = () => {
    onUpdate({
      locationStatus: "confirmed",
      cityName,
      stateName,
      postalCode,
      reviewedSuggestionServiceSlugs: Array.from(selectedServices),
    });
  };

  const handleReject = () => {
    const isLocationConfirmed = row.location?.locationStatus === "confirmed";
    onUpdate({
      locationStatus: isLocationConfirmed ? "confirmed" : "rejected",
      cityName: isLocationConfirmed ? cityName : null,
      stateName: isLocationConfirmed ? stateName : null,
      postalCode: isLocationConfirmed ? postalCode : null,
      reviewedSuggestionServiceSlugs: [],
    });
  };

  const isLocationConfirmed = row.location?.locationStatus === "confirmed";

  return (
    <div className={`border rounded-md p-4 space-y-4 transition-opacity ${isSaving ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex justify-between items-start">
        <div>
          <div className="font-semibold">{row.entryTitle}</div>
          <div className="text-sm text-muted-foreground mt-0.5">Original Location: {row.originalLocation || "None"}</div>
          {row.location?.locationConfidence && (
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Suggested Match ({Math.round(row.location.locationConfidence * 100)}% confidence via {row.location.locationSource || 'AI'})
            </div>
          )}
          {isLocationConfirmed && (
            <div className="text-xs text-green-600 dark:text-green-500 mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Location already confirmed
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReject} disabled={isSaving}>
            Reject Suggestions
          </Button>
          <Button size="sm" onClick={handleApprove} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Approve
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
        <div>
          <label htmlFor={`city-${row.entryId}`} className="text-xs font-medium text-muted-foreground mb-1 block">City</label>
          <Input id={`city-${row.entryId}`} value={cityName} onChange={e => setCityName(e.target.value)} placeholder="City" className="h-8" />
        </div>
        <div>
          <label htmlFor={`state-${row.entryId}`} className="text-xs font-medium text-muted-foreground mb-1 block">State</label>
          <Input id={`state-${row.entryId}`} value={stateName} onChange={e => setStateName(e.target.value)} placeholder="Full state name or abbreviation" className="h-8" />
          <p className="mt-1 text-[11px] text-muted-foreground">Abbreviations are saved as full state names.</p>
        </div>
        <div>
          <label htmlFor={`postal-${row.entryId}`} className="text-xs font-medium text-muted-foreground mb-1 block">Postal Code</label>
          <Input id={`postal-${row.entryId}`} value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="Zip" className="h-8" />
        </div>
      </div>

      {row.serviceSuggestions && row.serviceSuggestions.length > 0 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">Suggested Services</label>
          <div className="flex flex-wrap gap-2">
            {row.serviceSuggestions.map((s) => {
              if (!s.serviceSlug) return null;
              const isSelected = selectedServices.has(s.serviceSlug);
              return (
                <button
                  type="button"
                  key={s.serviceSlug}
                  aria-pressed={isSelected}
                  onClick={() => handleToggleService(s.serviceSlug!)}
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                    isSelected 
                      ? "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80" 
                      : "border-input bg-background hover:bg-accent hover:text-accent-foreground text-foreground"
                  }`}
                >
                  {s.serviceLabel || s.serviceSlug}
                  {s.confidence && (
                    <span className="ml-1 opacity-70">
                      ({Math.round(s.confidence * 100)}%)
                    </span>
                  )}
                  {isSelected && <CheckCircle2 className="ml-1.5 h-3 w-3" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
