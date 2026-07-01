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
    <section className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-12 bg-gradient-to-br from-[#0f0c29] via-[#1a1040] to-[#24243e] rounded-2xl relative overflow-hidden">
      {/* Decorative glow blobs */}
      <div className="absolute -top-20 -left-20 w-72 h-72 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Section header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 bg-violet-500/20 border border-violet-400/30 rounded-full px-3 py-1">
              <Crown className="h-3.5 w-3.5 text-violet-300 fill-violet-400" />
              <span className="text-xs font-bold text-violet-300 uppercase tracking-widest">
                Elite Featured Partners
              </span>
            </div>
          </div>
          <p className="text-white/50 text-sm">Hand-selected top providers in the equestrian community</p>
        </div>
        <Link href="/listing-plans">
          <Button
            variant="outline"
            size="sm"
            className="border-violet-400/40 text-violet-300 hover:bg-violet-500/20 hover:border-violet-400/60 bg-transparent text-xs gap-1.5 shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Get Elite Placement
          </Button>
        </Link>
      </div>

      {/* Cards */}
      <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {premium.map((entry: any) => (
          <div
            key={entry.id}
            className="group flex flex-col rounded-xl border border-violet-100 bg-white hover:border-violet-300 hover:shadow-lg hover:shadow-violet-900/20 transition-all duration-200 overflow-hidden"
          >
            {/* Top accent line */}
            <div className="h-0.5 w-full bg-gradient-to-r from-violet-500 via-indigo-400 to-violet-500" />

            <div className="p-5 flex flex-col flex-grow">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  {showField("category") && entry.category && (
                    <Badge className="mb-2 text-[10px] bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50">
                      {entry.category}
                    </Badge>
                  )}
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
                    {entry.title}
                  </h3>
                </div>
                <Crown className="h-4 w-4 text-violet-500 fill-violet-400 shrink-0 mt-0.5" />
              </div>

              {entry.summary && (
                <p className="text-gray-500 text-xs line-clamp-2 mb-3 flex-grow leading-relaxed">
                  {entry.summary}
                </p>
              )}

              {showField("location") && entry.location && (
                <div className="flex items-center text-xs text-gray-400 mb-4">
                  <MapPin className="h-3 w-3 mr-1 shrink-0" />
                  <span className="line-clamp-1">{entry.location}</span>
                </div>
              )}

              <Link href={`/entry/${entry.slug || entry.id}`} className="mt-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full group/btn text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 border border-transparent hover:border-violet-200 transition-all"
                >
                  View Details
                  <ArrowRight className="ml-1.5 h-3 w-3 transition-transform group-hover/btn:translate-x-1" />
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
