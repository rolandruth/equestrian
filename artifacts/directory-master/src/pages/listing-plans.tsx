import { useEffect, useRef, useState } from "react";
import { useGetPublicSettings } from "@workspace/api-client-react";
import { Check, Star, Zap, Loader2, PartyPopper, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type PlanKey = "featured" | "premium";

type EntryResult = {
  id: number;
  title: string;
  category?: string | null;
  location?: string | null;
};

const plans: {
  key: PlanKey;
  name: string;
  price: string;
  description: string;
  badge: string;
  highlight: boolean;
  features: string[];
  cta: string;
}[] = [
  {
    key: "featured",
    name: "Featured Listing",
    price: "$39",
    description: "Stand out from the crowd with priority placement and richer profile options.",
    badge: "Most Popular",
    highlight: true,
    features: [
      "Up to 5 pictures on detail page",
      "Website link",
      '"Featured" badge on listing',
    ],
    cta: "Get Featured",
  },
  {
    key: "premium",
    name: "Premium Listing",
    price: "$150",
    description: "Maximum exposure — own your category and dominate local search.",
    badge: "Best Value",
    highlight: false,
    features: [
      "Everything in Featured",
      "Additional 5 pictures on detail page",
      "Homepage placement",
      '"Premium" badge on listing',
    ],
    cta: "Go Premium",
  },
];

// Stripe Checkout sets Cross-Origin-Opener-Policy: same-origin, which severs
// window.opener as soon as the popup navigates to checkout.stripe.com — even
// after it returns to our own origin. Worse, that COOP header can move the
// popup into an isolated browsing context group/agent cluster, which also
// breaks same-origin BroadcastChannel and storage-event delivery back to the
// original tab. So we don't rely on ANY window-to-window messaging: the main
// tab instead polls the entry's actual featured/premium status from the
// server while checkout is in progress, which is 100% reliable since it's
// the same signal the webhook itself writes. window.name (unlike
// window.opener) survives cross-origin navigation, so we still use it purely
// so the popup can recognize itself and self-close — no data needs to flow
// back through it.
const CHECKOUT_POPUP_WINDOW_NAME = "saddleup-checkout-popup";

export default function ListingPlansPage() {
  const { data: settings } = useGetPublicSettings();
  const siteName = settings?.siteTitle || "SaddleUpGuide";

  const [pickerPlan, setPickerPlan] = useState<PlanKey | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntryResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<EntryResult | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedUpgrade, setConfirmedUpgrade] = useState<{ plan: PlanKey; entry: string } | null>(null);
  // What we're waiting to see flip in the database. This drives polling and is
  // intentionally independent from the popup window/dialog lifecycle so the
  // banner can still appear even if the user closes the popup right after paying.
  const [pendingUpgrade, setPendingUpgrade] = useState<{ entryId: number; plan: PlanKey; entryTitle: string } | null>(null);
  const checkoutWindowRef = useRef<Window | null>(null);

  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const successPlan = params.get("success") === "1" ? (params.get("plan") as PlanKey | null) : null;
  const successEntry = params.get("entry");
  const canceled = params.get("canceled") === "1";
  const isCheckoutPopup = typeof window !== "undefined" && window.name === CHECKOUT_POPUP_WINDOW_NAME;

  // This page is also rendered inside the popup tab after Stripe redirects back to
  // the success_url. If we're in that popup, just close ourselves — the original
  // tab confirms success on its own by polling the entry's status, so no
  // cross-window messaging is needed here at all.
  useEffect(() => {
    if (!successPlan || !isCheckoutPopup) return;
    const timer = setTimeout(() => window.close(), 1800);
    return () => clearTimeout(timer);
  }, [successPlan, isCheckoutPopup]);

  // While an upgrade is pending, poll the entry's actual featured/premium status
  // from the server — this is the same field the webhook writes, so it's a
  // reliable success signal regardless of what happens to the popup window.
  useEffect(() => {
    if (!pendingUpgrade) return;
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`/api/public/entries/${pendingUpgrade.entryId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const upgraded = pendingUpgrade.plan === "premium" ? data.premium : data.featured;
        if (upgraded && !cancelled) {
          setConfirmedUpgrade({ plan: pendingUpgrade.plan, entry: pendingUpgrade.entryTitle });
          setPendingUpgrade(null);
          setCheckingOut(false);
          checkoutWindowRef.current?.close();
          checkoutWindowRef.current = null;
          closePicker();
        }
      } catch {
        // transient network error — keep polling
      }
    };

    check();
    const interval = setInterval(check, 2000);
    // Give up after a while so we don't poll forever if the user abandoned checkout.
    const giveUp = setTimeout(() => {
      cancelled = true;
      clearInterval(interval);
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(giveUp);
    };
  }, [pendingUpgrade]);

  // If the user closes the checkout tab manually, stop showing the "processing"
  // dialog state — the upgrade poll above keeps running in the background in
  // case the webhook lands a moment later.
  useEffect(() => {
    const interval = setInterval(() => {
      if (checkoutWindowRef.current?.closed) {
        checkoutWindowRef.current = null;
        setCheckingOut(false);
        closePicker();
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!pickerPlan) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      fetch(`/api/public/entries?search=${encodeURIComponent(query.trim())}&limit=8`)
        .then((r) => r.json())
        .then((data) => setResults(data.entries ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, pickerPlan]);

  function openPicker(plan: PlanKey) {
    setPickerPlan(plan);
    setQuery("");
    setResults([]);
    setSelectedEntry(null);
    setError(null);
  }

  function closePicker() {
    setPickerPlan(null);
    setSelectedEntry(null);
    setQuery("");
    setResults([]);
    setError(null);
  }

  async function handleConfirm() {
    if (!pickerPlan || !selectedEntry) return;
    setCheckingOut(true);
    setError(null);

    // Open the tab synchronously (within the click's event handler) so browsers
    // don't treat it as a popup-blocked, non-user-initiated navigation. This also
    // avoids trying to navigate the app's own frame to Stripe, which can silently
    // fail when the app is embedded (e.g. previewed inside an iframe).
    const checkoutWindow = window.open("", "_blank");
    // Mark it via window.name (survives cross-origin navigation, unlike
    // window.opener which Stripe's COOP header severs) so the popup can
    // recognize itself once Stripe redirects back to our success_url.
    try {
      if (checkoutWindow) checkoutWindow.name = CHECKOUT_POPUP_WINDOW_NAME;
    } catch {
      // ignore
    }

    try {
      const res = await fetch("/api/stripe/checkout-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: selectedEntry.id, plan: pickerPlan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      // Start polling for the actual DB flip regardless of what happens to the
      // popup window — this is what ultimately drives the success banner.
      setPendingUpgrade({ entryId: selectedEntry.id, plan: pickerPlan, entryTitle: selectedEntry.title });

      if (checkoutWindow) {
        checkoutWindow.location.href = data.url;
        // Keep a reference so we can detect when the tab closes and
        // stop showing "processing" on this tab — the user stays here the whole time.
        checkoutWindowRef.current = checkoutWindow;
      } else {
        // Popup was blocked — fall back to a same-tab redirect.
        window.location.href = data.url;
        setCheckingOut(false);
      }
    } catch (err: any) {
      checkoutWindow?.close();
      setError(err.message || "Something went wrong. Please try again.");
      setCheckingOut(false);
    }
  }

  if (successPlan) {
    const item = plans.find((p) => p.key === successPlan);

    // This is the checkout popup tab landing on the Stripe success_url — it's
    // about to auto-close itself, so show a brief "you're done, closing" state.
    // The original tab confirms success independently via polling.
    if (isCheckoutPopup) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-24 text-center">
          <PartyPopper className="h-14 w-14 text-green-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold mb-3">You're upgraded!</h1>
          <p className="text-muted-foreground text-base mb-2">
            {successEntry ? <strong>{successEntry}</strong> : "Your listing"} is now on the{" "}
            <strong>{item?.name ?? successPlan}</strong> plan.
          </p>
          <p className="text-sm text-muted-foreground mt-6">
            This tab will close automatically — you can also close it yourself.
          </p>
        </div>
      );
    }

    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <PartyPopper className="h-14 w-14 text-green-500 mx-auto mb-6" />
        <h1 className="text-3xl font-bold mb-3">You're upgraded!</h1>
        <p className="text-muted-foreground text-base mb-2">
          {successEntry ? <strong>{successEntry}</strong> : "Your listing"} is now on the{" "}
          <strong>{item?.name ?? successPlan}</strong> plan.
        </p>
        <Button className="mt-8" onClick={() => (window.location.href = "/listing-plans")}>
          Back to Listing Plans
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Header */}
      <div className="text-center mb-14">
        <h1 className="text-3xl font-bold tracking-tight mb-3">Listing Plans</h1>
        <p className="text-muted-foreground text-base max-w-xl mx-auto">
          Reach thousands of horse owners, riders, and equestrian enthusiasts looking for
          exactly what you offer. Choose the plan that fits your goals.
        </p>
      </div>

      {canceled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 mb-8 max-w-3xl mx-auto">
          Checkout was canceled — your card was not charged.
        </div>
      )}

      {confirmedUpgrade && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 px-4 py-3 text-sm text-green-800 dark:text-green-300 mb-8 max-w-3xl mx-auto flex items-center gap-2">
          <PartyPopper className="h-4 w-4 shrink-0" />
          <span>
            {confirmedUpgrade.entry ? <strong>{confirmedUpgrade.entry}</strong> : "Your listing"} is now on the{" "}
            <strong>{plans.find((p) => p.key === confirmedUpgrade.plan)?.name ?? confirmedUpgrade.plan}</strong> plan!
          </span>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-14 max-w-3xl mx-auto w-full">
        {plans.map(plan => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-2xl border p-8 ${
              plan.highlight
                ? "border-primary shadow-lg shadow-primary/10 bg-primary/5 dark:bg-primary/10"
                : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950"
            }`}
          >
            {/* Badge */}
            {plan.badge && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full ${
                  plan.highlight
                    ? "bg-primary text-white"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                }`}>
                  {plan.highlight ? <Star className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                  {plan.badge}
                </span>
              </div>
            )}

            {/* Plan name & price */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-1">{plan.name}</h2>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="font-bold text-3xl">{plan.price}</span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{plan.description}</p>
            </div>

            {/* Feature list */}
            <ul className="space-y-2.5 flex-grow mb-8">
              {plan.features.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Check className={`h-4 w-4 mt-0.5 shrink-0 ${plan.highlight ? "text-primary" : "text-green-500"}`} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Button
              onClick={() => openPicker(plan.key)}
              className={`w-full ${plan.highlight ? "bg-primary hover:bg-primary/90 text-white" : ""}`}
              variant={plan.highlight ? "default" : "default"}
            >
              {plan.cta}
            </Button>
          </div>
        ))}
      </div>

      {/* Business picker dialog */}
      <Dialog open={pickerPlan !== null} onOpenChange={(open) => !open && closePicker()}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>
              {pickerPlan === "featured" ? "Get Featured" : "Go Premium"}
            </DialogTitle>
            <DialogDescription>
              Search for your business listing to upgrade it. No account needed.
            </DialogDescription>
          </DialogHeader>

          {!selectedEntry ? (
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search your business by name…"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {query.trim().length < 2 ? (
                  <CommandEmpty>Type at least 2 characters to search.</CommandEmpty>
                ) : searching ? (
                  <div className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                  </div>
                ) : results.length === 0 ? (
                  <CommandEmpty>No matching listings found.</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {results.map((entry) => (
                      <CommandItem
                        key={entry.id}
                        value={String(entry.id)}
                        onSelect={() => setSelectedEntry(entry)}
                        className="cursor-pointer"
                      >
                        <Search className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span className="font-medium">{entry.title}</span>
                          {(entry.category || entry.location) && (
                            <span className="text-xs text-muted-foreground">
                              {[entry.category, entry.location].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          ) : (
            <div className="p-4">
              <div className="rounded-lg border p-4 mb-4">
                <p className="text-xs text-muted-foreground mb-1">Upgrading</p>
                <p className="font-semibold">{selectedEntry.title}</p>
                {(selectedEntry.category || selectedEntry.location) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[selectedEntry.category, selectedEntry.location].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300 mb-4">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedEntry(null)}
                  disabled={checkingOut}
                >
                  Back
                </Button>
                <Button className="flex-1" onClick={handleConfirm} disabled={checkingOut}>
                  {checkingOut ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                  ) : (
                    `Continue to Payment`
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
