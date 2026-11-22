"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import HfLogo from "@/components/brand/HfLogo";

/**
 * Today's header, after the brand mockup: the patchwork H on the left, the page's own controls on
 * the right, then a wide-tracked caps date, the serif greeting (today only, decorative) and a heavy
 * Archivo title. It keeps PageTitle's contract: one visible `h1` and an optional way back.
 */
export default function TodayHeader({ eyebrow, title, greeting, trailing, back }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** "Good morning," and the like: spoken by nothing, a visual accent only. */
  greeting?: string;
  trailing?: ReactNode;
  back?: { href: string; label: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void };
}) {
  return <header className="flex flex-col gap-3 px-1">
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="shrink-0"><HfLogo variant="monogram" tone="auto" height={36} decorative /></span>
      {/* min-w-0: on a 375 px phone the controls share the row; the day-type chip is the one that
          gives way (it truncates its name), never the row itself. */}
      {trailing && <div className="flex min-w-0 items-center justify-end gap-2">{trailing}</div>}
    </div>
    <div className="flex min-w-0 flex-col">
      {back && <Link href={back.href} onClick={back.onClick}
        className="tap -ml-1 inline-flex min-h-11 items-center gap-1 self-start px-1 text-caption font-medium text-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        {back.label}
      </Link>}
      {eyebrow && <p className="m-0 font-display text-overline font-bold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>}
      {greeting && <p aria-hidden="true" className="font-accent m-0 mt-1 text-title text-muted">{greeting}</p>}
      <h1 className="m-0 font-display text-heading font-extrabold leading-[34px] tracking-[-0.03em] text-charcoal">{title}</h1>
    </div>
  </header>;
}
