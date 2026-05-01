import { useParams, Link } from "wouter";
import { 
  useGetPublicEntry,
  useListPublicEntries,
  useGetPublicSettings
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  MapPin, 
  Globe, 
  Mail, 
  Phone, 
  ChevronLeft,
  Tag,
  Loader2,
  Building2,
  CalendarDays,
  Layers
} from "lucide-react";
import { format } from "date-fns";
import { FontLoader } from "@/components/template/FontLoader";
import { mergeTemplateSettings, getFontFamily, ENTRY_SIDEBAR_FIELDS } from "@/lib/templateTypes";
import type { SectionProps } from "@/lib/templateTypes";

export default function EntryPage() {
  const { id } = useParams();
  const entryId = id === "demo1" || id === "demo2" || id === "demo3" ? 0 : parseInt(id || "0", 10);
  const isDemo = entryId === 0;

  const { data: settings } = useGetPublicSettings();
  const { data: entry, isLoading } = useGetPublicEntry(entryId, {
    query: { enabled: !isDemo && entryId > 0 }
  });

  const ts = mergeTemplateSettings((settings as any)?.templateSettings);
  const entryFont = getFontFamily(ts.entry.font);

  const getEntrySection = (id: string) => ts.entry.sections.find(s => s.id === id);
  const getSectionEnabled = (id: string) => getEntrySection(id)?.enabled ?? true;
  const getSectionProps = (id: string): SectionProps => getEntrySection(id)?.props ?? {};

  const sidebarFields = ts.entry.sidebarFields;
  const showSidebarField = (id: string) => sidebarFields.includes(id);

  const demoEntry = {
    title: "Tech Conference 2024",
    category: "Events",
    summary: "Annual gathering of tech enthusiasts and industry leaders.",
    description: "Join us for three days of inspiring keynotes, interactive workshops, and unparalleled networking opportunities. Learn from the best minds in software development, AI, and cloud architecture.",
    location: "San Francisco, CA",
    website: "https://example.com",
    contactEmail: "hello@example.com",
    contactPhone: "+1 (555) 123-4567",
    tags: "tech, software, networking, ai",
    published: true,
    updatedAt: new Date().toISOString()
  };

  const displayEntry = isDemo ? demoEntry : entry;

  const { data: relatedData } = useListPublicEntries({
    category: displayEntry?.category || undefined,
    limit: 3
  }, {
    query: { enabled: !!displayEntry?.category && !isDemo }
  });

  if (isLoading && !isDemo) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!displayEntry) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-bold">Entry not found</h2>
        <p className="text-muted-foreground mt-2">The entry you are looking for does not exist or has been removed.</p>
        <Link href="/browse">
          <Button className="mt-6">Back to Directory</Button>
        </Link>
      </div>
    );
  }

  const renderSidebarField = (fieldId: string) => {
    switch (fieldId) {
      case "eventType":
        return (displayEntry as any).eventType ? (
          <div key="eventType" className="flex items-start">
            <Layers className="h-5 w-5 text-muted-foreground mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium mb-1">Event Type</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{(displayEntry as any).eventType}</div>
            </div>
          </div>
        ) : null;

      case "startDate":
        return ((displayEntry as any).startDate || (displayEntry as any).endDate) ? (
          <div key="startDate" className="flex items-start">
            <CalendarDays className="h-5 w-5 text-muted-foreground mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium mb-1">Dates</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {(displayEntry as any).startDate}
                {(displayEntry as any).endDate && (displayEntry as any).endDate !== (displayEntry as any).startDate
                  ? ` – ${(displayEntry as any).endDate}`
                  : ""}
              </div>
            </div>
          </div>
        ) : null;

      case "venue":
        return (displayEntry as any).venue ? (
          <div key="venue" className="flex items-start">
            <Building2 className="h-5 w-5 text-muted-foreground mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium mb-1">Venue</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{(displayEntry as any).venue}</div>
            </div>
          </div>
        ) : null;

      case "location":
        return displayEntry.location ? (
          <div key="location" className="flex items-start">
            <MapPin className="h-5 w-5 text-muted-foreground mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium mb-1">Location</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{displayEntry.location}</div>
            </div>
          </div>
        ) : null;

      case "website":
        return displayEntry.website ? (
          <div key="website" className="flex items-start">
            <Globe className="h-5 w-5 text-muted-foreground mr-3 mt-0.5 flex-shrink-0" />
            <div className="overflow-hidden">
              <div className="text-sm font-medium mb-1">Website</div>
              <a
                href={displayEntry.website.startsWith("http") ? displayEntry.website : `https://${displayEntry.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm truncate block"
              >
                {displayEntry.website.replace(/^https?:\/\//, "")}
              </a>
            </div>
          </div>
        ) : null;

      case "contactEmail":
        return displayEntry.contactEmail ? (
          <div key="contactEmail" className="flex items-start">
            <Mail className="h-5 w-5 text-muted-foreground mr-3 mt-0.5 flex-shrink-0" />
            <div className="overflow-hidden">
              <div className="text-sm font-medium mb-1">Email</div>
              <a href={`mailto:${displayEntry.contactEmail}`} className="text-primary hover:underline text-sm truncate block">
                {displayEntry.contactEmail}
              </a>
            </div>
          </div>
        ) : null;

      case "contactPhone":
        return displayEntry.contactPhone ? (
          <div key="contactPhone" className="flex items-start">
            <Phone className="h-5 w-5 text-muted-foreground mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium mb-1">Phone</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{displayEntry.contactPhone}</div>
            </div>
          </div>
        ) : null;

      case "tags":
        return displayEntry.tags ? (
          <div key="tags">
            <Separator className="my-4" />
            <div>
              <div className="flex items-center text-sm font-medium mb-3">
                <Tag className="h-4 w-4 text-muted-foreground mr-2" /> Tags
              </div>
              <div className="flex flex-wrap gap-2">
                {displayEntry.tags.split(",").map((tag, i) => (
                  <Badge key={i} variant="secondary" className="font-normal bg-gray-200 dark:bg-gray-700">
                    {tag.trim()}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        ) : null;

      default:
        return null;
    }
  };

  const headerProps = getSectionProps("header");
  const sidebarProps = getSectionProps("sidebar");
  const relatedProps = getSectionProps("related");

  return (
    <div style={{ fontFamily: entryFont }}>
      <FontLoader fontKey={ts.entry.font} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        <Link href="/browse" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to Directory
        </Link>

        <div className="bg-white dark:bg-gray-900 border rounded-xl overflow-hidden shadow-sm">
          {/* Header Section */}
          {getSectionEnabled("header") && (
            <div
              className="p-8 md:p-10 border-b"
              style={{
                backgroundColor: headerProps.backgroundColor || undefined,
                fontFamily: headerProps.fontFamily ? getFontFamily(headerProps.fontFamily) : undefined,
              }}
            >
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {displayEntry.category && (
                  <Link href={`/browse/${encodeURIComponent(displayEntry.category)}`}>
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/20 text-sm py-1 px-3">
                      {displayEntry.category}
                    </Badge>
                  </Link>
                )}
                {isDemo && <Badge variant="outline">Demo Entry</Badge>}
                <span className="text-sm text-muted-foreground">
                  Last updated {format(new Date(displayEntry.updatedAt || new Date()), "MMMM d, yyyy")}
                </span>
              </div>
              <h1
                className="font-bold tracking-tight mb-4"
                style={{
                  color: headerProps.headingColor || undefined,
                  fontSize: headerProps.headingFontSize || "clamp(1.75rem, 4vw, 2.25rem)",
                }}
              >
                {displayEntry.title}
              </h1>
              {displayEntry.summary && (
                <p
                  className="max-w-3xl"
                  style={{
                    color: headerProps.textColor || undefined,
                    fontSize: headerProps.bodyFontSize || "1.125rem",
                  }}
                >
                  {displayEntry.summary}
                </p>
              )}
            </div>
          )}

          {/* Content + Sidebar */}
          <div className="flex flex-col md:flex-row">
            {/* Main content */}
            {(getSectionEnabled("description") || getSectionEnabled("moreDetails")) && (
              <div className="flex-1 p-8 md:p-10 prose prose-gray dark:prose-invert max-w-none">
                {getSectionEnabled("description") && (
                  displayEntry.description ? (
                    <div className="whitespace-pre-wrap">{displayEntry.description}</div>
                  ) : (
                    <p className="text-muted-foreground italic">No detailed description provided.</p>
                  )
                )}

                {getSectionEnabled("moreDetails") && (displayEntry as any).moreDetails && (
                  <>
                    <Separator className="my-8" />
                    <h3 className="text-xl font-bold">Additional Information</h3>
                    <div className="whitespace-pre-wrap">{(displayEntry as any).moreDetails}</div>
                  </>
                )}
              </div>
            )}

            {/* Sidebar */}
            {getSectionEnabled("sidebar") && (
              <div
                className="w-full md:w-80 border-t md:border-t-0 md:border-l p-8"
                style={{
                  backgroundColor: sidebarProps.backgroundColor || undefined,
                  fontFamily: sidebarProps.fontFamily ? getFontFamily(sidebarProps.fontFamily) : undefined,
                }}
              >
                <h3
                  className="font-semibold text-lg mb-6"
                  style={{ color: sidebarProps.headingColor || undefined }}
                >
                  {getEntrySection("sidebar")?.props?.sidebarTitle || "Contact & Details"}
                </h3>
                <div className="space-y-5">
                  {sidebarFields
                    .map(fieldId => renderSidebarField(fieldId))
                    .filter(Boolean)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Related Entries */}
        {getSectionEnabled("related") && !isDemo && relatedData && relatedData.entries.filter(e => e.id !== entryId).length > 0 && (
          <div className="pt-8">
            <h2 className="text-2xl font-bold tracking-tight mb-6">Similar in {displayEntry.category}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedData.entries.filter(e => e.id !== entryId).slice(0, 3).map(related => (
                <Link key={related.id} href={`/entry/${related.id}`}>
                  <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg line-clamp-1">{related.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">{related.summary}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
