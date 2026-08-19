type PublicEntryIdentifier = {
  id: string | number;
  slug?: string | null;
};

export function getPublicEntryPath(entry: PublicEntryIdentifier): string {
  return `/entry/${encodeURIComponent(String(entry.slug || entry.id))}`;
}