import { useParams, Link } from "wouter";
import { 
  useGetPublicEntry,
  useListPublicEntries
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
  Loader2
} from "lucide-react";
import { format } from "date-fns";

export default function EntryPage() {
  const { id } = useParams();
  const entryId = id === "demo1" || id === "demo2" || id === "demo3" ? 0 : parseInt(id || "0", 10);
  const isDemo = entryId === 0;

  const { data: entry, isLoading } = useGetPublicEntry(entryId, {
    query: { enabled: !isDemo && entryId > 0 }
  });

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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      <Link href="/browse" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="mr-1 h-4 w-4" />
        Back to Directory
      </Link>

      <div className="bg-white dark:bg-gray-900 border rounded-xl overflow-hidden shadow-sm">
        {/* Header Section */}
        <div className="p-8 md:p-10 border-b bg-gray-50/50 dark:bg-gray-800/20">
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
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            {displayEntry.title}
          </h1>
          {displayEntry.summary && (
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl">
              {displayEntry.summary}
            </p>
          )}
        </div>

        {/* Content Section */}
        <div className="flex flex-col md:flex-row">
          <div className="flex-1 p-8 md:p-10 prose prose-gray dark:prose-invert max-w-none">
            {displayEntry.description ? (
              <div className="whitespace-pre-wrap">{displayEntry.description}</div>
            ) : (
              <p className="text-muted-foreground italic">No detailed description provided.</p>
            )}
            
            {displayEntry.moreDetails && (
              <>
                <Separator className="my-8" />
                <h3 className="text-xl font-bold">Additional Information</h3>
                <div className="whitespace-pre-wrap">{displayEntry.moreDetails}</div>
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-full md:w-80 border-t md:border-t-0 md:border-l bg-gray-50/50 dark:bg-gray-800/20 p-8">
            <h3 className="font-semibold text-lg mb-6">Contact & Details</h3>
            
            <div className="space-y-5">
              {displayEntry.website && (
                <div className="flex items-start">
                  <Globe className="h-5 w-5 text-muted-foreground mr-3 mt-0.5" />
                  <div className="overflow-hidden">
                    <div className="text-sm font-medium mb-1">Website</div>
                    <a 
                      href={displayEntry.website.startsWith('http') ? displayEntry.website : `https://${displayEntry.website}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm truncate block"
                    >
                      {displayEntry.website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                </div>
              )}

              {displayEntry.contactEmail && (
                <div className="flex items-start">
                  <Mail className="h-5 w-5 text-muted-foreground mr-3 mt-0.5" />
                  <div className="overflow-hidden">
                    <div className="text-sm font-medium mb-1">Email</div>
                    <a href={`mailto:${displayEntry.contactEmail}`} className="text-primary hover:underline text-sm truncate block">
                      {displayEntry.contactEmail}
                    </a>
                  </div>
                </div>
              )}

              {displayEntry.contactPhone && (
                <div className="flex items-start">
                  <Phone className="h-5 w-5 text-muted-foreground mr-3 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium mb-1">Phone</div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">{displayEntry.contactPhone}</div>
                  </div>
                </div>
              )}

              {displayEntry.location && (
                <div className="flex items-start">
                  <MapPin className="h-5 w-5 text-muted-foreground mr-3 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium mb-1">Location</div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">{displayEntry.location}</div>
                  </div>
                </div>
              )}

              {displayEntry.tags && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <div className="flex items-center text-sm font-medium mb-3">
                      <Tag className="h-4 w-4 text-muted-foreground mr-2" /> Tags
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {displayEntry.tags.split(',').map((tag, i) => (
                        <Badge key={i} variant="secondary" className="font-normal bg-gray-200 dark:bg-gray-700">
                          {tag.trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Related Entries */}
      {!isDemo && relatedData && relatedData.entries.filter(e => e.id !== entryId).length > 0 && (
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
  );
}
