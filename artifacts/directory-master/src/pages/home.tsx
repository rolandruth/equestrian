import { useCallback, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPublicStats,
  useGetFeaturedEntries,
  useGetRecentEntries,
  useGetPublicSettings,
  useGetCurrentUser,
  useUpdateSettings,
  getGetPublicSettingsQueryKey,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  MapPin, ArrowRight, Search, GripVertical, Eye, EyeOff, Pencil, Trash2,
  Plus, CheckCircle2, Loader2, LayoutTemplate, AlignLeft, Image as ImageIcon,
  Grid3X3, Star, Clock,
} from "lucide-react";
import { FontLoader } from "@/components/template/FontLoader";
import {
  mergeTemplateSettings, getFontFamily,
  HOMEPAGE_BLOCK_DEFS,
  type SectionConfig, type SectionProps, type BlockDefinition,
} from "@/lib/templateTypes";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext, DragOverlay, type DragEndEvent, type DragStartEvent,
  useSensor, useSensors, PointerSensor,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Block type icon mapping ──────────────────────────────────────────────────
function BlockIcon({ type, className = "h-4 w-4" }: { type: string; className?: string }) {
  switch (type) {
    case "hero":         return <LayoutTemplate className={className} />;
    case "categories":   return <Grid3X3 className={className} />;
    case "featured":     return <Star className={className} />;
    case "recent":       return <Clock className={className} />;
    case "custom-text":  return <AlignLeft className={className} />;
    case "custom-image": return <ImageIcon className={className} />;
    default:             return <LayoutTemplate className={className} />;
  }
}

// ─── Sortable section wrapper for edit mode ───────────────────────────────────
function SortableHomeSectionWrapper({
  section,
  onDelete,
  onEdit,
  onToggle,
  children,
}: {
  section: SectionConfig;
  onDelete: () => void;
  onEdit: () => void;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: section.id });

  const blockDef = HOMEPAGE_BLOCK_DEFS.find(d => d.type === (section.type ?? section.id));
  const label = blockDef?.label ?? section.label;
  const isSingleton = !["custom-text", "custom-image"].includes(section.type ?? section.id);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      className={`relative rounded-xl border-2 border-dashed overflow-hidden transition-all ${
        section.enabled
          ? "border-blue-400 bg-white dark:bg-gray-900"
          : "border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
      }`}
    >
      {/* ── Handle bar ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-blue-500 text-white text-xs font-medium select-none">
        <div className="flex items-center gap-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-blue-400 transition-colors touch-none"
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <span className="opacity-80">Drag to move</span>
          <span className="opacity-50">·</span>
          <span className="font-semibold">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            title={section.enabled ? "Hide section" : "Show section"}
            className="p-1 rounded hover:bg-blue-400 transition-colors"
          >
            {section.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            title="Edit section"
            className="p-1 rounded hover:bg-blue-400 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {!isSingleton && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Remove section"
              className="p-1 rounded hover:bg-red-500 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Section content (non-interactive preview) ── */}
      {section.enabled ? (
        <div className="pointer-events-none select-none overflow-hidden max-h-72">{children}</div>
      ) : (
        <div className="px-6 py-5 text-sm text-gray-400 italic flex items-center gap-2">
          <EyeOff className="h-4 w-4 flex-shrink-0" />
          Section hidden — click the eye icon to restore it
        </div>
      )}
    </div>
  );
}

// ─── Inline section editor dialog ────────────────────────────────────────────
function EditSectionDialog({
  section,
  onSave,
  onClose,
}: {
  section: SectionConfig;
  onSave: (updated: SectionConfig) => void;
  onClose: () => void;
}) {
  const type = section.type ?? section.id;
  const [heading, setHeading] = useState(section.heading ?? "");
  // Initialise from richBodyText (strip tags) if it exists, otherwise plain bodyText
  const [bodyText, setBodyText] = useState(() => {
    const rich = section.props?.richBodyText;
    if (rich) return rich.replace(/<[^>]*>/g, "").trim();
    return section.props?.bodyText ?? "";
  });
  const [imageUrl, setImageUrl] = useState(section.props?.imageUrl ?? "");
  const [imageCaption, setImageCaption] = useState(section.props?.imageCaption ?? "");

  const handleSave = () => {
    const updatedProps = {
      ...section.props,
      // For custom-text: set plain bodyText and wipe richBodyText so it doesn't override
      ...(type === "custom-text" ? { bodyText, richBodyText: undefined } : {}),
      ...(type === "custom-image" ? { imageUrl, imageCaption } : {}),
    };
    onSave({ ...section, heading, props: updatedProps });
    onClose();
  };

  const blockDef = HOMEPAGE_BLOCK_DEFS.find(d => d.type === type);
  const label = blockDef?.label ?? section.label;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BlockIcon type={type} className="h-4 w-4 text-blue-500" />
            Edit {label}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {type !== "hero" && (
            <div className="space-y-1.5">
              <Label>Section Heading</Label>
              <Input
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                placeholder="Section heading..."
              />
            </div>
          )}
          {type === "custom-text" && (
            <div className="space-y-1.5">
              <Label>Body Text</Label>
              <Textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={5}
                placeholder="Enter body text..."
              />
            </div>
          )}
          {type === "custom-image" && (
            <>
              <div className="space-y-1.5">
                <Label>Image URL</Label>
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Caption (optional)</Label>
                <Input
                  value={imageCaption}
                  onChange={(e) => setImageCaption(e.target.value)}
                  placeholder="Image caption..."
                />
              </div>
            </>
          )}
          {type === "hero" && (
            <p className="text-sm text-muted-foreground">
              Hero headline and description are configured in{" "}
              <strong>Admin → Settings → Homepage</strong>.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function HomePage() {
  const [, setLocation] = useLocation();
  const [heroSearch, setHeroSearch] = useState("");
  const { data: settings } = useGetPublicSettings();
  const { data: stats } = useGetPublicStats();
  const { data: featured } = useGetFeaturedEntries();
  const { data: recent, isLoading: recentLoading } = useGetRecentEntries();

  const { toast } = useToast();
  const qc = useQueryClient();
  const { token } = useAuth();
  const isLoggedIn = Boolean(token);
  const { data: currentUser } = useGetCurrentUser({ query: { enabled: isLoggedIn } });
  const isAdmin = isLoggedIn && (currentUser as any)?.role === "admin";
  const updateSettings = useUpdateSettings();

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (heroSearch.trim()) {
      setLocation(`/browse?search=${encodeURIComponent(heroSearch.trim())}`);
    }
  };

  const ts = mergeTemplateSettings((settings as any)?.templateSettings);
  const themeColor = (settings as any)?.themeColor || "#2563eb";
  const hpFont = getFontFamily(ts.homepage.font);
  const isDemo = !recentLoading && recent && recent.length === 0;
  const enabledSections = ts.homepage.sections.filter(s => s.enabled);

  // ── Edit mode state ──────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editSections, setEditSections] = useState<SectionConfig[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingSection, setEditingSection] = useState<SectionConfig | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const enterEditMode = useCallback(() => {
    setEditSections(ts.homepage.sections.map(s => ({ ...s })));
    setEditMode(true);
  }, [ts.homepage.sections]);

  const exitEditMode = () => { setEditMode(false); setActiveId(null); setEditingSection(null); };

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setEditSections(prev => {
      const oldIdx = prev.findIndex(s => s.id === String(active.id));
      const newIdx = prev.findIndex(s => s.id === String(over.id));
      if (oldIdx === -1 || newIdx === -1) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const handleToggleSection = (id: string) => {
    setEditSections(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const handleDeleteSection = (id: string) => {
    setEditSections(prev => prev.filter(s => s.id !== id));
  };

  const handleUpdateSection = (updated: SectionConfig) => {
    setEditSections(prev => prev.map(s => s.id === updated.id ? updated : s));
  };

  const handleAddSection = (def: BlockDefinition) => {
    const isSingleton = !["custom-text", "custom-image"].includes(def.type);
    if (isSingleton && editSections.some(s => (s.type ?? s.id) === def.type)) return;
    const newSection: SectionConfig = {
      id: isSingleton ? def.type : `${def.type}-${Date.now()}`,
      type: def.type,
      label: def.label,
      enabled: true,
      heading: def.defaultHeading ?? "",
      props: { ...def.defaultProps },
    };
    setEditSections(prev => [...prev, newSection]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const stored = (settings as any)?.templateSettings ?? {};
      const merged = mergeTemplateSettings(stored);
      const updated = { ...merged, homepage: { ...merged.homepage, sections: editSections } };
      await updateSettings.mutateAsync({ data: { templateSettings: updated } as any });
      qc.invalidateQueries({ queryKey: getGetPublicSettingsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({ title: "Homepage template saved!", description: "Your homepage layout has been updated." });
      setEditMode(false);
    } catch {
      toast({ title: "Save failed", description: "Could not save the template.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Entry card renderer ───────────────────────────────────────────────────────
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
        <Link href={`/entry/${(entry as any).slug || entry.id}`} className="w-full">
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

  // ── Section renderer (shared between normal and edit mode) ───────────────────
  function renderSection(section: SectionConfig) {
    const p = section.props ?? {};
    const type = section.type ?? section.id;

    if (type === "hero") {
      const hasBg = !!p.backgroundImage;
      const paddingClass = p.padding === "sm" ? "py-12 lg:py-16" : p.padding === "lg" ? "py-28 lg:py-40" : "py-20 lg:py-32";
      const bgStyle: React.CSSProperties = hasBg
        ? { backgroundImage: `url(${p.backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center" }
        : { backgroundColor: p.backgroundColor || undefined };

      return (
        <section
          key={section.id}
          className={`${paddingClass} border-b relative overflow-hidden`}
          style={bgStyle}
        >
          {hasBg && (
            <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${(p.overlayOpacity ?? 50) / 100})` }} />
          )}
          <div
            className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${alignClass(p)}`}
            style={p.fontFamily ? { fontFamily: getFontFamily(p.fontFamily) } : {}}
          >
            <h1
              className="font-extrabold tracking-tight mb-6"
              style={{ color: p.headingColor || (hasBg ? "#ffffff" : undefined), fontSize: p.headingFontSize || "clamp(2rem, 5vw, 3.75rem)" }}
            >
              {settings?.homepageHeadline || section.heading || "Discover the Best Resources"}
            </h1>
            <p
              className="max-w-3xl mx-auto mb-10"
              style={{ color: p.textColor || (hasBg ? "#e2e8f0" : undefined), fontSize: p.bodyFontSize || "1.125rem" }}
            >
              {settings?.homepageDescription || "A curated directory of tools, companies, and events."}
            </p>
            <form
              onSubmit={handleHeroSearch}
              className="flex items-center w-full max-w-2xl mx-auto mb-6 rounded-xl overflow-hidden shadow-lg"
            >
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  className="block w-full pl-12 pr-4 py-4 text-gray-900 bg-white border-0 focus:outline-none focus:ring-0 text-base"
                  placeholder={(settings as any)?.heroSearchPlaceholder || "Search directory..."}
                  value={heroSearch}
                  onChange={(e) => setHeroSearch(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="px-7 py-4 font-semibold text-white text-base transition-opacity hover:opacity-90 whitespace-nowrap flex-shrink-0"
                style={{ backgroundColor: p.buttonColor || themeColor }}
              >
                {(settings as any)?.heroSearchButtonText || "Search"}
              </button>
            </form>
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
              style={{ color: p.headingColor || undefined, fontSize: p.headingFontSize || undefined, fontFamily: p.fontFamily ? getFontFamily(p.fontFamily) : undefined }}
            >
              {section.heading || "Browse by Category"}
            </h2>
            <Link href="/browse" className="text-primary hover:underline font-medium flex items-center">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {stats.categoryBreakdown.slice(0, max).map((cat) => {
              const imgUrl = (cat as any).imageUrl as string | null | undefined;
              return (
                <Link key={cat.category} href={`/browse/${encodeURIComponent(cat.category)}`}>
                  <Card className="hover:border-primary/50 transition-colors cursor-pointer overflow-hidden group">
                    {imgUrl ? (
                      <div className="relative h-28 overflow-hidden">
                        <img src={imgUrl} alt={cat.category} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
                          <p className="font-semibold text-white text-sm leading-tight">{cat.category}</p>
                          <p className="text-white/80 text-xs mt-0.5">{cat.count} entries</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 px-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <CardTitle className="text-lg">{cat.category}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-2">{cat.count} entries</p>
                      </div>
                    )}
                  </Card>
                </Link>
              );
            })}
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
            style={{ color: p.headingColor || undefined, fontSize: p.headingFontSize || undefined, fontFamily: p.fontFamily ? getFontFamily(p.fontFamily) : undefined }}
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
              style={{ color: p.headingColor || undefined, fontSize: p.headingFontSize || undefined, fontFamily: p.fontFamily ? getFontFamily(p.fontFamily) : undefined }}
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
          style={{ backgroundColor: p.backgroundColor || undefined, fontFamily: p.fontFamily ? getFontFamily(p.fontFamily) : undefined }}
        >
          {section.heading && (
            <h2 className="font-bold mb-4" style={{ color: p.headingColor || undefined, fontSize: p.headingFontSize || "1.5rem" }}>
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
            <p style={{ color: p.textColor || undefined, fontSize: p.bodyFontSize || undefined }}>{p.bodyText}</p>
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
      if (!p.imageUrl) {
        return (
          <section key={section.id} className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No image set — click the pencil icon to add an image URL</p>
            </div>
          </section>
        );
      }
      return (
        <section key={section.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: p.backgroundColor || undefined }}>
          <img src={p.imageUrl} alt={p.imageCaption || section.heading || ""} className="w-full object-cover" />
          {p.imageCaption && (
            <p className="text-sm text-muted-foreground text-center px-4 py-2">{p.imageCaption}</p>
          )}
        </section>
      );
    }

    return null;
  }

  // ── Edit mode layout ─────────────────────────────────────────────────────────
  if (editMode) {
    const singletonTypes = ["hero", "categories", "featured", "recent"];

    return (
      <div className="flex h-full min-h-screen" style={{ fontFamily: hpFont }}>
        <FontLoader fontKey={ts.homepage.font} />

        {/* ── Left panel: Add Section ── */}
        <aside className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col overflow-hidden">
          <div className="px-5 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-bold text-base text-gray-900 dark:text-white">Add Section</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Click to add to your page</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {HOMEPAGE_BLOCK_DEFS.map(def => {
              const isSingleton = singletonTypes.includes(def.type);
              const isAdded = isSingleton && editSections.some(s => (s.type ?? s.id) === def.type);
              return (
                <div
                  key={def.type}
                  className={`rounded-lg border p-3 flex items-start gap-3 transition-colors ${
                    isAdded
                      ? "border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-300 dark:hover:border-blue-700"
                  }`}
                >
                  <div className={`h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0 ${isAdded ? "bg-gray-100 dark:bg-gray-800" : "bg-blue-50 dark:bg-blue-900/30"}`}>
                    <BlockIcon type={def.type} className={`h-4 w-4 ${isAdded ? "text-gray-400" : "text-blue-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-sm font-medium leading-tight ${isAdded ? "text-gray-500 dark:text-gray-400" : "text-gray-900 dark:text-white"}`}>
                        {def.label}
                      </span>
                      {isAdded && (
                        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                          Added
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">{def.description}</p>
                  </div>
                  {!isAdded && (
                    <button
                      onClick={() => handleAddSection(def)}
                      title={`Add ${def.label}`}
                      className="flex-shrink-0 p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-500 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── Right area: control bar + sections ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Control bar */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-3 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-full">
                Template edit mode — drag sections to rearrange · changes apply globally
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exitEditMode} disabled={saving}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleSave}
                disabled={saving}
              >
                {saving
                  ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                Save Template
              </Button>
            </div>
          </div>

          {/* Sortable sections */}
          <div className="flex-1 overflow-y-auto p-6">
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext items={editSections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4 max-w-4xl mx-auto">
                  {editSections.length === 0 && (
                    <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-16 text-center text-muted-foreground">
                      <LayoutTemplate className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">No sections yet — add one from the panel on the left.</p>
                    </div>
                  )}
                  {editSections.map(s => (
                    <SortableHomeSectionWrapper
                      key={s.id}
                      section={s}
                      onDelete={() => handleDeleteSection(s.id)}
                      onEdit={() => setEditingSection(s)}
                      onToggle={() => handleToggleSection(s.id)}
                    >
                      {renderSection(s)}
                    </SortableHomeSectionWrapper>
                  ))}
                </div>
              </SortableContext>

              <DragOverlay>
                {activeId ? (
                  <div className="rounded-lg bg-blue-500 text-white px-3 py-2 text-sm font-semibold shadow-xl pointer-events-none">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4" />
                      {editSections.find(s => s.id === activeId)?.label ?? activeId}
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>

        {/* ── Inline section edit dialog ── */}
        {editingSection && (
          <EditSectionDialog
            section={editingSection}
            onSave={handleUpdateSection}
            onClose={() => setEditingSection(null)}
          />
        )}
      </div>
    );
  }

  // ── Normal homepage ───────────────────────────────────────────────────────────
  const heroSection = enabledSections.find(s => (s.type ?? s.id) === "hero");
  const nonHeroSections = enabledSections.filter(s => (s.type ?? s.id) !== "hero");

  return (
    <div className="flex flex-col min-h-screen" style={{ fontFamily: hpFont }}>
      <FontLoader fontKey={ts.homepage.font} />

      {/* Admin edit bar */}
      {isAdmin && (
        <div className="bg-gray-900 dark:bg-gray-950 border-b border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <LayoutTemplate className="h-3.5 w-3.5" />
              Admin — editing this will update the homepage for all visitors
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-gray-600 text-gray-200 hover:bg-gray-800 hover:text-white"
              onClick={enterEditMode}
            >
              <Pencil className="h-3 w-3 mr-1.5" />
              Edit Layout
            </Button>
          </div>
        </div>
      )}

      {heroSection && renderSection(heroSection)}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full space-y-20">
        {nonHeroSections.map(s => renderSection(s))}
      </div>
    </div>
  );
}
