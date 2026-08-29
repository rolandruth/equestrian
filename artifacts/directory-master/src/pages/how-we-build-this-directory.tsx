import { useEffect } from "react";
import { Link } from "wouter";
import {
  BadgeCheck,
  Building2,
  Database,
  FileSearch,
  Flag,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGE_TITLE = "How We Build the SaddleUpGuide Directory";
const PAGE_DESCRIPTION =
  "Learn how SaddleUpGuide gathers, reviews, updates, and corrects horse riding lesson and equestrian business listings across the United States.";
const PAGE_PATH = "/how-we-build-this-directory";

function upsertMeta(
  attribute: "name" | "property",
  key: string,
  content: string,
): void {
  let element = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function useMethodologyMetadata(): void {
  useEffect(() => {
    const canonicalUrl = `${window.location.origin}${PAGE_PATH}`;
    const imageUrl = `${window.location.origin}/opengraph.jpg`;

    document.title = PAGE_TITLE;
    upsertMeta("name", "description", PAGE_DESCRIPTION);
    upsertMeta("name", "robots", "index,follow");
    upsertMeta("property", "og:title", PAGE_TITLE);
    upsertMeta("property", "og:description", PAGE_DESCRIPTION);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:image", imageUrl);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", PAGE_TITLE);
    upsertMeta("name", "twitter:description", PAGE_DESCRIPTION);
    upsertMeta("name", "twitter:image", imageUrl);

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
  }, []);
}

const methodologySteps = [
  {
    icon: Database,
    title: "1. Gather",
    text: "Our editorial team adds businesses individually and through structured data imports. Information may come from publicly available business details, business websites, directory research, and requests sent to SaddleUpGuide.",
  },
  {
    icon: SearchCheck,
    title: "2. Structure",
    text: "We organize names, descriptions, contact details, websites, categories, services, and locations into a consistent directory format so visitors can search and compare listings.",
  },
  {
    icon: FileSearch,
    title: "3. Review",
    text: "Automated checks identify missing titles, normalize common location formats, and flag uncertain location or service classifications for manual review. Editors can review and correct listing details.",
  },
  {
    icon: RefreshCw,
    title: "4. Maintain",
    text: "Directory information can change. We use business-owner requests, user reports, and ongoing editorial maintenance to correct or refresh listings when newer information becomes available.",
  },
];

export default function HowWeBuildThisDirectoryPage() {
  useMethodologyMetadata();

  return (
    <article className="w-full bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-6 py-16 md:py-24 text-center">
          <span className="inline-block rounded-full bg-secondary px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-secondary-foreground mb-6">
            Transparency &amp; Trust
          </span>
          <h1 className="font-serif text-4xl md:text-6xl font-semibold leading-tight mb-6">
            How We Build This Directory
          </h1>
          <p className="max-w-2xl mx-auto text-lg md:text-xl leading-relaxed text-muted-foreground">
            SaddleUpGuide is built to make horse riding lessons and equestrian
            businesses easier to discover. Here is where our information comes
            from, how we organize it, and how you can help keep it current.
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-14 md:py-20 space-y-20">
        <section aria-labelledby="about-saddleupguide">
          <div className="flex items-center gap-3 mb-6">
            <Building2 className="h-6 w-6 text-primary" aria-hidden="true" />
            <h2
              id="about-saddleupguide"
              className="font-serif text-3xl md:text-4xl font-semibold"
            >
              About SaddleUpGuide
            </h2>
          </div>
          <div className="space-y-5 text-base md:text-lg leading-relaxed text-muted-foreground">
            <p>
              SaddleUpGuide was created because finding a local riding instructor,
              lesson program, stable, or equestrian service can require searching
              across many disconnected websites and social pages. We wanted to
              give riders and families one practical place to begin their search.
            </p>
            <p>
              The directory brings together horse riding lesson providers and
              equestrian businesses across the United States. Visitors can browse
              by location, compare available details, learn through our Saddle Up
              Guides, and contact businesses directly to confirm availability,
              pricing, services, and policies.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5 mt-10">
            <div className="rounded-2xl border border-border bg-card p-6">
              <BadgeCheck className="h-7 w-7 text-primary mb-4" aria-hidden="true" />
              <h3 className="font-serif text-xl font-semibold mb-2">
                Why we created it
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                To reduce the time it takes to discover local horse riding
                opportunities and help beginners make more informed first
                contacts with providers.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <ShieldCheck className="h-7 w-7 text-primary mb-4" aria-hidden="true" />
              <h3 className="font-serif text-xl font-semibold mb-2">
                What the directory does
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                It organizes business and service information for discovery. It
                does not replace a rider&apos;s own conversation with a stable or
                guarantee that every displayed detail remains current.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="directory-methodology">
          <div className="flex items-center gap-3 mb-6">
            <FileSearch className="h-6 w-6 text-primary" aria-hidden="true" />
            <h2
              id="directory-methodology"
              className="font-serif text-3xl md:text-4xl font-semibold"
            >
              Our Directory Methodology
            </h2>
          </div>
          <p className="text-base md:text-lg leading-relaxed text-muted-foreground mb-10">
            We use a repeatable gather, structure, review, and maintenance
            process. The exact amount of available information varies by
            business, and we avoid filling unknown fields with guesses.
          </p>

          <div className="grid md:grid-cols-2 gap-5">
            {methodologySteps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-2xl border border-border bg-card p-6 md:p-7"
                >
                  <Icon className="h-7 w-7 text-primary mb-4" aria-hidden="true" />
                  <h3 className="font-serif text-xl font-semibold mb-3">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {step.text}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="verification"
          className="rounded-3xl border border-accent bg-accent/40 p-7 md:p-10"
        >
          <div className="flex items-center gap-3 mb-5">
            <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
            <h2 id="verification" className="font-serif text-3xl font-semibold">
              How Information Is Checked
            </h2>
          </div>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              We check listing data for basic completeness and consistency.
              Automated processing can normalize common state, ZIP code, and
              location formats, preserve source details, and send uncertain
              classifications for editorial review.
            </p>
            <p>
              SaddleUpGuide does not independently inspect every business or
              guarantee every listing. Unless a page explicitly says otherwise,
              inclusion should not be understood as certification, licensing
              confirmation, safety approval, or an endorsement.
            </p>
            <p>
              Before booking, visitors should confirm prices, schedules,
              instructor qualifications, insurance, safety rules, accessibility,
              and other important details directly with the provider.
            </p>
          </div>
        </section>

        <section aria-labelledby="claims-and-updates">
          <div className="flex items-center gap-3 mb-6">
            <UserRoundCheck className="h-6 w-6 text-primary" aria-hidden="true" />
            <h2
              id="claims-and-updates"
              className="font-serif text-3xl md:text-4xl font-semibold"
            >
              How Businesses Claim and Update Listings
            </h2>
          </div>
          <div className="space-y-5 text-base md:text-lg leading-relaxed text-muted-foreground">
            <p>
              A business representative can create a business account, search
              for an existing unclaimed listing, and request control of that
              listing through the business dashboard. Listings already connected
              to another account cannot be claimed a second time through that
              flow.
            </p>
            <p>
              To add a business, correct details, or request an update that is
              not available through the dashboard, contact SaddleUpGuide. Please
              include the listing URL, the information that should change, and a
              source that helps us evaluate the request.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <Button asChild size="lg" className="rounded-full">
              <Link href="/business/dashboard">Open Business Dashboard</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link href="/contact">Request a Listing Update</Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="report-information">
          <div className="flex items-center gap-3 mb-6">
            <Flag className="h-6 w-6 text-primary" aria-hidden="true" />
            <h2
              id="report-information"
              className="font-serif text-3xl md:text-4xl font-semibold"
            >
              Report Incorrect Information
            </h2>
          </div>
          <div className="space-y-5 text-base md:text-lg leading-relaxed text-muted-foreground">
            <p>
              If a listing is closed, duplicated, in the wrong location, or
              contains outdated contact or service information, please tell us.
              Reports from visitors and businesses are an important part of
              maintaining the directory.
            </p>
            <p>
              Use the Contact Us page or email{" "}
              <a
                href="mailto:info@saddleupguide.com"
                className="text-primary font-medium hover:underline"
              >
                info@saddleupguide.com
              </a>
              . Include the listing link, the incorrect detail, the proposed
              correction, and any supporting public source you can share.
            </p>
          </div>
          <Button asChild size="lg" variant="outline" className="rounded-full mt-8">
            <Link href="/contact">Contact SaddleUpGuide</Link>
          </Button>
        </section>
      </div>
    </article>
  );
}