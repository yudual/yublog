"use client";

import { useSiteSettings } from "@/lib/site-settings-store";
import { toAbsoluteUrl } from "@/lib/upload";
import { toSafeImageUrl } from "@/lib/web-url";

interface DesktopDecorationsProps {
  image?: string;
}

export default function DesktopDecorations({ image }: DesktopDecorationsProps = {}) {
  const storeDecoration = useSiteSettings((s) => s.decorationImage);
  const loaded = useSiteSettings((s) => s.loaded);

  const decorationImage = image || storeDecoration;

  if (!image && (!loaded || !decorationImage)) return null;
  if (!decorationImage) return null;
  const safeImage = toSafeImageUrl(decorationImage);
  if (!safeImage) return null;

  return (
    <div className="pointer-events-none fixed inset-0 hidden overflow-hidden md:block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={toAbsoluteUrl(safeImage)}
        alt=""
        className="h-full w-full object-cover opacity-[0.15] dark:opacity-[0.08]"
      />
    </div>
  );
}
