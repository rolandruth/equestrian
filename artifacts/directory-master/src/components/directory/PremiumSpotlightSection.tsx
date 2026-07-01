import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Crown, MapPin, ArrowRight, Sparkles } from "lucide-react";
import { mergeTemplateSettings } from "@/lib/templateTypes";
import { useGetPublicSettings } from "@workspace/api-client-react";
import { useState, useEffect } from "react";

export function PremiumSpotlightSection() {
  const { data: settings } = useGetPublicSettings();
  const ts = mergeTemplateSettings((settings as any)?.templateSettings);
  const cardFields = ts.browse.cardFields;
  const showField = (id: string) => cardFields.includes(id);

  const [premium, setPremium] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/public/premium")
      .then(r => r.json())
      .then(data => { setPremium(Array.isArray(data) ? data : []); })
      .catch(() => setPremium([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading || premium.length === 0) return null;

  return (
    <section className="border-b pb-10">
      {/* Section header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-full px-3 py-1">
            <Crown className="h-3.5 w-3.5 text-violet-500 fill-violet-400" />
            <span className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wide">
              Elite Featured Partners
            </span>
          </div>
        </div>
        <Link
          href="/listing-plans"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <Sparkles className="h-3 w-3" />
          Get premium placement
        </Link>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {premium.map((entry: any) => (
          <div
            key={entry.id}
            className="relative flex flex-col rounded-xl border border-violet-200 dark:border-violet-800/60 bg-gradient-to-b from-violet-50/60 to-white dark:from-violet-900/10 dark:to-gray-950 hover:border-violet-400 dark:hover:border-violet-600 transition-colors overflow-hidden"
          >
            {/* Premium ribbon */}
            <div className="absolute top-3 right-3">
              <Badge className="bg-violet-500 hover:bg-violet-500 text-white text-[10px] font-bold gap-1 px-2 py-0.5">
                <Crown className="h-2.5 w-2.5 fill-white" />
                Premium
              </Badge>
            </div>

            <div className="p-5 flex flex-col flex-grow">
              {showField("category") && entry.category && (
                <Badge variant="secondary" className="w-fit mb-2 text-[10px]">
                  {entry.category}
                </Badge>
              )}
              <h3 className="font-semibold text-base leading-snug line-clamp-2 pr-16 mb-2">
                {entry.title}
              </h3>
              {entry.summary && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3 flex-grow">
                  {entry.summary}
                </p>
              )}
              {showField("location") && entry.location && (
                <div className="flex items-center text-xs text-muted-foreground mb-4">
                  <MapPin className="h-3 w-3 mr-1 shrink-0" />
                  <span className="line-clamp-1">{entry.location}</span>
                </div>
              )}
              <Link href={`/entry/${entry.slug || entry.id}`} className="mt-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full group text-xs border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:border-violet-400"
                >
                  View Details
                  <ArrowRight className="ml-1.5 h-3 w-3 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
