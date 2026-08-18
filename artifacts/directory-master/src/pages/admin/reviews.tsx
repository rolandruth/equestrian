import {
  useListAdminReviews,
  useUpdateReviewApproval,
  useDeleteReview,
  getListAdminReviewsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Star, Trash2, Check, X, MessageSquare } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

export default function AdminReviewsPage() {
  const { data: reviewsData, isLoading } = useListAdminReviews();
  const queryClient = useQueryClient();
  const updateApproval = useUpdateReviewApproval();
  const deleteReview = useDeleteReview();

  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");

  const allReviews = reviewsData ?? [];
  const pendingCount = allReviews.filter((r) => !r.isApproved).length;
  const reviews =
    filter === "all" ? allReviews : allReviews.filter((r) => (filter === "approved" ? r.isApproved : !r.isApproved));

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListAdminReviewsQueryKey() });

  const handleSetApproval = async (id: number, isApproved: boolean) => {
    setBusyId(id);
    try {
      await updateApproval.mutateAsync({ id, data: { isApproved } });
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (pendingDeleteId === null) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setBusyId(id);
    try {
      await deleteReview.mutateAsync({ id });
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete review?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the review. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white"
            >
              Delete Review
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reviews</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              New reviews are hidden from the site until you approve them.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(["pending", "approved", "all"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
                className="capitalize"
              >
                {f}
                {f === "pending" && pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 px-1.5">{pendingCount}</Badge>
                )}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">Loading...</div>
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <MessageSquare className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-lg">
                {filter === "pending" ? "No reviews waiting for approval" : "No reviews here yet"}
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                {filter === "pending"
                  ? "When visitors leave a review, it will appear here for approval."
                  : "Reviews will show up here as visitors submit them."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-xl border bg-card p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{r.reviewerName}</span>
                      <Stars rating={r.rating} />
                      {r.isApproved ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300">Approved</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300">Pending</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <span>{formatDate(r.createdAt)}</span>
                      {r.entryTitle && (
                        <>
                          <span>·</span>
                          <Link href={`/entry/${r.entryId}`} className="text-primary hover:underline">
                            {r.entryTitle}
                          </Link>
                        </>
                      )}
                      {r.reviewerEmail && (
                        <>
                          <span>·</span>
                          <span>{r.reviewerEmail}</span>
                        </>
                      )}
                    </div>
                    {r.body && <p className="text-sm mt-2 whitespace-pre-wrap">{r.body}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.isApproved ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.id}
                        onClick={() => handleSetApproval(r.id, false)}
                      >
                        <X className="h-4 w-4 mr-1" /> Unapprove
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busyId === r.id}
                        onClick={() => handleSetApproval(r.id, true)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(r.id)}
                      disabled={busyId === r.id}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 transition-colors disabled:opacity-40"
                      title="Delete review"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
