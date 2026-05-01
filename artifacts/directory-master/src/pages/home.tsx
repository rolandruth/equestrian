import { Link } from "wouter";
import { 
  useGetPublicStats,
  useGetFeaturedEntries,
  useGetRecentEntries,
  useGetPublicSettings
} from "@workspace/api-client-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, ArrowRight } from "lucide-react";
import { FontLoader } from "@/components/template/FontLoader";
import { mergeTemplateSettings, getFontFamily } from "@/lib/templateTypes";

export default function HomePage() {
  const { data: settings } = useGetPublicSettings();
  const { data: stats } = useGetPublicStats();
  const { data: featured } = useGetFeaturedEntries();
  const { data: recent, isLoading: recentLoading } = useGetRecentEntries();

  const ts = mergeTemplateSettings((settings as any)?.templateSettings);
  const hpFont = getFontFamily(ts.homepage.font);
  const isDemo = !recentLoading && recent && recent.length === 0;

  const getSectionEnabled = (id: string) =>
    ts.homepage.sections.find(s => s.id === id)?.enabled ?? true;
  const getSectionHeading = (id: string, fallback: string) =>
    ts.homepage.sections.find(s => s.id === id)?.heading || fallback;

  const orderedSections = ts.homepage.sections.filter(s => s.enabled).map(s => s.id);

  const renderEntryCard = (entry: any, isDemo = false) => (
    <Card key={entry.id} className="h-full flex flex-col hover:border-primary/50 transition-colors">
      <CardHeader>
        <div className="flex justify-between items-start mb-2">
          {entry.category && (
            <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">
              {entry.category}
            </Badge>
          )}
          {isDemo && <Badge variant="outline">Demo</Badge>}
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

  const heroSection = (
    <section
      key="hero"
      className="py-20 lg:py-32 border-b relative overflow-hidden"
      style={
        ts.homepage.heroImageUrl
          ? {
              backgroundImage: `url(${ts.homepage.heroImageUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : { backgroundColor: "var(--background)" }
      }
    >
      {ts.homepage.heroImageUrl && (
        <div className="absolute inset-0 bg-black/50" />
      )}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1
          className={`text-4xl lg:text-6xl font-extrabold tracking-tight mb-6 ${
            ts.homepage.heroImageUrl ? "text-white" : "text-gray-900 dark:text-white"
          }`}
        >
          {settings?.homepageHeadline || "Discover the Best Resources"}
        </h1>
        <p
          className={`text-xl max-w-3xl mx-auto mb-10 ${
            ts.homepage.heroImageUrl ? "text-gray-100" : "text-gray-600 dark:text-gray-300"
          }`}
        >
          {settings?.homepageDescription || "A curated directory of tools, companies, and events."}
        </p>
      </div>
    </section>
  );

  const categoriesSection = stats && stats.categoryBreakdown.length > 0 ? (
    <section key="categories">
      <div className="flex justify-between items-end mb-8">
        <h2 className="text-2xl font-bold tracking-tight">
          {getSectionHeading("categories", "Browse by Category")}
        </h2>
        <Link href="/browse" className="text-primary hover:underline font-medium flex items-center">
          View all <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {stats.categoryBreakdown.slice(0, 8).map((cat) => (
          <Link key={cat.category} href={`/browse/${encodeURIComponent(cat.category)}`}>
            <Card className="hover:border-primary/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer text-center py-6">
              <CardTitle className="text-lg">{cat.category}</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">{cat.count} entries</p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  ) : null;

  const featuredSection = featured && featured.length > 0 ? (
    <section key="featured">
      <h2 className="text-2xl font-bold tracking-tight mb-8">
        {getSectionHeading("featured", "Featured")}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {featured.map(entry => renderEntryCard(entry))}
      </div>
    </section>
  ) : null;

  const recentSection = (
    <section key="recent">
      <div className="flex justify-between items-end mb-8">
        <h2 className="text-2xl font-bold tracking-tight">
          {getSectionHeading("recent", "Recently Added")}
        </h2>
        <Link href="/browse" className="text-primary hover:underline font-medium flex items-center">
          Browse all <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </div>
      {isDemo ? (
        <div className="space-y-6">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
            <p className="text-yellow-800 dark:text-yellow-200">
              <strong>No entries found.</strong> Your directory is empty. Here are some demo entries to show how it looks.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {demoEntries.map(entry => renderEntryCard(entry, true))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recent?.map(entry => renderEntryCard(entry))}
        </div>
      )}
    </section>
  );

  const sectionMap: Record<string, React.ReactNode> = {
    hero: heroSection,
    categories: categoriesSection,
    featured: featuredSection,
    recent: recentSection,
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ fontFamily: hpFont }}>
      <FontLoader fontKey={ts.homepage.font} />

      {orderedSections.includes("hero") && heroSection}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full space-y-20">
        {orderedSections
          .filter(id => id !== "hero")
          .map(id => sectionMap[id] ?? null)}
      </div>
    </div>
  );
}
