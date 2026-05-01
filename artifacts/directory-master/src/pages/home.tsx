import { Link } from "wouter";
import {
  useGetPublicStats,
  useGetFeaturedEntries,
  useGetRecentEntries,
  useGetPublicSettings,
} from "@workspace/api-client-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, ArrowRight } from "lucide-react";
import { FontLoader } from "@/components/template/FontLoader";
import {
  mergeTemplateSettings,
  getFontFamily,
  SectionConfig,
  SectionProps,
} from "@/lib/templateTypes";

function sectionStyle(props: SectionProps | undefined): React.CSSProperties {
  if (!props) return {};
  const style: React.CSSProperties = {};
  if (props.fontFamily) style.fontFamily = getFontFamily(props.fontFamily);
  if (props.backgroundColor) style.backgroundColor = props.backgroundColor;
  return style;
}

function alignClass(p: SectionProps | undefined): string {
  const a = p?.textAlignment ?? "left";
  return a === "center" ? "text-center" : a === "right" ? "text-right" : "text-left";
}

export default function HomePage() {
  const { data: settings } = useGetPublicSettings();
  const { data: stats } = useGetPublicStats();
  const { data: featured } = useGetFeaturedEntries();
  const { data: recent, isLoading: recentLoading } = useGetRecentEntries();

  const ts = mergeTemplateSettings((settings as any)?.templateSettings);
  const themeColor = (settings as any)?.themeColor || "#2563eb";
  const hpFont = getFontFamily(ts.homepage.font);
  const isDemo = !recentLoading && recent && recent.length === 0;

  const enabledSections = ts.homepage.sections.filter(s => s.enabled);

  const renderEntryCard = (entry: any, demo = false) => (
    <Card key={entry.id} className="h-full flex flex-col hover:border-primary/50 transition-colors">
      <CardHeader>
        <div className="flex justify-between items-start mb-2">
          {entry.category && (
            <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">
              {entry.category}
            </Badge>
          )}
          {demo && <Badge variant="outline">Demo</Badge>}
        </div>
        <CardTitle className="line-clamp-2 text-xl">{entry.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        {entry.summary && (
          <p className="text-muted-foreground line-clamp-3 text-sm">{entry.summary}</p>
        )}
        {entry.location && (
          <div className="flex items-center text-sm text-muted-foreground mt-4">
            <MapPin className="mr-1 h-4 w-4" />
            <span className="line-clamp-1">{entry.location}</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-4 border-t">
        <Link href={`/entry/${entry.id}`} className="w-full">
          <Button variant="ghost" className="w-full group">
            View Details
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );

  const demoEntries = [
    { id: "demo1", title: "Tech Conference 2024", category: "Events", summary: "Annual gathering of tech enthusiasts and industry leaders.", location: "San Francisco, CA" },
    { id: "demo2", title: "Acme Innovations", category: "Companies", summary: "Leading provider of next-generation cloud infrastructure.", location: "New York, NY" },
    { id: "demo3", title: "Web Developer Toolkit", category: "Resources", summary: "Comprehensive collection of tools for modern web development.", location: "Online" },
  ];

  function renderSection(section: SectionConfig) {
    const p = section.props ?? {};
    const type = section.type ?? section.id;

    if (type === "hero") {
      const hasBg = !!p.backgroundImage;
      const paddingClass = p.padding === "sm" ? "py-12 lg:py-16" : p.padding === "lg" ? "py-28 lg:py-40" : "py-20 lg:py-32";
      const bgStyle: React.CSSProperties = hasBg
        ? {
            backgroundImage: `url(${p.backgroundImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
        : { backgroundColor: p.backgroundColor || undefined };

      return (
        <section
          key={section.id}
          className={`${paddingClass} border-b relative overflow-hidden`}
          style={bgStyle}
        >
          {hasBg && (
            <div
              className="absolute inset-0"
              style={{ backgroundColor: `rgba(0,0,0,${(p.overlayOpacity ?? 50) / 100})` }}
            />
          )}
          <div className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${alignClass(p)}`}
            style={p.fontFamily ? { fontFamily: getFontFamily(p.fontFamily) } : {}}
          >
            <h1
              className="font-extrabold tracking-tight mb-6"
              style={{
                color: p.headingColor || (hasBg ? "#ffffff" : undefined),
                fontSize: p.headingFontSize || "clamp(2rem, 5vw, 3.75rem)",
              }}
            >
              {settings?.homepageHeadline || section.heading || "Discover the Best Resources"}
            </h1>
            <p
              className="max-w-3xl mx-auto mb-10"
              style={{
                color: p.textColor || (hasBg ? "#e2e8f0" : undefined),
                fontSize: p.bodyFontSize || "1.125rem",
              }}
            >
              {settings?.homepageDescription || "A curated directory of tools, companies, and events."}
            </p>
            {p.buttonText && (
              <a
                href={p.buttonUrl || "/browse"}
                className="inline-block px-8 py-3 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: p.buttonColor || themeColor, fontSize: p.bodyFontSize || "1rem" }}
              >
                {p.buttonText}
              </a>
            )}
          </div>
        </section>
      );
    }

    if (type === "categories") {
      if (!stats || stats.categoryBreakdown.length === 0) return null;
      const max = p.maxItems ?? 8;
      return (
        <section key={section.id} style={sectionStyle(p)}>
          <div className="flex justify-between items-end mb-8">
            <h2
              className="text-2xl font-bold tracking-tight"
              style={{
                color: p.headingColor || undefined,
                fontSize: p.headingFontSize || undefined,
                fontFamily: p.fontFamily ? getFontFamily(p.fontFamily) : undefined,
              }}
            >
              {section.heading || "Browse by Category"}
            </h2>
            <Link href="/browse" className="text-primary hover:underline font-medium flex items-center">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {stats.categoryBreakdown.slice(0, max).map((cat) => (
              <Link key={cat.category} href={`/browse/${encodeURIComponent(cat.category)}`}>
                <Card className="hover:border-primary/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer text-center py-6">
                  <CardTitle className="text-lg">{cat.category}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">{cat.count} entries</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      );
    }

    if (type === "featured") {
      if (!featured || featured.length === 0) return null;
      const max = p.maxItems ?? 3;
      return (
        <section key={section.id} style={sectionStyle(p)}>
          <h2
            className="text-2xl font-bold tracking-tight mb-8"
            style={{
              color: p.headingColor || undefined,
              fontSize: p.headingFontSize || undefined,
              fontFamily: p.fontFamily ? getFontFamily(p.fontFamily) : undefined,
            }}
          >
            {section.heading || "Featured"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featured.slice(0, max).map(entry => renderEntryCard(entry))}
          </div>
        </section>
      );
    }

    if (type === "recent") {
      const max = p.maxItems ?? 6;
      return (
        <section key={section.id} style={sectionStyle(p)}>
          <div className="flex justify-between items-end mb-8">
            <h2
              className="text-2xl font-bold tracking-tight"
              style={{
                color: p.headingColor || undefined,
                fontSize: p.headingFontSize || undefined,
                fontFamily: p.fontFamily ? getFontFamily(p.fontFamily) : undefined,
              }}
            >
              {section.heading || "Recently Added"}
            </h2>
            <Link href="/browse" className="text-primary hover:underline font-medium flex items-center">
              Browse all <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
          {isDemo ? (
            <div className="space-y-6">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
                <p className="text-yellow-800 dark:text-yellow-200">
                  <strong>No entries found.</strong> Your directory is empty. Here are demo entries to show how it looks.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {demoEntries.map(e => renderEntryCard(e, true))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recent?.slice(0, max).map(e => renderEntryCard(e))}
            </div>
          )}
        </section>
      );
    }

    if (type === "custom-text") {
      return (
        <section
          key={section.id}
          className={`rounded-xl px-8 py-10 ${alignClass(p)}`}
          style={{
            backgroundColor: p.backgroundColor || undefined,
            fontFamily: p.fontFamily ? getFontFamily(p.fontFamily) : undefined,
          }}
        >
          {section.heading && (
            <h2
              className="font-bold mb-4"
              style={{
                color: p.headingColor || undefined,
                fontSize: p.headingFontSize || "1.5rem",
              }}
            >
              {section.heading}
            </h2>
          )}
          {p.richBodyText ? (
            <div
              className="prose prose-gray dark:prose-invert max-w-none"
              style={{ color: p.textColor || undefined, fontSize: p.bodyFontSize || undefined }}
              dangerouslySetInnerHTML={{ __html: p.richBodyText }}
            />
          ) : p.bodyText ? (
            <p style={{ color: p.textColor || undefined, fontSize: p.bodyFontSize || undefined }}>
              {p.bodyText}
            </p>
          ) : null}
          {p.buttonText && (
            <a
              href={p.buttonUrl || "#"}
              className="inline-block mt-6 px-6 py-2.5 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: p.buttonColor || themeColor }}
            >
              {p.buttonText}
            </a>
          )}
        </section>
      );
    }

    if (type === "custom-image") {
      if (!p.imageUrl) return null;
      return (
        <section
          key={section.id}
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: p.backgroundColor || undefined }}
        >
          <img
            src={p.imageUrl}
            alt={p.imageCaption || section.heading || ""}
            className="w-full object-cover"
          />
          {p.imageCaption && (
            <p className="text-sm text-muted-foreground text-center px-4 py-2">{p.imageCaption}</p>
          )}
        </section>
      );
    }

    return null;
  }

  const heroSection = enabledSections.find(s => (s.type ?? s.id) === "hero");
  const nonHeroSections = enabledSections.filter(s => (s.type ?? s.id) !== "hero");

  return (
    <div className="flex flex-col min-h-screen" style={{ fontFamily: hpFont }}>
      <FontLoader fontKey={ts.homepage.font} />

      {heroSection && renderSection(heroSection)}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full space-y-20">
        {nonHeroSections.map(s => renderSection(s))}
      </div>
    </div>
  );
}
