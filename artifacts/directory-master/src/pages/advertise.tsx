import { useGetPublicSettings } from "@workspace/api-client-react";
import { Mail, Star, MapPin, TrendingUp, Users } from "lucide-react";

export default function AdvertisePage() {
  const { data: settings } = useGetPublicSettings();
  const siteName = settings?.siteTitle || "SaddleUpGuide";

  const opportunities = [
    {
      icon: Star,
      title: "Featured Listings",
      description:
        "Get your business pinned to the top of relevant category and browse pages. Featured listings receive significantly more clicks and visibility than standard entries.",
    },
    {
      icon: MapPin,
      title: "Sponsored Map Pins",
      description:
        "Stand out on the interactive map with a highlighted marker and priority placement. Ideal for stables, arenas, and training centers that want to capture nearby searchers.",
    },
    {
      icon: TrendingUp,
      title: "Banner Placements",
      description:
        "Reach our audience with tasteful banner ads on the homepage, browse pages, and entry detail pages. We work with you to design creative that fits the equestrian community.",
    },
    {
      icon: Users,
      title: "Newsletter Sponsorships",
      description:
        "Sponsor a dedicated section in our member newsletter. A great way to promote seasonal events, clinics, horse sales, or new product launches directly to engaged equestrians.",
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight mb-3">Advertise with Us</h1>
      <p className="text-muted-foreground mb-10 text-base leading-relaxed">
        {siteName} connects horse owners, riders, and enthusiasts with the best equestrian
        businesses in their area. Partner with us to put your brand in front of a passionate,
        targeted audience that's actively looking for what you offer.
      </p>

      <div className="grid gap-5 mb-14">
        {opportunities.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="flex items-start gap-4 p-6 bg-gray-50 dark:bg-gray-900 border rounded-xl"
          >
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white mb-1">{title}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-xl p-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Ready to get started?
        </h2>
        <p className="text-muted-foreground text-sm mb-6">
          Reach out and tell us a bit about your business and what you're looking to promote.
          We'll put together a package that fits your goals and budget.
        </p>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Mail className="h-4 w-4 text-primary" />
          </div>
          <a
            href="mailto:advertise@saddleupguide.com"
            className="text-primary hover:underline font-medium"
          >
            advertise@saddleupguide.com
          </a>
        </div>
      </div>
    </div>
  );
}
