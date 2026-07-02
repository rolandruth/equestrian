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

const PLACEMENT_CONFIG: Record<
  AdSlotProps["placement"],
  { label: string; imgStyle: React.CSSProperties; wrapperClass: string }
> = {
  // Sidebar: medium rectangle (300×250 feel) — constrained to sidebar width
  sidebar: {
    label: "Ad",
    imgStyle: { maxHeight: 250, objectFit: "cover" },
    wrapperClass: "w-full",
  },
  // Browse inline: leaderboard banner (728×90 feel) — wide, short
  browse_inline: {
    label: "Sponsored",
    imgStyle: { maxHeight: 90, objectFit: "cover" },
    wrapperClass: "w-full",
  },
  // Homepage: large banner (970×250 feel) — wide, moderate height
  homepage: {
    label: "Advertisement",
    imgStyle: { maxHeight: 200, objectFit: "cover" },
    wrapperClass: "w-full",
  },
  // Entry page: medium rectangle (336×280 feel) — centered, not full width
  entry_page: {
    label: "Ad",
    imgStyle: { maxHeight: 280, objectFit: "contain" },
    wrapperClass: "max-w-sm mx-auto",
  },
};

export function AdSlot({ placement, className = "" }: AdSlotProps) {
  const [ad, setAd] = useState<Ad | null>(null);
  const [loading, setLoading] = useState(true);
  const config = PLACEMENT_CONFIG[placement];

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
    <div className={`${config.wrapperClass} ${className}`}>
      <div className="rounded-lg overflow-hidden border border-border bg-muted/30">
        <p className="text-[10px] text-muted-foreground text-center py-0.5 bg-muted/50 tracking-wide uppercase">
          {config.label}
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
            className="w-full"
            style={config.imgStyle}
          />
        </a>
      </div>
    </div>
  );
}
