import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetSettings,
  useUpdateSettings,
  getGetPublicSettingsQueryKey,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft, Save, Eye, Loader2, GripVertical, Trash2, EyeOff,
  LayoutTemplate, Image, Type, Grid3x3, Star, Clock, Search,
  FileText, Info, PanelRight, Link2, Heading1, AlignLeft, AlignCenter,
  AlignRight, Plus, X, Layers
} from "lucide-react";
import {
  DndContext, closestCenter, DragEndEvent, useSensor, useSensors, PointerSensor,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, arrayMove, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type SectionConfig, type SectionProps, type BlockDefinition, type TemplateSettings,
  mergeTemplateSettings, getBlockType, getBlockDefs,
} from "@/lib/templateTypes";

// ─── Block type icon map ────────────────────────────────────────────────
const BLOCK_ICONS: Record<string, React.ReactNode> = {
  hero:         <Image className="h-4 w-4" />,
  categories:   <Grid3x3 className="h-4 w-4" />,
  featured:     <Star className="h-4 w-4" />,
  recent:       <Clock className="h-4 w-4" />,
  "custom-text":<Type className="h-4 w-4" />,
  "custom-image":<Image className="h-4 w-4" />,
  header:       <Heading1 className="h-4 w-4" />,
  filters:      <Search className="h-4 w-4" />,
  grid:         <Grid3x3 className="h-4 w-4" />,
  description:  <FileText className="h-4 w-4" />,
  moreDetails:  <Info className="h-4 w-4" />,
  sidebar:      <PanelRight className="h-4 w-4" />,
  related:      <Link2 className="h-4 w-4" />,
};

// ─── Visual block preview ────────────────────────────────────────────────
function BlockPreview({ block, themeColor, siteSettings }: {
  block: SectionConfig;
  themeColor: string;
  siteSettings: any;
}) {
  const type = getBlockType(block);
  const p = block.props ?? {};
  const align = p.textAlignment ?? "center";
  const textAlignClass = align === "right" ? "text-right" : align === "left" ? "text-left" : "text-center";

  if (type === "hero") {
    const hasBg = !!p.backgroundImage;
    return (
      <div
        className={`w-full rounded-lg overflow-hidden relative ${p.padding === "sm" ? "py-8" : p.padding === "lg" ? "py-24" : "py-14"} px-10 ${textAlignClass}`}
        style={{
          background: hasBg
            ? `linear-gradient(rgba(0,0,0,${(p.overlayOpacity ?? 50) / 100}), rgba(0,0,0,${(p.overlayOpacity ?? 50) / 100})), url(${p.backgroundImage}) center/cover`
            : (p.backgroundColor || "#1e293b"),
        }}
      >
        <h2 className="text-2xl font-extrabold mb-2 leading-tight" style={{ color: p.textColor || "#ffffff" }}>
          {siteSettings?.homepageHeadline || block.heading || "Your Hero Headline"}
        </h2>
        <p className="text-sm opacity-80 mb-5 max-w-xl mx-auto" style={{ color: p.textColor || "#e2e8f0" }}>
          {siteSettings?.homepageDescription || "A short subtitle describing your directory."}
        </p>
        {p.buttonText && (
          <span className="inline-block px-5 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: p.buttonColor || themeColor }}>
            {p.buttonText}
          </span>
        )}
        {!p.buttonText && (
          <span className="inline-block px-5 py-2 rounded-lg text-sm font-semibold text-white opacity-60 border border-white/30">
            Add a CTA button in properties →
          </span>
        )}
      </div>
    );
  }

  if (type === "categories") {
    const cols = p.columns ?? 4;
    return (
      <div className="w-full rounded-lg bg-white dark:bg-gray-800 p-6 border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold text-gray-800 dark:text-white mb-4">{block.heading || "Browse by Category"}</h3>
        <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${Math.min(cols, 4)}, 1fr)` }}>
          {["AI", "Technology", "Events", "Finance", "Marketing", "Design", "Business", "Health"].slice(0, p.maxItems ?? 8).map((cat, i) => (
            <div key={i} className="rounded-lg p-3 text-center border border-gray-200 dark:border-gray-700 hover:border-primary/50 transition-colors">
              <div className="font-medium text-sm text-gray-700 dark:text-gray-300">{cat}</div>
              <div className="text-xs text-gray-400 mt-0.5">12 entries</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "featured" || type === "recent") {
    const heading = block.heading || (type === "featured" ? "Featured" : "Recently Added");
    return (
      <div className="w-full rounded-lg bg-white dark:bg-gray-800 p-6 border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold text-gray-800 dark:text-white mb-4">{heading}</h3>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
              <div className="h-2.5 bg-primary/20 rounded w-16" />
              <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-full" />
              <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-4/5" />
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded w-3/5 mt-2" />
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                <div className="h-6 bg-gray-50 dark:bg-gray-700 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "custom-text") {
    return (
      <div
        className={`w-full rounded-lg p-8 border border-gray-100 dark:border-gray-700 ${textAlignClass}`}
        style={{ background: p.backgroundColor || "#ffffff", color: p.textColor }}
      >
        <h3 className="font-bold text-lg mb-2 text-gray-800 dark:text-gray-100" style={{ color: p.textColor }}>
          {block.heading || "Custom Text Heading"}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed" style={{ color: p.textColor ? `${p.textColor}cc` : undefined }}>
          {p.bodyText || "Add your custom paragraph text here. You can edit this in the properties panel on the right."}
        </p>
      </div>
    );
  }

  if (type === "custom-image") {
    return (
      <div className="w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        {p.imageUrl ? (
          <img src={p.imageUrl} alt={p.imageCaption || ""} className="w-full object-cover max-h-64" />
        ) : (
          <div className="w-full h-40 bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center text-gray-400">
            <Image className="h-10 w-10 mb-2 opacity-40" />
            <span className="text-sm">Set image URL in the properties panel →</span>
          </div>
        )}
        {p.imageCaption && (
          <p className="text-xs text-center text-gray-500 py-2 bg-gray-50 dark:bg-gray-900">{p.imageCaption}</p>
        )}
      </div>
    );
  }

  // Browse: header
  if (type === "header") {
    return (
      <div className="w-full rounded-lg bg-white dark:bg-gray-800 p-5 border border-gray-100 dark:border-gray-700">
        <h3 className="text-xl font-bold text-gray-800 dark:text-white">{block.heading || "All Entries"}</h3>
        <p className="text-sm text-gray-400 mt-1">200 results found</p>
      </div>
    );
  }

  // Browse: filters
  if (type === "filters") {
    return (
      <div className="w-full rounded-lg bg-white dark:bg-gray-800 p-4 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-400">Search keywords...</span>
          </div>
          <div className="flex gap-2">
            {["All", "AI", "Events", "Finance"].map(cat => (
              <span key={cat} className={`text-xs px-3 py-1.5 rounded-full font-medium ${cat === "All" ? "text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}
                style={cat === "All" ? { background: themeColor } : undefined}>{cat}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Browse: grid
  if (type === "grid") {
    return (
      <div className="w-full rounded-lg bg-white dark:bg-gray-800 p-4 border border-gray-100 dark:border-gray-700">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="rounded border border-gray-200 dark:border-gray-700 p-3 space-y-1.5">
              <div className="h-2 bg-primary/20 rounded w-14" />
              <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-full" />
              <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded w-4/5" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Entry: description
  if (type === "description") {
    return (
      <div className="w-full rounded-lg bg-white dark:bg-gray-800 p-6 border border-gray-100 dark:border-gray-700">
        <div className="space-y-2">
          {[1, 0.9, 1, 0.7, 1, 0.85, 0.5].map((w, i) => (
            <div key={i} className="h-2.5 bg-gray-200 dark:bg-gray-600 rounded" style={{ width: `${w * 100}%` }} />
          ))}
        </div>
      </div>
    );
  }

  // Entry: moreDetails
  if (type === "moreDetails") {
    return (
      <div className="w-full rounded-lg bg-white dark:bg-gray-800 p-6 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          <span className="text-xs text-gray-400 font-medium">Additional Information</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="space-y-2">
          {[1, 0.8, 0.9, 0.6].map((w, i) => (
            <div key={i} className="h-2.5 bg-gray-200 dark:bg-gray-600 rounded" style={{ width: `${w * 100}%` }} />
          ))}
        </div>
      </div>
    );
  }

  // Entry: sidebar
  if (type === "sidebar") {
    return (
      <div className="w-full rounded-lg bg-gray-50 dark:bg-gray-800/60 p-5 border border-gray-100 dark:border-gray-700">
        <h4 className="font-semibold text-sm mb-4 text-gray-700 dark:text-gray-200">{p.sidebarTitle || "Contact & Details"}</h4>
        <div className="space-y-3">
          {[["📍", "Location"], ["🌐", "Website"], ["📧", "Email"], ["📞", "Phone"]].map(([icon, label]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-base">{icon}</span>
              <div>
                <div className="h-2 bg-gray-300 dark:bg-gray-600 rounded w-12 mb-1" />
                <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded w-28" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Entry: related
  if (type === "related") {
    return (
      <div className="w-full rounded-lg bg-white dark:bg-gray-800 p-5 border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold text-gray-800 dark:text-white mb-4">{block.heading || "Related Entries"}</h3>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded border border-gray-200 dark:border-gray-700 p-3 space-y-1.5">
              <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-full" />
              <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded w-4/5" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="w-full rounded-lg bg-gray-100 dark:bg-gray-800 p-5 border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400">
      <Layers className="h-5 w-5 mr-2" />
      <span className="text-sm">{block.label}</span>
    </div>
  );
}

// ─── Sortable block wrapper ──────────────────────────────────────────────
function SortableBlock({ block, isSelected, onSelect, onRemove, onToggle, themeColor, siteSettings }: {
  block: SectionConfig;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onToggle: () => void;
  themeColor: string;
  siteSettings: any;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`group relative rounded-xl border-2 transition-all cursor-pointer ${
        isSelected
          ? "border-blue-500 shadow-lg shadow-blue-500/10"
          : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
      } ${!block.enabled ? "opacity-50" : ""}`}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        onClick={e => e.stopPropagation()}
        className="absolute -left-7 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
      >
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>

      {/* Action bar */}
      <div className="absolute -top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={e => { e.stopPropagation(); onToggle(); }}
          className="p-1 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50"
          title={block.enabled ? "Hide section" : "Show section"}
        >
          <EyeOff className="h-3.5 w-3.5 text-gray-500" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="p-1 rounded-md bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900 shadow-sm hover:bg-red-50 dark:hover:bg-red-950"
          title="Remove section"
        >
          <Trash2 className="h-3.5 w-3.5 text-red-500" />
        </button>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute -top-3 left-3 px-2 py-0.5 bg-blue-500 text-white text-xs font-medium rounded-full">
          Editing
        </div>
      )}

      {/* Hidden badge */}
      {!block.enabled && (
        <div className="absolute -top-3 left-3 px-2 py-0.5 bg-gray-500 text-white text-xs font-medium rounded-full flex items-center gap-1">
          <EyeOff className="h-3 w-3" /> Hidden
        </div>
      )}

      <BlockPreview block={block} themeColor={themeColor} siteSettings={siteSettings} />
    </div>
  );
}

// ─── Block library panel ─────────────────────────────────────────────────
function BlockLibraryPanel({ pageType, existingIds, onAdd }: {
  pageType: string;
  existingIds: string[];
  onAdd: (def: BlockDefinition) => void;
}) {
  const defs = getBlockDefs(pageType);
  const customAllowed = pageType === "homepage";

  return (
    <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <h3 className="font-semibold text-sm text-gray-800 dark:text-white">Add Section</h3>
        <p className="text-xs text-gray-400 mt-0.5">Click to add to your page</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {defs.map(def => {
          const isPresent = existingIds.some(id => id === def.type || id.startsWith(`${def.type}-`));
          const isCustom = def.type.startsWith("custom-");
          const canAdd = isCustom || !isPresent;
          return (
            <button
              key={def.type}
              onClick={() => canAdd && onAdd(def)}
              disabled={!canAdd}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                canAdd
                  ? "border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 dark:hover:border-blue-700 cursor-pointer"
                  : "border-gray-100 dark:border-gray-800 opacity-40 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gray-500 dark:text-gray-400">
                  {BLOCK_ICONS[def.type] ?? <Layers className="h-4 w-4" />}
                </span>
                <span className="text-sm font-medium text-gray-800 dark:text-white">{def.label}</span>
                {!canAdd && <span className="ml-auto text-xs text-gray-400">Added</span>}
                {canAdd && <Plus className="ml-auto h-3.5 w-3.5 text-gray-400" />}
              </div>
              <p className="text-xs text-gray-400 leading-snug">{def.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Properties panel ────────────────────────────────────────────────────
function PropertiesPanel({ block, onChange, onPropsChange }: {
  block: SectionConfig | null;
  onChange: (patch: Partial<SectionConfig>) => void;
  onPropsChange: (patch: Partial<SectionProps>) => void;
}) {
  if (!block) {
    return (
      <div className="w-72 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-center text-center p-6">
        <div className="text-gray-400">
          <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No section selected</p>
          <p className="text-xs mt-1">Click a section on the canvas to edit its properties</p>
        </div>
      </div>
    );
  }

  const type = getBlockType(block);
  const p = block.props ?? {};

  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">{label}</Label>
      {node}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );

  const textInput = (value: string | undefined, onCh: (v: string) => void, placeholder?: string) => (
    <Input value={value ?? ""} onChange={e => onCh(e.target.value)} placeholder={placeholder} className="h-8 text-sm" />
  );

  const colorInput = (value: string | undefined, onCh: (v: string) => void, fallback = "#ffffff") => (
    <div className="flex items-center gap-2">
      <input type="color" value={value || fallback} onChange={e => onCh(e.target.value)} className="w-9 h-8 rounded border border-gray-200 dark:border-gray-700 cursor-pointer p-0.5" />
      <Input value={value ?? ""} onChange={e => onCh(e.target.value)} placeholder={fallback} className="h-8 text-sm font-mono flex-1" />
      {value && <button onClick={() => onCh("")} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>}
    </div>
  );

  const alignButtons = (value: string | undefined, onCh: (v: "left" | "center" | "right") => void) => (
    <div className="flex gap-1">
      {(["left", "center", "right"] as const).map(a => (
        <button key={a} onClick={() => onCh(a)} className={`flex-1 py-1.5 rounded border text-xs flex items-center justify-center transition-colors ${value === a ? "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-600" : "border-gray-200 dark:border-gray-700 text-gray-400 hover:border-gray-300"}`}>
          {a === "left" ? <AlignLeft className="h-3.5 w-3.5" /> : a === "center" ? <AlignCenter className="h-3.5 w-3.5" /> : <AlignRight className="h-3.5 w-3.5" />}
        </button>
      ))}
    </div>
  );

  return (
    <div className="w-72 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <span className="text-gray-500">{BLOCK_ICONS[type] ?? <Layers className="h-4 w-4" />}</span>
        <div>
          <h3 className="font-semibold text-sm text-gray-800 dark:text-white">{block.label}</h3>
          <p className="text-xs text-gray-400">Section properties</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Switch checked={block.enabled} onCheckedChange={v => onChange({ enabled: v })} />
          <span className="text-xs text-gray-400">{block.enabled ? "Visible" : "Hidden"}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Heading field — shared by most blocks */}
        {block.heading !== undefined && type !== "filters" && type !== "grid" && type !== "description" && type !== "moreDetails" && type !== "sidebar" && (
          field("Section Heading", textInput(block.heading, v => onChange({ heading: v }), "e.g. Browse by Category"))
        )}

        {/* ── Hero block ── */}
        {type === "hero" && (<>
          <Separator />
          {field("Background Image URL", textInput(p.backgroundImage, v => onPropsChange({ backgroundImage: v }), "https://example.com/banner.jpg"),
            "Full-width banner image behind the text")}
          {field("Background Color", colorInput(p.backgroundColor, v => onPropsChange({ backgroundColor: v }), "#1e293b"),
            "Used when no image is set")}
          {field("Overlay Opacity", (
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={90} step={5} value={p.overlayOpacity ?? 50}
                onChange={e => onPropsChange({ overlayOpacity: Number(e.target.value) })}
                className="flex-1 accent-blue-500" />
              <span className="text-xs text-gray-500 w-8">{p.overlayOpacity ?? 50}%</span>
            </div>
          ), "Darkness of the image overlay (0 = no overlay)")}
          {field("Text Color", colorInput(p.textColor, v => onPropsChange({ textColor: v }), "#ffffff"))}
          {field("Text Alignment", alignButtons(p.textAlignment, v => onPropsChange({ textAlignment: v })))}
          {field("Padding Size", (
            <div className="flex gap-1">
              {(["sm", "md", "lg"] as const).map(s => (
                <button key={s} onClick={() => onPropsChange({ padding: s })}
                  className={`flex-1 py-1.5 text-xs rounded border font-medium transition-colors ${(p.padding ?? "md") === s ? "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-600" : "border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300"}`}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          ))}
          <Separator />
          {field("CTA Button Text", textInput(p.buttonText, v => onPropsChange({ buttonText: v }), "Browse All →"))}
          {field("CTA Button URL", textInput(p.buttonUrl, v => onPropsChange({ buttonUrl: v }), "/browse"))}
          {field("Button Color", colorInput(p.buttonColor, v => onPropsChange({ buttonColor: v })))}
        </>)}

        {/* ── Custom text block ── */}
        {type === "custom-text" && (<>
          <Separator />
          {field("Body Text", (
            <Textarea value={p.bodyText ?? ""} onChange={e => onPropsChange({ bodyText: e.target.value })} rows={4} placeholder="Write your custom paragraph..." className="text-sm resize-none" />
          ))}
          {field("Text Alignment", alignButtons(p.textAlignment, v => onPropsChange({ textAlignment: v })))}
          {field("Background Color", colorInput(p.backgroundColor, v => onPropsChange({ backgroundColor: v }), "#ffffff"))}
          {field("Text Color", colorInput(p.textColor, v => onPropsChange({ textColor: v })))}
        </>)}

        {/* ── Custom image block ── */}
        {type === "custom-image" && (<>
          <Separator />
          {field("Image URL", textInput(p.imageUrl, v => onPropsChange({ imageUrl: v }), "https://example.com/photo.jpg"))}
          {field("Caption", textInput(p.imageCaption, v => onPropsChange({ imageCaption: v }), "Optional image caption..."))}
        </>)}

        {/* ── Grid sections (categories, featured, recent, related) ── */}
        {(type === "categories" || type === "featured" || type === "recent" || type === "related") && (<>
          <Separator />
          {field("Max Items", (
            <Input type="number" min={1} max={24} value={p.maxItems ?? (type === "categories" ? 8 : 3)}
              onChange={e => onPropsChange({ maxItems: Number(e.target.value) })} className="h-8 text-sm w-24" />
          ))}
          {type === "categories" && field("Columns", (
            <div className="flex gap-1">
              {[2, 3, 4].map(c => (
                <button key={c} onClick={() => onPropsChange({ columns: c })}
                  className={`w-10 py-1.5 text-xs rounded border font-medium transition-colors ${(p.columns ?? 4) === c ? "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-600" : "border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300"}`}>
                  {c}
                </button>
              ))}
            </div>
          ))}
        </>)}

        {/* ── Entry sidebar ── */}
        {type === "sidebar" && (<>
          <Separator />
          {field("Sidebar Title", textInput(p.sidebarTitle, v => onPropsChange({ sidebarTitle: v }), "Contact & Details"))}
        </>)}

        {/* ── Header (browse/entry) ── */}
        {type === "header" && (<>
          <Separator />
          <p className="text-xs text-gray-400">The page header adapts its title automatically from the category or entry name. Use the heading above to customize the default title.</p>
        </>)}

      </div>
    </div>
  );
}

// ─── Main Builder Page ───────────────────────────────────────────────────
export default function BuilderPage() {
  const params = useParams() as { page: string };
  const pageType = params.page ?? "homepage";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settingsData, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();

  const [ts, setTs] = useState<TemplateSettings | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (settingsData) {
      setTs(mergeTemplateSettings((settingsData as any).templateSettings));
    }
  }, [settingsData]);

  const pageKey = pageType === "homepage" ? "homepage" : pageType === "browse" ? "browse" : "entry";
  const blocks: SectionConfig[] = ts ? ts[pageKey].sections : [];

  const updateBlocks = (newBlocks: SectionConfig[]) => {
    if (!ts) return;
    setTs({ ...ts, [pageKey]: { ...ts[pageKey], sections: newBlocks } } as TemplateSettings);
    setIsDirty(true);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = blocks.findIndex(b => b.id === active.id);
      const newIdx = blocks.findIndex(b => b.id === over.id);
      updateBlocks(arrayMove(blocks, oldIdx, newIdx));
    }
  };

  const handleSave = async () => {
    if (!ts || !settingsData) return;
    try {
      await updateMutation.mutateAsync({ data: { templateSettings: ts } as any });
      toast({ title: "Template saved!" });
      qc.invalidateQueries({ queryKey: getGetPublicSettingsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      setIsDirty(false);
    } catch (e: any) {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    }
  };

  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;

  const updateBlock = (id: string, patch: Partial<SectionConfig>) => {
    updateBlocks(blocks.map(b => b.id === id ? { ...b, ...patch } : b));
  };

  const updateBlockProps = (id: string, propsPatch: Partial<SectionProps>) => {
    updateBlocks(blocks.map(b => b.id === id ? { ...b, props: { ...b.props, ...propsPatch } } : b));
  };

  const addBlock = (def: BlockDefinition) => {
    const isUnique = def.type.startsWith("custom-");
    const newId = isUnique ? `${def.type}-${Date.now()}` : def.type;
    const already = blocks.find(b => b.id === newId);
    if (already && !isUnique) return;
    const newBlock: SectionConfig = {
      id: newId,
      type: isUnique ? def.type : undefined,
      label: def.label,
      enabled: true,
      heading: def.defaultHeading ?? "",
      props: { ...(def.defaultProps ?? {}) },
    };
    const newBlocks = [...blocks, newBlock];
    updateBlocks(newBlocks);
    setSelectedId(newId);
    setTimeout(() => document.getElementById(`block-${newId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  };

  const removeBlock = (id: string) => {
    updateBlocks(blocks.filter(b => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const pageLabel = pageType === "homepage" ? "Homepage" : pageType === "browse" ? "Browse Page" : "Entry Detail";
  const previewPath = pageType === "homepage" ? "/" : pageType === "browse" ? "/browse" : "/entry/demo1";
  const themeColor = (settingsData as any)?.themeColor || "#3b82f6";

  if (isLoading || !ts) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-950 z-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-100 dark:bg-gray-950 z-50 overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 shadow-sm">
        <button
          onClick={() => navigate("/admin/settings")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors font-medium"
        >
          <ChevronLeft className="h-4 w-4" /> Settings
        </button>
        <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4 text-blue-500" />
          <span className="font-semibold text-gray-800 dark:text-white">{pageLabel} Builder</span>
        </div>
        {isDirty && (
          <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
            Unsaved changes
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={previewPath} target="_blank" rel="noopener noreferrer">
              <Eye className="h-4 w-4 mr-1.5" /> Preview
            </a>
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isPending || !isDirty}
            style={{ background: isDirty ? themeColor : undefined }}
          >
            {updateMutation.isPending
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <Save className="h-4 w-4 mr-1.5" />}
            Save
          </Button>
        </div>
      </div>

      {/* ── Three-column builder area ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: block library */}
        <BlockLibraryPanel
          pageType={pageType}
          existingIds={blocks.map(b => b.id)}
          onAdd={addBlock}
        />

        {/* Center: canvas */}
        <div
          className="flex-1 overflow-y-auto p-8"
          onClick={() => setSelectedId(null)}
        >
          <div className="max-w-2xl mx-auto">
            {/* Canvas label */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">{pageLabel} Canvas</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4 pl-8">
                  {blocks.map(block => (
                    <div key={block.id} id={`block-${block.id}`}>
                      <SortableBlock
                        block={block}
                        isSelected={selectedId === block.id}
                        onSelect={() => setSelectedId(prev => prev === block.id ? null : block.id)}
                        onRemove={() => removeBlock(block.id)}
                        onToggle={() => updateBlock(block.id, { enabled: !block.enabled })}
                        themeColor={themeColor}
                        siteSettings={settingsData}
                      />
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {blocks.length === 0 && (
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl py-24 text-center text-gray-400">
                <LayoutTemplate className="h-14 w-14 mx-auto mb-4 opacity-20" />
                <p className="font-semibold text-lg">Canvas is empty</p>
                <p className="text-sm mt-1">Add sections from the panel on the left to get started.</p>
              </div>
            )}

            <div className="mt-8 text-center text-xs text-gray-400">
              Drag sections to reorder · Click a section to edit its properties
            </div>
          </div>
        </div>

        {/* Right: properties panel */}
        <PropertiesPanel
          block={selectedBlock}
          onChange={patch => selectedId && updateBlock(selectedId, patch)}
          onPropsChange={patch => selectedId && updateBlockProps(selectedId, patch)}
        />
      </div>
    </div>
  );
}
