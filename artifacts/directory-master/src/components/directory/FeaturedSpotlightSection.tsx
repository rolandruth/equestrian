import { Link } from "wouter";
import { useGetFeaturedEntries, useGetPublicSettings, useGetPublicStats } from "@workspace/api-client-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin, ArrowRight, Zap } from "lucide-react";
import { mergeTemplateSettings } from "@/lib/templateTypes";
import { getPublicEntryPath } from "@/lib/entryPath";
import { isCategoryQualified, getCategoryHubPath } from "@/lib/seoLinks";

export function FeaturedSpotlightSection() {
  const { data: featured, isLoading } = useGetFeaturedEntries();
  const { data: settings } = useGetPublicSettings();
  const { data: stats } = useGetPublicStats();
  const ts = mergeTemplateSettings((settings as any)?.templateSettings);
  const cardFields = ts.browse.cardFields;
  const showField = (id: string) => cardFields.includes(id);
  const categoryBreakdown = stats?.categoryBreakdown ?? [];

  if (isLoading || !featured || featured.length === 0) return null;

  return (
    <section className="border-b pb-10">
      {/* Section header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-full px-3 py-1">
            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
              Sponsored Listings
            </span>
          </div>
        </div>
        <Link
          href="/listing-plans"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <Zap className="h-3 w-3" />
          Get featured here
        </Link>
      </div>

      {/* Cards — horizontal scroll on mobile, grid on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {featured.slice(0, 4).map((entry: any) => {
          const entryHref = getPublicEntryPath(entry);
          const catQualified =
            entry.category &&
            showField("category") &&
            isCategoryQualified(entry.category, categoryBreakdown);

          return (
            <Card
              key={entry.id}
              className="h-full flex flex-col border-amber-200 dark:border-amber-800/60 bg-amber-50/30 dark:bg-amber-900/10 hover:border-amber-400 dark:hover:border-amber-700 transition-colors relative overflow-hidden"
            >
              {/* Featured ribbon */}
              <div className="absolute top-3 right-3">
                <Badge className="bg-amber-400 hover:bg-amber-400 text-amber-900 text-[10px] font-bold gap-1 px-2 py-0.5">
                  <Star className="h-2.5 w-2.5 fill-amber-900" />
                  Featured
                </Badge>
              </div>

              <CardHeader className="pb-2 pr-20">
                {showField("category") && entry.category && (
                  catQualified ? (
                    <Link href={getCategoryHubPath(entry.category)} className="w-fit mb-1.5">
                      <Badge variant="secondary" className="text-[10px] hover:bg-secondary/80">
                        {entry.category}
                      </Badge>
                    </Link>
                  ) : (
                    <Badge variant="secondary" className="w-fit mb-1.5 text-[10px]">
                      {entry.category}
                    </Badge>
                  )
                )}
                <CardTitle className="text-base leading-snug line-clamp-2">
                  <Link href={entryHref} className="hover:text-primary transition-colors">
                    {entry.title}
                  </Link>
                </CardTitle>
              </CardHeader>

              <CardContent className="flex-grow pb-2">
                {entry.summary && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {entry.summary}
                  </p>
                )}
                {showField("location") && entry.location && (
                  <div className="flex items-center text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 mr-1 shrink-0" />
                    <span className="line-clamp-1">{entry.location}</span>
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-3 border-t border-amber-200 dark:border-amber-800/40">
                <Link
                  href={entryHref}
                  className="w-full inline-flex items-center justify-center rounded-md px-3 py-2 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30 group transition-colors"
                >
                  View Details
                  <ArrowRight className="ml-1.5 h-3 w-3 transition-transform group-hover:translate-x-1" />
                </Link>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
