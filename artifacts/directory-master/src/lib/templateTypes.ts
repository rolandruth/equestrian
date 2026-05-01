export type FontKey = "inter" | "poppins" | "roboto" | "georgia" | "playfair" | "montserrat";

export interface FontOption {
  key: FontKey;
  label: string;
  family: string;
  googleUrl: string;
}

export const FONTS: FontOption[] = [
  { key: "inter",       label: "Inter",            family: "'Inter', sans-serif",            googleUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" },
  { key: "poppins",     label: "Poppins",          family: "'Poppins', sans-serif",          googleUrl: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" },
  { key: "roboto",      label: "Roboto",           family: "'Roboto', sans-serif",           googleUrl: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" },
  { key: "georgia",     label: "Georgia",          family: "Georgia, 'Times New Roman', serif", googleUrl: "" },
  { key: "playfair",    label: "Playfair Display", family: "'Playfair Display', serif",      googleUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap" },
  { key: "montserrat",  label: "Montserrat",       family: "'Montserrat', sans-serif",       googleUrl: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" },
];

export function getFontFamily(key: string): string {
  return FONTS.find(f => f.key === key)?.family ?? FONTS[0].family;
}

export function getFontGoogleUrl(key: string): string {
  return FONTS.find(f => f.key === key)?.googleUrl ?? "";
}

export interface SectionConfig {
  id: string;
  label: string;
  enabled: boolean;
  heading?: string;
}

export interface HomepageTemplate {
  font: string;
  heroImageUrl: string;
  sections: SectionConfig[];
}

export interface BrowseTemplate {
  font: string;
  heroImageUrl: string;
  cardFields: string[];
  sections: SectionConfig[];
}

export interface EntryTemplate {
  font: string;
  sidebarFields: string[];
  sections: SectionConfig[];
}

export interface TemplateSettings {
  homepage: HomepageTemplate;
  browse: BrowseTemplate;
  entry: EntryTemplate;
}

export const DEFAULT_HOMEPAGE_SECTIONS: SectionConfig[] = [
  { id: "hero",       label: "Hero Banner",       enabled: true, heading: "" },
  { id: "categories", label: "Category Grid",     enabled: true, heading: "Browse by Category" },
  { id: "featured",   label: "Featured Entries",  enabled: true, heading: "Featured" },
  { id: "recent",     label: "Recently Added",    enabled: true, heading: "Recently Added" },
];

export const DEFAULT_BROWSE_SECTIONS: SectionConfig[] = [
  { id: "header",  label: "Page Header",        enabled: true, heading: "All Entries" },
  { id: "filters", label: "Search & Filters",   enabled: true },
  { id: "grid",    label: "Entry Cards Grid",   enabled: true },
];

export const DEFAULT_ENTRY_SECTIONS: SectionConfig[] = [
  { id: "header",      label: "Title & Summary",        enabled: true },
  { id: "description", label: "Description",            enabled: true },
  { id: "moreDetails", label: "Additional Information", enabled: true },
  { id: "sidebar",     label: "Details Sidebar",        enabled: true },
  { id: "related",     label: "Related Entries",        enabled: true },
];

export const BROWSE_CARD_FIELDS: Array<{ id: string; label: string }> = [
  { id: "category",  label: "Category Badge" },
  { id: "location",  label: "Location" },
  { id: "startDate", label: "Start Date" },
  { id: "endDate",   label: "End Date" },
  { id: "venue",     label: "Venue" },
  { id: "eventType", label: "Event Type" },
  { id: "tags",      label: "Tags" },
  { id: "website",   label: "Website" },
];

export const ENTRY_SIDEBAR_FIELDS: Array<{ id: string; label: string }> = [
  { id: "eventType",    label: "Event Type" },
  { id: "startDate",    label: "Start / End Dates" },
  { id: "venue",        label: "Venue" },
  { id: "location",     label: "Location" },
  { id: "website",      label: "Website" },
  { id: "contactEmail", label: "Email" },
  { id: "contactPhone", label: "Phone" },
  { id: "tags",         label: "Tags" },
];

export const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings = {
  homepage: { font: "inter", heroImageUrl: "", sections: DEFAULT_HOMEPAGE_SECTIONS },
  browse:   { font: "inter", heroImageUrl: "", cardFields: ["category", "location", "startDate", "tags"], sections: DEFAULT_BROWSE_SECTIONS },
  entry:    { font: "inter", sidebarFields: ["eventType", "startDate", "venue", "location", "website", "contactEmail", "contactPhone", "tags"], sections: DEFAULT_ENTRY_SECTIONS },
};

function mergeSections(stored: SectionConfig[] | undefined, defaults: SectionConfig[]): SectionConfig[] {
  if (!stored || stored.length === 0) return defaults;
  const storedIds = new Set(stored.map(s => s.id));
  const missing = defaults.filter(d => !storedIds.has(d.id));
  return [...stored, ...missing];
}

export function mergeTemplateSettings(stored: Partial<TemplateSettings> | null | undefined): TemplateSettings {
  if (!stored) return DEFAULT_TEMPLATE_SETTINGS;
  return {
    homepage: {
      ...DEFAULT_TEMPLATE_SETTINGS.homepage,
      ...stored.homepage,
      sections: mergeSections(stored.homepage?.sections, DEFAULT_HOMEPAGE_SECTIONS),
    },
    browse: {
      ...DEFAULT_TEMPLATE_SETTINGS.browse,
      ...stored.browse,
      sections: mergeSections(stored.browse?.sections, DEFAULT_BROWSE_SECTIONS),
      cardFields: stored.browse?.cardFields ?? DEFAULT_TEMPLATE_SETTINGS.browse.cardFields,
    },
    entry: {
      ...DEFAULT_TEMPLATE_SETTINGS.entry,
      ...stored.entry,
      sections: mergeSections(stored.entry?.sections, DEFAULT_ENTRY_SECTIONS),
      sidebarFields: stored.entry?.sidebarFields ?? DEFAULT_TEMPLATE_SETTINGS.entry.sidebarFields,
    },
  };
}
