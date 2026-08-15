import { useEffect, useRef } from "react";

/**
 * Google AdSense ad slot.
 * Renders a real AdSense unit when both client and slot IDs are configured;
 * otherwise shows a subtle "Advertisement" placeholder so the reserved space
 * is visible while AdSense approval is pending.
 *
 * The AdSense loader script itself should be added via the admin
 * "Head Scripts" setting once the account is approved.
 */
export function AdSenseSlot({ adClient, adSlot }: { adClient?: string; adSlot?: string }) {
  const configured = !!(adClient && adSlot);
  const insRef = useRef<HTMLModElement | null>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!configured || pushedRef.current) return;
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch {
      // AdSense script not loaded yet — placeholder space remains.
    }
  }, [configured]);

  if (!configured) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="border border-dashed border-gray-300 rounded-lg bg-gray-50 text-gray-400 text-xs uppercase tracking-widest text-center py-10">
          Advertisement
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={adClient}
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
