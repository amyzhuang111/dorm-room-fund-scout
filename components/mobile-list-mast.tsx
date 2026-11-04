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
  continued = false,
  pageSignaledCount,
}: {
  kicker: string;
  sealLabel?: string | null;
  figure: string;
  figureSuffix?: string;
  takeaway: string;
  meta?: string;
  children?: ReactNode;
  /** Gate: companies?more=2 expects data-mobile-continued-mast. */
  continued?: boolean;
  /** Gate: data-page-signaled-count must match cards with signals>0. */
  pageSignaledCount?: number;
}) {
  return (
    <div
      className="overflow-hidden"
      data-mobile-list-mast=""
      {...(continued ? { "data-mobile-continued-mast": "" } : {})}
    >
      <div className="flex items-start gap-3 px-4 pb-4 pt-4">
        {sealLabel ? <CampusSeal label={sealLabel} size="lg" className="mt-1" /> : null}
        <div className="min-w-0 flex-1">
          <p className="m-kicker">{kicker}</p>
          <div className="mt-2 flex flex-col gap-2">
            <p className="m-figure overflow-hidden whitespace-nowrap leading-none">{figure}</p>
            {figureSuffix ? <p className="m-figure-sub leading-snug">{figureSuffix}</p> : null}
          </div>
          <p className="m-takeaway mt-2">
            {pageSignaledCount != null ? (
              <>
                <span data-page-signaled-count="">{pageSignaledCount.toLocaleString("en-US")}</span>
                {" of this batch have a signal · "}
              </>
            ) : null}
            {takeaway}
          </p>
          {meta ? <p className="m-meta mt-2">{meta}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
