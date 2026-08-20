import { useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useGetLocalSeoLanding } from "@workspace/api-client-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Globe, Phone, ArrowRight, Home, ChevronRight } from "lucide-react";
import { getPublicEntryPath } from "@/lib/entryPath";

export default function LocalSeoLandingPage() {
  const params = useParams();
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const rawPage = Number.parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  
  const stateSlug = params.stateSlug;
  const citySlug = params.citySlug;
  const serviceSlug = params.serviceSlug;

  const { data, isLoading, isError } = useGetLocalSeoLanding({
    stateSlug,
    citySlug,
    serviceSlug,
    page,
    limit: 12
  });

  const meta = data?.meta;
  
  // Build canonical document title
  useEffect(() => {
    if (meta) {
      const parts = [];
      if (meta.serviceLabel) parts.push(meta.serviceLabel);
      else if (!meta.serviceLabel && meta.cityName) parts.push("Equestrian Businesses");

      if (meta.cityName && meta.stateName) parts.push(`in ${meta.cityName}, ${meta.stateName}`);
      else if (meta.stateName) parts.push(`in ${meta.stateName}`);
      
      const title = parts.join(" ");
      document.title = `${title} | SaddleUpGuide`;
      
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement("meta");
        metaDesc.setAttribute("name", "description");
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute("content", `Find ${title.toLowerCase()}. Browse ${data?.total || 0} local listings on SaddleUpGuide.`);
      
      let canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.setAttribute("rel", "canonical");
        document.head.appendChild(canonical);
      }
      const url = new URL(window.location.href);
      if (page > 1) {
        url.searchParams.set("page", String(page));
      } else {
        url.searchParams.delete("page");
      }
      canonical.setAttribute("href", url.toString());
    }
  }, [meta, data?.total, location, page]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20 min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data || !data.eligible) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-3xl font-bold mb-4">Page Not Found</h1>
        <p className="text-muted-foreground mb-8">We couldn't find the location or service you're looking for.</p>
        <Link href="/browse" className="text-primary hover:underline">
          Browse all listings
        </Link>
      </div>
    );
  }

  const generatePageUrl = (targetPage: number) => {
    const url = new URL(window.location.href);
    if (targetPage > 1) {
      url.searchParams.set("page", String(targetPage));
    } else {
      url.searchParams.delete("page");
    }
    return `${url.pathname}${url.search}`;
  };

  const goToPage = (e: React.MouseEvent<HTMLAnchorElement>, targetPage: number) => {
    e.preventDefault();
    setLocation(generatePageUrl(targetPage));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const getH1 = () => {
    const parts = [];
    if (meta?.serviceLabel) parts.push(meta.serviceLabel);
    else parts.push("Equestrian Businesses");
    
    if (meta?.cityName && meta?.stateName) parts.push(`in ${meta.cityName}, ${meta.stateName}`);
    else if (meta?.stateName) parts.push(`in ${meta.stateName}`);
    
    return parts.join(" ");
  };

  const filteredCityServices = data?.relatedHubs?.cityServices
    ?.filter(h => h.serviceSlug === serviceSlug && h.stateSlug === stateSlug && h.citySlug !== citySlug)
    .slice(0, 12) || [];

  const filteredStateServices = data?.relatedHubs?.stateServices
    ?.filter(h => h.serviceSlug === serviceSlug && h.stateSlug !== stateSlug)
    .slice(0, 12) || [];

  const filteredCities = data?.relatedHubs?.cities
    ?.filter(h => h.stateSlug === stateSlug && h.citySlug !== citySlug)
    .slice(0, 12) || [];

  const filteredGlobalServices = data?.relatedHubs?.globalServices
    ?.filter(h => h.serviceSlug !== serviceSlug)
    .slice(0, 8) || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex items-center text-sm text-muted-foreground overflow-x-auto whitespace-nowrap pb-2">
        <Link href="/" className="hover:text-foreground flex items-center">
          <Home className="h-3.5 w-3.5 mr-1" /> Home
        </Link>
        
        {stateSlug && !serviceSlug && (
          <>
            <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0" />
            <Link href={`/browse/${encodeURIComponent(meta?.stateName || stateSlug)}`} className="hover:text-foreground">
              {meta?.stateName || stateSlug}
            </Link>
            {citySlug && (
              <>
                <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0" />
                <span className="text-foreground font-medium">{meta?.cityName || citySlug}</span>
              </>
            )}
          </>
        )}

        {serviceSlug && (
          <>
            <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0" />
            <Link href={`/services/${serviceSlug}`} className={!stateSlug ? "text-foreground font-medium" : "hover:text-foreground"}>
              {meta?.serviceLabel || serviceSlug}
            </Link>
            {stateSlug && (
              <>
                <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0" />
                <Link href={`/services/${serviceSlug}/${stateSlug}`} className={!citySlug ? "text-foreground font-medium" : "hover:text-foreground"}>
                  {meta?.stateName || stateSlug}
                </Link>
                {citySlug && (
                  <>
                    <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0" />
                    <span className="text-foreground font-medium">{meta?.cityName || citySlug}</span>
                  </>
                )}
              </>
            )}
          </>
        )}
      </nav>

      {/* Header */}
      <div className="bg-primary/5 dark:bg-primary/10 rounded-2xl p-8 md:p-12 text-center max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-foreground">
          {getH1()}
        </h1>
        <p className="text-lg text-muted-foreground">
          Showing {data.total} {data.total === 1 ? 'result' : 'results'} for {meta?.serviceLabel?.toLowerCase() || 'local services'} 
          {meta?.cityName ? ` in ${meta.cityName}` : ''}
          {meta?.stateName ? (meta.cityName ? `, ${meta.stateName}` : ` in ${meta.stateName}`) : ''}.
        </p>
      </div>

      {/* Entries Grid */}
      {data.entries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No entries found matching this specific location and service.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.entries.map((entry) => (
            <Card key={entry.id} className="h-full flex flex-col overflow-hidden hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {entry.premium && (
                    <Badge className="bg-violet-600 hover:bg-violet-700 text-white text-[10px] px-2 py-0.5">⭐ Premium</Badge>
                  )}
                  {entry.featured && !entry.premium && (
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] px-2 py-0.5">★ Featured</Badge>
                  )}
                </div>
                <CardTitle className="line-clamp-2 text-xl">
                  <Link href={getPublicEntryPath(entry)} className="hover:text-primary transition-colors">
                    {entry.title}
                  </Link>
                </CardTitle>
                {entry.normalizedLocation && (
                  <div className="flex items-center text-sm text-muted-foreground mt-1">
                    <MapPin className="mr-1 h-3.5 w-3.5 flex-shrink-0" />
                    <span>{entry.normalizedLocation.cityName}, {entry.normalizedLocation.stateName}</span>
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex-grow space-y-3">
                {entry.summary && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{entry.summary}</p>
                )}
                
                <div className="space-y-1.5 pt-2 border-t">
                  {entry.contactPhone && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Phone className="mr-2 h-3.5 w-3.5 flex-shrink-0" />
                      <span>{entry.contactPhone}</span>
                    </div>
                  )}
                  {entry.website && entry.website.startsWith("http") && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Globe className="mr-2 h-3.5 w-3.5 flex-shrink-0" />
                      <a href={entry.website} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors line-clamp-1" onClick={e => e.stopPropagation()}>
                        {entry.website.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                    </div>
                  )}
                </div>
                
                {entry.confirmedServices && entry.confirmedServices.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {entry.confirmedServices.slice(0, 3).map((s) => (
                      <Badge key={s.slug} variant="secondary" className="text-xs bg-muted font-normal">
                        {s.label}
                      </Badge>
                    ))}
                    {entry.confirmedServices.length > 3 && (
                      <Badge variant="secondary" className="text-xs bg-muted font-normal">
                        +{entry.confirmedServices.length - 3} more
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
              <CardFooter className="pt-4 border-t bg-muted/10">
                <Link href={getPublicEntryPath(entry)} className="w-full inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground group">
                  View Details
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 py-6 border-t">
          <Link 
            href={generatePageUrl(Math.max(1, page - 1))}
            onClick={(e) => goToPage(e, Math.max(1, page - 1))}
            className={`px-4 py-2 border rounded-md text-sm font-medium transition-colors ${page === 1 ? 'pointer-events-none opacity-50' : 'hover:bg-muted'}`}
          >
            Previous
          </Link>
          <span className="text-sm font-medium">Page {page} of {data.totalPages}</span>
          <Link 
            href={generatePageUrl(Math.min(data.totalPages, page + 1))}
            onClick={(e) => goToPage(e, Math.min(data.totalPages, page + 1))}
            className={`px-4 py-2 border rounded-md text-sm font-medium transition-colors ${page === data.totalPages ? 'pointer-events-none opacity-50' : 'hover:bg-muted'}`}
          >
            Next
          </Link>
        </div>
      )}

      {/* Bounded Related Links */}
      {data.relatedHubs && (
        <div className="py-8 border-t space-y-8">
          {(filteredCityServices.length > 0 || filteredStateServices.length > 0 || filteredCities.length > 0 || filteredGlobalServices.length > 0) && (
            <h2 className="text-2xl font-semibold mb-6">Explore More</h2>
          )}
          
          {filteredCityServices.length > 0 && serviceSlug && stateSlug && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Nearby Cities for {meta?.serviceLabel}</h3>
              <div className="flex flex-wrap gap-2">
                {filteredCityServices.map((hub) => (
                  <Link key={`${hub.serviceSlug}-${hub.citySlug}`} href={`/services/${hub.serviceSlug}/${hub.stateSlug}/${hub.citySlug}`}>
                    <Badge variant="outline" className="hover:bg-primary/5 hover:border-primary/30 transition-colors text-sm py-1 font-normal cursor-pointer">
                      {hub.cityName} <span className="text-muted-foreground ml-1.5 text-xs">({hub.entryCount})</span>
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {filteredStateServices.length > 0 && serviceSlug && !citySlug && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">States for {meta?.serviceLabel}</h3>
              <div className="flex flex-wrap gap-2">
                {filteredStateServices.map((hub) => (
                  <Link key={`${hub.serviceSlug}-${hub.stateSlug}`} href={`/services/${hub.serviceSlug}/${hub.stateSlug}`}>
                    <Badge variant="outline" className="hover:bg-primary/5 hover:border-primary/30 transition-colors text-sm py-1 font-normal cursor-pointer">
                      {hub.stateName} <span className="text-muted-foreground ml-1.5 text-xs">({hub.entryCount})</span>
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {filteredCities.length > 0 && !serviceSlug && stateSlug && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Popular Cities in {meta?.stateName}</h3>
              <div className="flex flex-wrap gap-2">
                {filteredCities.map((hub) => (
                  <Link key={hub.citySlug} href={`/locations/${hub.stateSlug}/${hub.citySlug}`}>
                    <Badge variant="outline" className="hover:bg-primary/5 hover:border-primary/30 transition-colors text-sm py-1 font-normal cursor-pointer">
                      {hub.cityName} <span className="text-muted-foreground ml-1.5 text-xs">({hub.entryCount})</span>
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {filteredGlobalServices.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Other Services</h3>
              <div className="flex flex-wrap gap-2">
                {filteredGlobalServices.map((hub) => (
                  <Link key={hub.serviceSlug} href={`/services/${hub.serviceSlug}`}>
                    <Badge variant="outline" className="hover:bg-primary/5 hover:border-primary/30 transition-colors text-sm py-1 font-normal cursor-pointer">
                      {hub.serviceLabel} <span className="text-muted-foreground ml-1.5 text-xs">({hub.entryCount})</span>
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
