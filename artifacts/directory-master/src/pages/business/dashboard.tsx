import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useBusinessAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Star, Zap, Building2, LogOut, ExternalLink, Search, PlusCircle, CreditCard, AlertTriangle } from "lucide-react";

const EXPIRY_WARNING_WINDOW_DAYS = 7;

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

type Entry = {
  id: number;
  title: string;
  category?: string | null;
  location?: string | null;
  published: boolean;
  featured: boolean;
  premium: boolean;
};

type Subscription = {
  id: number;
  entryId: number;
  plan: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
};

type Listing = { entry: Entry; subscription: Subscription | null };

export default function BusinessDashboardPage() {
  const bizAuth = useBusinessAuth();
  const [, setLocation] = useLocation();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [claimQuery, setClaimQuery] = useState("");
  const [claimResults, setClaimResults] = useState<Entry[]>([]);
  const [claimSearching, setClaimSearching] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/business/my-listings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load listings");
      const data = await res.json();
      setListings(data.listings ?? []);
    } catch {
      setError("Could not load your listings. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!bizAuth.isLoading && !bizAuth.isAuthenticated) return;
    if (bizAuth.isAuthenticated) loadListings();
  }, [bizAuth.isAuthenticated, bizAuth.isLoading, loadListings]);

  // Self-serve claim search — restricted server-side to unclaimed, published
  // listings only, so this can never surface someone else's already-claimed
  // business.
  useEffect(() => {
    if (!bizAuth.isAuthenticated || claimQuery.trim().length < 2) {
      setClaimResults([]);
      return;
    }
    setClaimSearching(true);
    const handle = setTimeout(() => {
      fetch(`/api/business/claimable?search=${encodeURIComponent(claimQuery.trim())}`, {
        credentials: "include",
      })
        .then((r) => (r.ok ? r.json() : { entries: [] }))
        .then((data) => setClaimResults(data.entries ?? []))
        .catch(() => setClaimResults([]))
        .finally(() => setClaimSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [claimQuery, bizAuth.isAuthenticated]);

  async function handleClaim(entryId: number) {
    setClaimingId(entryId);
    setClaimError(null);
    try {
      const res = await fetch("/api/business/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to claim this listing");
      setClaimQuery("");
      setClaimResults([]);
      await loadListings();
    } catch (err: any) {
      setClaimError(err.message || "Something went wrong. Please try again.");
    } finally {
      setClaimingId(null);
    }
  }

  async function handleCancel(entryId: number) {
    setCancelingId(entryId);
    setError(null);
    try {
      const res = await fetch("/api/business/cancel-plan", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancellation failed");
      await loadListings();
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setCancelingId(null);
    }
  }

  async function handleBillingPortal() {
    setBillingLoading(true);
    setBillingError(null);
    try {
      const res = await fetch("/api/business/billing-portal", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open billing portal");
      window.location.href = data.url;
    } catch (err: any) {
      setBillingError(err.message || "Something went wrong. Please try again.");
      setBillingLoading(false);
    }
  }

  if (bizAuth.isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bizAuth.isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <Building2 className="h-12 w-12 text-primary mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-3">Business Owner Login Required</h1>
        <p className="text-muted-foreground mb-8">
          Sign in to manage your listings, buy Featured or Premium upgrades, and view your billing status.
        </p>
        <Button onClick={() => bizAuth.login("/business/dashboard")}>Sign In / Sign Up</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="flex items-center justify-between gap-4 mb-10 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">My Listings</h1>
          <p className="text-muted-foreground text-sm">
            {bizAuth.user?.email ? `Signed in as ${bizAuth.user.email}` : "Manage your claimed listings."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => bizAuth.logout()}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Billing
          </CardTitle>
        </CardHeader>
        <CardContent>
          {billingError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300 mb-3">
              {billingError}
            </div>
          )}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-muted-foreground max-w-md">
              View past invoices and update your payment method through Stripe's secure billing portal.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBillingPortal}
              disabled={billingLoading}
            >
              {billingLoading ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Opening…</>
              ) : (
                <><CreditCard className="h-3.5 w-3.5 mr-1.5" />Manage Billing</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300 mb-8">
          {error}
        </div>
      )}

      {listings &&
        (() => {
          const expiringSoon = listings.filter(
            ({ subscription }) =>
              subscription?.cancelAtPeriodEnd &&
              subscription.currentPeriodEnd &&
              daysUntil(subscription.currentPeriodEnd) <= EXPIRY_WARNING_WINDOW_DAYS,
          );
          if (expiringSoon.length === 0) return null;
          return (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3.5 mb-8 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <p className="font-medium mb-1">
                  {expiringSoon.length === 1
                    ? "Your upgrade badge is about to expire"
                    : "Your upgrade badges are about to expire"}
                </p>
                <ul className="space-y-0.5">
                  {expiringSoon.map(({ entry, subscription }) => {
                    const days = daysUntil(subscription!.currentPeriodEnd!);
                    return (
                      <li key={entry.id}>
                        <span className="font-medium">{entry.title}</span>'s {subscription!.plan} badge will be
                        removed{" "}
                        {days <= 0
                          ? "today"
                          : days === 1
                            ? "tomorrow"
                            : `in ${days} days`}{" "}
                        (on {new Date(subscription!.currentPeriodEnd!).toLocaleDateString()}) since the plan was
                        canceled. Resubscribe from Listing Plans to keep it active.
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })()}

      <Card className="mb-10">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PlusCircle className="h-4 w-4" />
            Claim a Listing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Search for your business among unclaimed listings to self-serve claim it — no
            verification or approval needed.
          </p>
          <div className="relative mb-3">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by business name…"
              value={claimQuery}
              onChange={(e) => setClaimQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {claimError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300 mb-3">
              {claimError}
            </div>
          )}

          {claimQuery.trim().length >= 2 && (
            claimSearching ? (
              <div className="py-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            ) : claimResults.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No unclaimed listings match your search.</p>
            ) : (
              <div className="space-y-1.5">
                {claimResults.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{entry.title}</span>
                      {(entry.category || entry.location) && (
                        <span className="text-xs text-muted-foreground">
                          {[entry.category, entry.location].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleClaim(entry.id)}
                      disabled={claimingId === entry.id}
                    >
                      {claimingId === entry.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Claim"
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !listings || listings.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">No listings claimed yet</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
              Head to Listing Plans to search for your business and claim it, then upgrade to Featured or Premium.
            </p>
            <Button onClick={() => setLocation("/listing-plans")}>Browse Listing Plans</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5">
          {listings.map(({ entry, subscription }) => (
            <Card key={entry.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                    {entry.title}
                    {entry.premium && <Badge className="bg-primary">Premium</Badge>}
                    {!entry.premium && entry.featured && <Badge variant="secondary">Featured</Badge>}
                    {!entry.published && <Badge variant="outline">Unpublished</Badge>}
                  </CardTitle>
                  {(entry.category || entry.location) && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {[entry.category, entry.location].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <a
                  href={`/entry/${entry.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
                >
                  View <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </CardHeader>
              <CardContent>
                {subscription ? (
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="text-sm">
                      {subscription.cancelAtPeriodEnd ? (
                        <p className="text-amber-700 dark:text-amber-400">
                          Your {subscription.plan} plan is set to cancel
                          {subscription.currentPeriodEnd
                            ? ` on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                            : " at the end of the billing period"}
                          . The badge stays active until then.
                        </p>
                      ) : (
                        <p className="text-muted-foreground">
                          Active {subscription.plan} plan
                          {subscription.currentPeriodEnd
                            ? ` — renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                            : ""}
                          .
                        </p>
                      )}
                    </div>
                    {!subscription.cancelAtPeriodEnd && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancel(entry.id)}
                        disabled={cancelingId === entry.id}
                      >
                        {cancelingId === entry.id ? (
                          <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Canceling…</>
                        ) : (
                          "Cancel Plan"
                        )}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <p className="text-sm text-muted-foreground">No active upgrade on this listing.</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocation(`/listing-plans?entryId=${entry.id}`)}
                      >
                        <Zap className="h-3.5 w-3.5 mr-1.5" />
                        Buy Featured
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setLocation(`/listing-plans?entryId=${entry.id}`)}
                      >
                        <Star className="h-3.5 w-3.5 mr-1.5" />
                        Buy Premium
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
