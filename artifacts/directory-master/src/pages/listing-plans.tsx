import { useGetPublicSettings } from "@workspace/api-client-react";
import { Check, Star, Zap } from "lucide-react";

type PlanKey = "featured" | "premium";

const plans: {
  key: PlanKey;
  name: string;
  price: string;
  description: string;
  badge: string;
  highlight: boolean;
  features: string[];
}[] = [
  {
    key: "featured",
    name: "Featured Listing",
    price: "$39",
    description: "Stand out from the crowd with priority placement and richer profile options.",
    badge: "Most Popular",
    highlight: true,
    features: [
      "All pictures on detail page",
      "Website link",
      '"Featured" badge on listing',
    ],
  },
  {
    key: "premium",
    name: "Premium Listing",
    price: "$99",
    description: "Maximum exposure — own your category and dominate local search.",
    badge: "Best Value",
    highlight: false,
    features: [
      "Everything in Featured",
      "Homepage placement",
      '"Premium" badge on listing',
    ],
  },
];

export default function ListingPlansPage() {
  useGetPublicSettings();

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
              <div className="flex items-baseline gap-1 mb-1">
                <span className="font-bold text-3xl">{plan.price}</span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{plan.description}</p>
            </div>

            {/* Feature list */}
            <ul className="space-y-2.5 flex-grow">
              {plan.features.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Check className={`h-4 w-4 mt-0.5 shrink-0 ${plan.highlight ? "text-primary" : "text-green-500"}`} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-muted-foreground mt-6 font-bold">
        In order to buy a listing plan email us at{" "}
        <a href="mailto:info@saddleupguide.com" className="text-primary hover:underline">
          info@saddleupguide.com
        </a>
      </p>
    </div>
  );
}
