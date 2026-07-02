import { useEffect, useState } from "react";

type Ad = {
  id: number;
  title: string;
  advertiser: string | null;
  imageUrl: string;
  linkUrl: string;
  placement: string;
};

interface AdSlotProps {
  placement: "sidebar" | "browse_inline" | "homepage" | "entry_page";
  className?: string;
}

export function AdSlot({ placement, className = "" }: AdSlotProps) {
  const [ad, setAd] = useState<Ad | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/ads/public?placement=${placement}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAd(data ?? null);
      })
      .catch(() => {
        if (!cancelled) setAd(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [placement]);

  const handleClick = () => {
    if (!ad) return;
    fetch(`/api/ads/public/${ad.id}/click`, { method: "POST" }).catch(() => {});
  };

  if (loading || !ad) return null;

  return (
    <div className={`rounded-lg overflow-hidden border border-border bg-muted/30 ${className}`}>
      <p className="text-[10px] text-muted-foreground text-center py-0.5 bg-muted/50 tracking-wide uppercase">
        Advertisement
      </p>
      <a
        href={ad.linkUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={handleClick}
        className="block hover:opacity-90 transition-opacity"
        title={ad.advertiser ?? ad.title}
      >
        <img
          src={ad.imageUrl}
          alt={ad.title}
          className="w-full object-cover"
        />
      </a>
    </div>
  );
}
