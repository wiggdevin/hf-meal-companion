"use client";

/**
 * Onboarding v2, lane 3 — the respectful sex question (BRIEF.md §2/§4): "Now the boring part,
 * for the math — are you male or female?" with a clear, equal-sized "Prefer not to say" path
 * (orchestrator decision, 2026-10-07, coord.md). All three chips are the same size and weight —
 * none of them reads as the "normal" answer — and every tap, including this one, always needs
 * its own tap; none is ever auto-confirmed from speech alone (BRIEF §2 safety note).
 */
import { CHIP_FILL, CHIP_PICKED } from "@/components/Onboarding/facts/chip-fill";
import { PREFER_NOT_TO_SAY_NOTE, type SexAnswer } from "@/components/Onboarding/facts/types";

const CAPTION = "text-tiny font-normal text-muted";

const OPTIONS: { value: SexAnswer; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "unspecified", label: "Prefer not to say" },
];

export function SexChipRow({
  value,
  onSelect,
  question,
}: {
  value?: SexAnswer;
  onSelect: (value: SexAnswer) => void;
  /** The facts beat's own plain question; the original wording stays the default. */
  question?: string;
}) {
  return (
    <div className="flex w-full flex-col gap-3">
      <p className={question ? "m-0 font-serif text-heading-sm text-charcoal" : "m-0 text-body text-charcoal"}>
        {question ?? "Now the boring part, for the math — are you male or female?"}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sex">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            aria-pressed={value === option.value}
            className={`${value === option.value ? CHIP_PICKED : `${CHIP_FILL} text-charcoal`} min-h-12 min-w-0 flex-1 basis-0 rounded-full px-3 text-center text-body-sm font-medium`}
            data-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
      {value === "unspecified" && (
        <p className={`m-0 ${CAPTION}`} role="status">{PREFER_NOT_TO_SAY_NOTE}</p>
      )}
    </div>
  );
}
