import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { StarRating, StarPicker } from "./StarRating";
import { MessageSquare, CheckCircle2 } from "lucide-react";

async function fetchReviews(entryId: number) {
  const res = await fetch(`/api/public/reviews/${entryId}`);
  if (!res.ok) throw new Error("Failed to fetch reviews");
  return res.json();
}

async function submitReview(data: {
  entryId: number;
  reviewerName: string;
  reviewerEmail: string;
  rating: number;
  body: string;
}) {
  const res = await fetch("/api/public/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to submit review");
  return res.json();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface ReviewsSectionProps {
  entryId: number;
  themeColor?: string;
}

export function ReviewsSection({ entryId, themeColor }: ReviewsSectionProps) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["reviews", entryId],
    queryFn: () => fetchReviews(entryId),
  });

  const mutation = useMutation({
    mutationFn: submitReview,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews", entryId] });
      setSubmitted(true);
      setName(""); setEmail(""); setRating(0); setBody("");
    },
    onError: () => setError("Failed to submit. Please try again."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (rating === 0) { setError("Please select a star rating."); return; }
    mutation.mutate({ entryId, reviewerName: name, reviewerEmail: email, rating, body });
  };

  const reviews = data?.reviews ?? [];
  const avgRating: number | null = data?.avgRating ?? null;
  const totalReviews: number = data?.totalReviews ?? 0;

  return (
    <div className="pt-8">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-2xl font-bold tracking-tight">Reviews</h2>
        {avgRating !== null && totalReviews > 0 && (
          <div className="flex items-center gap-2">
            <StarRating rating={avgRating} showNumber totalReviews={totalReviews} />
          </div>
        )}
      </div>

      <Separator className="mb-6" />

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading reviews...</p>
      ) : reviews.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground mb-6">
          <MessageSquare className="h-4 w-4" />
          <span className="text-sm">No reviews yet. Be the first!</span>
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          {reviews.map((r: any) => (
            <Card key={r.id} className="bg-gray-50 dark:bg-gray-900/50 border-0">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                        {r.reviewerName.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-sm">{r.reviewerName}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <StarRating rating={r.rating} size="sm" />
                    <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                  </div>
                </div>
                {r.body && <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 leading-relaxed">{r.body}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Write a Review</h3>
        {submitted ? (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <span>Thanks for your review!</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="mb-1 block text-sm">Your Rating *</Label>
              <StarPicker value={rating} onChange={setRating} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="rev-name" className="mb-1 block text-sm">Name *</Label>
                <Input id="rev-name" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} maxLength={100} />
              </div>
              <div>
                <Label htmlFor="rev-email" className="mb-1 block text-sm">Email (optional)</Label>
                <Input id="rev-email" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="rev-body" className="mb-1 block text-sm">Your Review</Label>
              <Textarea
                id="rev-body"
                placeholder="Share your experience..."
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={4}
                maxLength={2000}
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button
              type="submit"
              disabled={mutation.isPending}
              style={themeColor ? { backgroundColor: themeColor } : {}}
            >
              {mutation.isPending ? "Submitting..." : "Submit Review"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
