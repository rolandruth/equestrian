import { useEffect, useState } from "react";
import { useGetPublicSettings } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Megaphone, ImageIcon, Mail } from "lucide-react";

type Availability = { placement: string; available: boolean };

const CONTACT_EMAIL = "info@saddleupguide.com";

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

function mailtoFor(subject: string) {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export default function AdvertisePage() {
  const { data: settings } = useGetPublicSettings();
  const siteName = (settings as any)?.siteTitle || "SaddleUpGuide";
  const [availability, setAvailability] = useState<Availability[] | null>(null);

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
        <p className="text-sm font-medium mt-4">
          To book an ad placement, email us at{" "}
          <a href={mailtoFor(`Ad placement inquiry — ${siteName}`)} className="text-primary hover:underline">
            {CONTACT_EMAIL}
          </a>{" "}
          and we'll get you set up.
        </p>
      </div>

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
                          <Button size="sm" asChild>
                            <a href={mailtoFor(`Ad placement inquiry — ${p.label}`)}>
                              <Mail className="h-3.5 w-3.5 mr-1.5" />
                              Email to Book
                            </a>
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
                  <Button asChild>
                    <a href={mailtoFor("Ad placement inquiry — Directory Sponsor Bundle")}>
                      <Mail className="h-4 w-4 mr-2" />
                      Email to Book
                    </a>
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
