import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGetPublicSettings } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Megaphone, ImageIcon, Loader2, PartyPopper } from "lucide-react";

type Availability = { placement: string; available: boolean };

const PLACEMENTS = [
  {
    key: "homepage",
    label: "Homepage Banner",
    price: 99,
    description:
      "A wide banner displayed below the search section on the homepage — the first thing every visitor sees. Maximum brand exposure with the highest traffic placement on the site.",
    size: "970 × 200 px recommended",
    badge: "Most Popular",
  },
  {
    key: "sidebar",
    label: "Browse Sidebar",
    price: 79,
    description:
      "A prominent ad in the sidebar of both the Browse and Homepage pages, visible to every visitor who is actively searching for equestrian businesses.",
    size: "300 × 250 px recommended",
    badge: null,
  },
  {
    key: "browse_inline",
    label: "Browse — Between Listings",
    price: 89,
    description:
      "A full-width banner injected between listing cards on the browse page. Reaches high-intent visitors right as they're evaluating options — ideal for direct competition.",
    size: "728 × 90 px recommended",
    badge: "High Intent",
  },
  {
    key: "entry_page",
    label: "Entry Detail Page",
    price: 49,
    description:
      "A targeted ad shown on every individual listing page, just above the reviews section. Reaches engaged visitors who are already deep in the decision-making process.",
    size: "336 × 280 px recommended",
    badge: null,
  },
];

const BUNDLE_PRICE = 249;

export default function AdvertisePage() {
  const { data: settings } = useGetPublicSettings();
  const siteName = (settings as any)?.siteTitle || "SaddleUpGuide";
  const [availability, setAvailability] = useState<Availability[] | null>(null);
  const [loadingPlacement, setLoadingPlacement] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [location] = useLocation();

  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const successPlacement = params.get("success") === "1" ? params.get("placement") : null;
  const canceled = params.get("canceled") === "1";

  useEffect(() => {
    fetch("/api/ads/availability")
      .then((r) => r.json())
      .then(setAvailability)
      .catch(() => setAvailability([]));
  }, []);

  const availMap = Object.fromEntries(
    (availability ?? []).map((a) => [a.placement, a.available])
  );
  const availableCount = Object.values(availMap).filter(Boolean).length;
  const allSoldOut = availability !== null && availableCount === 0;

  async function handleCheckout(placement: string) {
    setLoadingPlacement(placement);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placement }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setLoadingPlacement(null);
    }
  }

  if (successPlacement) {
    const item = PLACEMENTS.find((p) => p.key === successPlacement);
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <PartyPopper className="h-14 w-14 text-green-500 mx-auto mb-6" />
        <h1 className="text-3xl font-bold mb-3">You're live!</h1>
        <p className="text-muted-foreground text-base mb-2">
          Your <strong>{item?.label ?? successPlacement}</strong> ad has been confirmed.
          Send your image to <a href="mailto:advertise@saddleupguide.com" className="underline">advertise@saddleupguide.com</a> and we'll get it live within 24 hours.
        </p>
        {item && (
          <p className="text-sm text-muted-foreground mt-2">
            Required image size: <span className="font-mono font-semibold">{item.size}</span>
          </p>
        )}
        <Button className="mt-8" onClick={() => window.location.href = "/advertise"}>
          Back to Advertise
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Header */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Advertise with {siteName}</h1>
        </div>
        <p className="text-muted-foreground text-base leading-relaxed max-w-2xl">
          Put your brand in front of thousands of horse owners, riders, and equestrian enthusiasts
          who are actively searching for businesses like yours. We offer four exclusive ad placements —
          one advertiser per spot, guaranteed.
        </p>
      </div>

      {canceled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 mb-8">
          Checkout was canceled — your card was not charged.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300 mb-8">
          {error}
        </div>
      )}

      {/* Sold-out state */}
      {allSoldOut ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-10 text-center mb-10">
          <XCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold">All Ad Spots Are Sold Out This Month</h2>
        </div>
      ) : (
        <>
          {/* Placement cards */}
          <div className="grid gap-5 mb-10">
            {PLACEMENTS.map((p) => {
              const isAvailable = availability === null ? null : (availMap[p.key] ?? true);
              const isLoading = loadingPlacement === p.key;
              return (
                <div
                  key={p.key}
                  className={`relative rounded-xl border p-6 transition-colors ${
                    isAvailable === false
                      ? "bg-muted/40 border-border opacity-60"
                      : "bg-background border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-lg">{p.label}</h3>
                        {p.badge && isAvailable !== false && (
                          <Badge variant="secondary" className="text-xs">{p.badge}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                        {p.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground font-medium">Required image size:</span>
                        <span className="text-xs font-mono font-semibold">{p.size}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-2xl font-bold">${p.price}</p>
                        <p className="text-xs text-muted-foreground">per month</p>
                      </div>
                      {isAvailable === null ? (
                        <Badge variant="outline" className="text-xs">Checking…</Badge>
                      ) : isAvailable ? (
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium text-green-600 dark:text-green-400">Available</span>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleCheckout(p.key)}
                            disabled={loadingPlacement !== null}
                          >
                            {isLoading ? (
                              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Processing…</>
                            ) : (
                              "Buy Now"
                            )}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Sold</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bundle — only shown when all 4 slots are free */}
          {availableCount === 4 && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-6 mb-10">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg mb-1">Directory Sponsor Bundle</h3>
                  <p className="text-sm text-muted-foreground">
                    All four placements — homepage banner, browse sidebar, between-card ad, and entry
                    page — for one flat monthly rate. Maximum coverage, best value.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-3xl font-bold">${BUNDLE_PRICE}</p>
                    <p className="text-xs text-muted-foreground">per month — saves $67</p>
                  </div>
                  <Button
                    onClick={() => handleCheckout("bundle")}
                    disabled={loadingPlacement !== null}
                  >
                    {loadingPlacement === "bundle" ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                    ) : (
                      "Buy Bundle"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
