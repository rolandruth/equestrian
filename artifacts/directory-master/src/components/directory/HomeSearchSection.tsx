import "leaflet/dist/leaflet.css";
import { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, ArrowRight, Loader2, X, LayoutGrid, List, Map, Phone, Globe } from "lucide-react";
import { mergeTemplateSettings } from "@/lib/templateTypes";
import { CardImage } from "@/components/directory/CardImage";

// Fix Leaflet default marker icons when bundled with Vite
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const PAGE_SIZE = 9;
type ViewMode = "grid" | "list" | "map";
type SortMode = "newest" | "oldest" | "az" | "za";

export function HomeSearchSection() {
  const [keyword, setKeyword] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [activeLocation, setActiveLocation] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedRidingType, setSelectedRidingType] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [MapComponents, setMapComponents] = useState<any>(null);

  const { data: settings } = useGetPublicSettings();
  const { data: stats } = useGetPublicStats();
  const ts = mergeTemplateSettings((settings as any)?.templateSettings);

  const combinedSearch = [activeSearch, activeLocation].filter(Boolean).join(" ");

  const { data: entriesData, isLoading } = useListPublicEntries({
    page,
    limit: viewMode === "map" ? 200 : PAGE_SIZE,
    search: combinedSearch || undefined,
    category: selectedCategory || undefined,
    ridingType: selectedRidingType || undefined,
    sort: sortMode === "newest" ? "newest" : "newest",
  });

  const categories = [...(stats?.categoryBreakdown ?? [])].sort((a, b) =>
    a.category.localeCompare(b.category)
  );

  let entries = entriesData?.entries ?? [];

  // Client-side sort for a/z options (API only supports newest)
  if (sortMode === "oldest") {
    entries = [...entries].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  } else if (sortMode === "az") {
    entries = [...entries].sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortMode === "za") {
    entries = [...entries].sort((a, b) => b.title.localeCompare(a.title));
  }

  const total = (entriesData as any)?.total ?? 0;
  const totalPages = entriesData?.totalPages ?? 1;
  const isFiltered = !!combinedSearch || !!selectedCategory || !!selectedRidingType;

  const cardFields = ts.browse.cardFields;
  const cardImageFields = ts.browse.cardImageFields;
  const showField = (id: string) => cardFields.includes(id);
  const getCardImage = (entry: any): string | null => {
    for (const fid of cardImageFields) {
      const val = fid.startsWith("custom:")
        ? (entry?.customFields && typeof entry.customFields === "object" ? (entry.customFields as any)[fid.slice(7)] : null)
        : (entry as any)[fid];
      if (val) return String(val);
    }
    return null;
  };

  // Lazy-load react-leaflet only when map view is activated
  useEffect(() => {
    if (viewMode === "map" && !MapComponents) {
      import("react-leaflet").then(mod => {
        setMapComponents({
          MapContainer: mod.MapContainer,
          TileLayer: mod.TileLayer,
          Marker: mod.Marker,
          Popup: mod.Popup,
        });
      });
    }
  }, [viewMode]);

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
    setSelectedRidingType("");
    setPage(1);
  };

  const browseUrl = () => {
    const params = new URLSearchParams();
    if (combinedSearch) params.set("search", combinedSearch);
    if (selectedCategory) params.set("category", selectedCategory);
    const q = params.toString();
    return q ? `/browse?${q}` : "/browse";
  };

  const mapEntries = entries.filter((e: any) => e.latitude && e.longitude);
  const defaultCenter: [number, number] = mapEntries.length > 0
    ? [mapEntries[0].latitude, mapEntries[0].longitude]
    : [39.5, -98.35];

  const ViewToggle = () => (
    <div className="flex items-center gap-1 rounded-lg border p-0.5 bg-gray-50 dark:bg-gray-900">
      {(["grid", "list", "map"] as ViewMode[]).map((mode) => {
        const Icon = mode === "grid" ? LayoutGrid : mode === "list" ? List : Map;
        return (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            title={mode.charAt(0).toUpperCase() + mode.slice(1)}
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-all ${
              viewMode === mode
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-white dark:hover:bg-gray-800"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="border-b pb-14">
      {/* Search bar */}
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
        {/* Sidebar filters */}
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
                        {cat.category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {((stats as any)?.ridingTypeBreakdown?.length > 0) && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Riding Type</p>
                <Select
                  value={selectedRidingType || "__all__"}
                  onValueChange={val => {
                    setSelectedRidingType(val === "__all__" ? "" : val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Types</SelectItem>
                    {(stats as any).ridingTypeBreakdown.map((rt: { ridingType: string; count: number }) => (
                      <SelectItem key={rt.ridingType} value={rt.ridingType}>
                        {rt.ridingType.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </aside>

        {/* Results area */}
        <div className="flex-1 min-w-0">
          {/* Toolbar: count + sort + view toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <p className="text-sm text-muted-foreground">
              {isLoading ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </span>
              ) : (
                <span>
                  <strong className="text-foreground">{total.toLocaleString()}</strong>{" "}
                  listing{total !== 1 ? "s" : ""} found
                </span>
              )}
            </p>

            <div className="flex items-center gap-2">
              {/* Sort by */}
              <Select value={sortMode} onValueChange={v => setSortMode(v as SortMode)}>
                <SelectTrigger className="h-9 text-sm w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                  <SelectItem value="az">A → Z</SelectItem>
                  <SelectItem value="za">Z → A</SelectItem>
                </SelectContent>
              </Select>

              {/* View toggle */}
              <ViewToggle />

              {/* View all */}
              <Link href={browseUrl()} className="text-primary hover:underline text-sm font-medium hidden sm:flex items-center gap-1">
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Content */}
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
              {/* ── GRID VIEW ── */}
              {viewMode === "grid" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {entries.map((entry: any) => {
                    const cardImage = getCardImage(entry);
                    return (
                    <Card key={entry.id} className="flex flex-col overflow-hidden hover:border-primary/50 transition-colors">
                      {cardImage && <CardImage src={cardImage} alt={entry.title} />}
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
                        {(entry.premium || entry.featured) && (
                          <div className="flex gap-1.5 mb-2">
                            {entry.premium && (
                              <Badge className="bg-violet-600 hover:bg-violet-700 text-white text-[10px] px-2 py-0.5">⭐ Premium</Badge>
                            )}
                            {entry.featured && !entry.premium && (
                              <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] px-2 py-0.5">★ Featured</Badge>
                            )}
                          </div>
                        )}
                        <CardTitle className="line-clamp-2 text-base leading-snug">
                          {entry.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex-grow pb-2">
                        {entry.summary && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{entry.summary}</p>
                        )}
                        <div className="space-y-1">
                          {(entry.location || entry.category) && (() => {
                            const lp = entry.location?.split(",") || [];
                            const street = lp[0]?.trim() || "";
                            const cityState = lp.slice(1).join(",").trim();
                            const cat = entry.category && !cityState.includes(entry.category) ? entry.category : "";
                            const line2 = [cityState, cat].filter(Boolean).join(", ");
                            return (
                              <div className="flex items-start text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 mr-1.5 shrink-0 mt-0.5" />
                                <div>
                                  {street && <div>{street}</div>}
                                  {line2 && <div>{line2}</div>}
                                </div>
                              </div>
                            );
                          })()}
                          {entry.contactPhone && (
                            <div className="flex items-center text-xs text-muted-foreground">
                              <Phone className="h-3 w-3 mr-1.5 shrink-0" />
                              <a href={`tel:${entry.contactPhone}`} className="hover:text-primary transition-colors" onClick={e => e.stopPropagation()}>
                                {entry.contactPhone}
                              </a>
                            </div>
                          )}
                          {(entry.featured || entry.premium) && (entry.website || (entry.customFields as any)?.website) && (() => {
                            const url = entry.website || (entry.customFields as any)?.website;
                            return (
                              <div className="flex items-center text-xs text-muted-foreground">
                                <Globe className="h-3 w-3 mr-1.5 shrink-0" />
                                <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors break-all" onClick={e => e.stopPropagation()}>
                                  {url.replace(/^https?:\/\/(www\.)?/, "")}
                                </a>
                              </div>
                            );
                          })()}
                        </div>
                      </CardContent>
                      <CardFooter className="pt-3 border-t">
                        <Link href={`/entry/${entry.slug || entry.id}`} className="w-full">
                          <Button variant="ghost" size="sm" className="w-full group">
                            View Details
                            <ArrowRight className="ml-2 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                          </Button>
                        </Link>
                      </CardFooter>
                    </Card>
                    );
                  })}
                </div>
              )}

              {/* ── LIST VIEW ── */}
              {viewMode === "list" && (
                <div className="flex flex-col divide-y border rounded-xl overflow-hidden bg-white dark:bg-gray-950">
                  {entries.map((entry: any) => (
                    <Link key={entry.id} href={`/entry/${entry.slug || entry.id}`}>
                      <div className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors group">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <span className="font-medium text-sm text-gray-900 dark:text-white group-hover:text-primary transition-colors line-clamp-1">
                              {entry.title}
                            </span>
                            {showField("category") && entry.category && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] bg-primary/10 text-primary shrink-0 cursor-pointer"
                                onClick={e => { e.preventDefault(); handleCategoryClick(entry.category); }}
                              >
                                {entry.category}
                              </Badge>
                            )}
                            {entry.premium && (
                              <Badge className="bg-violet-600 text-white text-[10px] px-2 py-0.5 shrink-0">⭐ Premium</Badge>
                            )}
                            {entry.featured && !entry.premium && (
                              <Badge className="bg-amber-500 text-white text-[10px] px-2 py-0.5 shrink-0">★ Featured</Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                            {(entry.location || entry.category) && (() => {
                              const lp = entry.location?.split(",") || [];
                              const street = lp[0]?.trim() || "";
                              const cityState = lp.slice(1).join(",").trim();
                              const cat = entry.category && !cityState.includes(entry.category) ? entry.category : "";
                              const line2 = [cityState, cat].filter(Boolean).join(", ");
                              return (
                                <div className="flex items-start text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3 mr-1 shrink-0 mt-0.5" />
                                  <div>
                                    {street && <div>{street}</div>}
                                    {line2 && <div>{line2}</div>}
                                  </div>
                                </div>
                              );
                            })()}
                            {entry.contactPhone && (
                              <div className="flex items-center text-xs text-muted-foreground">
                                <Phone className="h-3 w-3 mr-1 shrink-0" />
                                <a href={`tel:${entry.contactPhone}`} className="hover:text-primary transition-colors" onClick={e => e.stopPropagation()}>
                                  {entry.contactPhone}
                                </a>
                              </div>
                            )}
                            {(entry.featured || entry.premium) && (entry.website || (entry.customFields as any)?.website) && (() => {
                              const url = entry.website || (entry.customFields as any)?.website;
                              return (
                                <div className="flex items-center text-xs text-muted-foreground">
                                  <Globe className="h-3 w-3 mr-1 shrink-0" />
                                  <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors break-all" onClick={e => e.stopPropagation()}>
                                    {url.replace(/^https?:\/\/(www\.)?/, "")}
                                  </a>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        {entry.summary && (
                          <p className="hidden md:block text-xs text-muted-foreground line-clamp-1 max-w-xs flex-shrink">
                            {entry.summary}
                          </p>
                        )}
                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* ── MAP VIEW ── */}
              {viewMode === "map" && (
                <div className="rounded-xl overflow-hidden border" style={{ height: 520 }}>
                  {!MapComponents ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      Loading map…
                    </div>
                  ) : mapEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                      <Map className="h-10 w-10 opacity-30" />
                      <p className="font-medium">No mapped listings</p>
                      <p className="text-sm">These listings don't have coordinates yet.</p>
                    </div>
                  ) : (
                    <MapComponents.MapContainer
                      center={defaultCenter}
                      zoom={6}
                      style={{ height: "100%", width: "100%" }}
                    >
                      <MapComponents.TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      />
                      {mapEntries.map((entry: any) => (
                        <MapComponents.Marker
                          key={entry.id}
                          position={[entry.latitude, entry.longitude]}
                        >
                          <MapComponents.Popup>
                            <div className="min-w-[160px]">
                              {entry.category && (
                                <span className="text-xs font-semibold text-primary block mb-1">
                                  {entry.category}
                                </span>
                              )}
                              <strong className="text-sm block mb-1">{entry.title}</strong>
                              {(entry.location || entry.category) && (() => {
                                const lp = entry.location?.split(",") || [];
                                const street = lp[0]?.trim() || "";
                                const cityState = lp.slice(1).join(",").trim();
                                const cat = entry.category && !cityState.includes(entry.category) ? entry.category : "";
                                const line2 = [cityState, cat].filter(Boolean).join(", ");
                                return (
                                  <div className="text-xs text-gray-500 mb-2">
                                    {street && <div>{street}</div>}
                                    {line2 && <div>{line2}</div>}
                                  </div>
                                );
                              })()}
                              <a
                                href={`/entry/${entry.slug || entry.id}`}
                                className="text-xs text-primary font-medium hover:underline"
                              >
                                View Details →
                              </a>
                            </div>
                          </MapComponents.Popup>
                        </MapComponents.Marker>
                      ))}
                    </MapComponents.MapContainer>
                  )}
                </div>
              )}

              {/* Pagination — hidden in map view */}
              {viewMode !== "map" && totalPages > 1 && (
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
