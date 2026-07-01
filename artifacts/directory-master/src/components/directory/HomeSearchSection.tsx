import { useState } from "react";
import { Link } from "wouter";
import {
  useListPublicEntries,
  useGetPublicStats,
  useGetPublicSettings,
} from "@workspace/api-client-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MapPin, ArrowRight, Loader2, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mergeTemplateSettings } from "@/lib/templateTypes";

const PAGE_SIZE = 9;

export function HomeSearchSection() {
  const [keyword, setKeyword] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [activeLocation, setActiveLocation] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [page, setPage] = useState(1);

  const { data: settings } = useGetPublicSettings();
  const { data: stats } = useGetPublicStats();
  const ts = mergeTemplateSettings((settings as any)?.templateSettings);

  const combinedSearch = [activeSearch, activeLocation].filter(Boolean).join(" ");

  const { data: entriesData, isLoading } = useListPublicEntries({
    page,
    limit: PAGE_SIZE,
    search: combinedSearch || undefined,
    category: selectedCategory || undefined,
    sort: "newest",
  });

  const categories = stats?.categoryBreakdown ?? [];
  const entries = entriesData?.entries ?? [];
  const total = (entriesData as any)?.total ?? 0;
  const totalPages = entriesData?.totalPages ?? 1;

  const isFiltered = !!combinedSearch || !!selectedCategory;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(keyword);
    setActiveLocation(locationInput);
    setPage(1);
  };

  const handleCategoryClick = (cat: string) => {
    setSelectedCategory(prev => prev === cat ? "" : cat);
    setPage(1);
  };

  const clearAll = () => {
    setKeyword("");
    setLocationInput("");
    setActiveSearch("");
    setActiveLocation("");
    setSelectedCategory("");
    setPage(1);
  };

  const browseUrl = () => {
    const params = new URLSearchParams();
    if (combinedSearch) params.set("search", combinedSearch);
    if (selectedCategory) params.set("category", selectedCategory);
    const q = params.toString();
    return q ? `/browse?${q}` : "/browse";
  };

  const cardFields = ts.browse.cardFields;
  const showField = (id: string) => cardFields.includes(id);

  return (
    <section className="border-b pb-14">
      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm p-4 mb-6">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search by name, breed, discipline…"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              className="pl-9 h-11 text-sm"
            />
          </div>
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="City or State (e.g. Austin, TX)"
              value={locationInput}
              onChange={e => setLocationInput(e.target.value)}
              className="pl-9 h-11 text-sm"
            />
          </div>
          <Button type="submit" className="h-11 px-8 shrink-0 font-semibold">
            Search
          </Button>
        </form>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* ── Left sidebar — filters ──────────────────────────────────────── */}
        <aside className="lg:w-56 xl:w-64 shrink-0">
          <div className="sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Filters
              </h3>
              {isFiltered && (
                <button
                  onClick={clearAll}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>

            {/* Category dropdown */}
            {categories.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Category</p>
                <Select
                  value={selectedCategory || "__all__"}
                  onValueChange={val => {
                    setSelectedCategory(val === "__all__" ? "" : val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Categories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.category} value={cat.category}>
                        {cat.category} ({cat.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </aside>

        {/* ── Right — results grid ────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Result count + view-all */}
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm text-muted-foreground">
              {isLoading ? (
                <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</span>
              ) : (
                <span><strong className="text-foreground">{total.toLocaleString()}</strong> listing{total !== 1 ? "s" : ""} found</span>
              )}
            </p>
            <Link href={browseUrl()} className="text-primary hover:underline text-sm font-medium flex items-center gap-1">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading listings…
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No listings found</p>
              <p className="text-sm mt-1">Try adjusting your search or filters.</p>
              {isFiltered && (
                <Button variant="outline" size="sm" className="mt-4" onClick={clearAll}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {entries.map((entry: any) => (
                  <Card key={entry.id} className="flex flex-col hover:border-primary/50 transition-colors">
                    <CardHeader className="pb-2">
                      {showField("category") && entry.category && (
                        <Badge
                          variant="secondary"
                          className="w-fit mb-2 bg-primary/10 text-primary cursor-pointer hover:bg-primary/20"
                          onClick={() => handleCategoryClick(entry.category)}
                        >
                          {entry.category}
                        </Badge>
                      )}
                      <CardTitle className="line-clamp-2 text-base leading-snug">
                        {entry.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow pb-2">
                      {entry.summary && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{entry.summary}</p>
                      )}
                      {showField("location") && entry.location && (
                        <div className="flex items-center text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 mr-1 shrink-0" />
                          <span className="line-clamp-1">{entry.location}</span>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="pt-3 border-t">
                      <Link href={`/entry/${(entry as any).slug || entry.id}`} className="w-full">
                        <Button variant="ghost" size="sm" className="w-full group">
                          View Details
                          <ArrowRight className="ml-2 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-8">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    ← Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next →
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
