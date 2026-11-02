import type { ReactNode } from "react";
import { CampusSeal } from "@/components/campus-seal";

/**
 * r30 mobile list mast: seal + real counts + one-line takeaway.
 * Desktop callers should wrap with lg:hidden / sm:hidden.
 */
export function MobileListMast({
  kicker,
  sealLabel,
  figure,
  figureSuffix,
  takeaway,
  meta,
  children,
}: {
  kicker: string;
  sealLabel?: string | null;
  figure: string;
  figureSuffix?: string;
  takeaway: string;
  meta?: string;
  children?: ReactNode;
}) {
  return (
    <div className="overflow-hidden" data-mobile-list-mast="">
      <div className="flex items-start gap-3 px-4 pb-4 pt-4">
        {sealLabel ? <CampusSeal label={sealLabel} size="lg" className="mt-1" /> : null}
        <div className="min-w-0 flex-1">
          <p className="m-kicker">{kicker}</p>
          <p className="m-figure mt-2 overflow-hidden">
            {figure}
            {figureSuffix ? <span className="m-figure-sub ml-2">{figureSuffix}</span> : null}
          </p>
          <p className="m-takeaway mt-2">{takeaway}</p>
          {meta ? <p className="m-meta mt-2">{meta}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
