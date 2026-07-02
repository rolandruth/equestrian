import { Link } from "wouter";
import { useGetPublicSettings } from "@workspace/api-client-react";
import { Check, Star, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "Featured Listing",
    price: "$29–99",
    priceLabel: "$29–99/mo",
    description: "Stand out from the crowd with priority placement and richer profile options.",
    badge: "Most Popular",
    highlight: true,
    features: [
      "Up to 5 pictures on detail page",
      "Website link",
      '"Featured" badge on listing',
    ],
    cta: "Get Featured",
    ctaHref: "/advertise",
    ctaVariant: "default" as const,
  },
  {
    name: "Premium Listing",
    price: "$149–299",
    priceLabel: "$149–299/mo",
    description: "Maximum exposure — own your category and dominate local search.",
    badge: "Best Value",
    highlight: false,
    features: [
      "Everything in Featured",
      "Category sponsorship",
      "Homepage placement",
    ],
    cta: "Go Premium",
    ctaHref: "/advertise",
    ctaVariant: "default" as const,
  },
];

export default function ListingPlansPage() {
  const { data: settings } = useGetPublicSettings();
  const siteName = settings?.siteTitle || "SaddleUpGuide";

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
                <span className={`font-bold ${plan.price ? "text-3xl" : "text-2xl"}`}>
                  {plan.price ?? "Free"}
                </span>
                {plan.price && (
                  <span className="text-sm text-muted-foreground">/mo</span>
                )}
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
            <Link href={plan.ctaHref}>
              <Button
                variant={plan.ctaVariant}
                className={`w-full ${plan.highlight ? "bg-primary hover:bg-primary/90 text-white" : ""}`}
              >
                {plan.cta}
              </Button>
            </Link>
          </div>
        ))}
      </div>

      {/* Bottom note */}
      <div className="text-center bg-gray-50 dark:bg-gray-900 border rounded-xl p-8">
        <h3 className="font-semibold text-lg mb-2">Not sure which plan is right for you?</h3>
        <p className="text-muted-foreground text-sm mb-5">
          Reach out and we'll help you pick the best fit for your business size and goals.
          All paid plans include a free 7-day trial.
        </p>
        <Link href="/contact">
          <Button variant="outline">Talk to Us</Button>
        </Link>
      </div>
    </div>
  );
}
