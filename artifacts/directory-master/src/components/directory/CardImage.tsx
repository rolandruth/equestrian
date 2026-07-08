import { useEffect, useState } from "react";

// In-memory cache so we only hit the Street View metadata endpoint once per URL,
// even though the same entry image can appear on multiple pages (home + browse).
const availabilityCache = new Map<string, boolean>();

function isStreetViewUrl(url: string): boolean {
  return url.includes("maps.googleapis.com/maps/api/streetview");
}

function toMetadataUrl(url: string): string {
  return url.replace("/streetview?", "/streetview/metadata?");
}

/**
 * Street View Static API always returns HTTP 200 with a "Sorry, we have no
 * imagery here." placeholder graphic when there's no coverage at a location —
 * it never errors, so a plain <img onError> can't detect it. The metadata
 * endpoint returns { status: "OK" | "ZERO_RESULTS" | ... } for the same
 * location and is the documented way to check availability beforehand.
 */
function useImageAvailability(url: string | null): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(() => {
    if (!url) return false;
    if (!isStreetViewUrl(url)) return true;
    return availabilityCache.get(url) ?? null;
  });

  useEffect(() => {
    if (!url || !isStreetViewUrl(url)) return;
    const cached = availabilityCache.get(url);
    if (cached !== undefined) {
      setAvailable(cached);
      return;
    }
    let cancelled = false;
    fetch(toMetadataUrl(url))
      .then(res => res.json())
      .then(data => {
        const ok = data?.status === "OK";
        availabilityCache.set(url, ok);
        if (!cancelled) setAvailable(ok);
      })
      .catch(() => {
        // Metadata check failed (network issue, etc.) — fail open and let the
        // normal <img onError> fallback guard against a broken image.
        if (!cancelled) setAvailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return available;
}

interface CardImageProps {
  src: string;
  alt: string;
  wrapperClassName?: string;
  imgClassName?: string;
}

/**
 * Renders an entry's card image, hiding it entirely (no broken image, no
 * "no imagery" placeholder) when the source is unavailable. While a Street
 * View availability check is in flight, nothing is rendered to avoid a
 * flash of the placeholder graphic.
 */
export function CardImage({ src, alt, wrapperClassName, imgClassName }: CardImageProps) {
  const [broken, setBroken] = useState(false);
  const available = useImageAvailability(src);

  if (broken || available === false || available === null) return null;

  return (
    <div className={wrapperClassName ?? "aspect-video w-full overflow-hidden bg-gray-100 dark:bg-gray-800"}>
      <img
        src={src}
        alt={alt}
        className={imgClassName ?? "h-full w-full object-cover"}
        onError={() => setBroken(true)}
      />
    </div>
  );
}
