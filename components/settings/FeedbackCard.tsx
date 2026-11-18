"use client";

import { useCallback, useState, type SetStateAction } from "react";
import Sheet from "@/components/Sheet";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import { FEEDBACK_MAX_CHARS, feedbackScreen, type FeedbackBody } from "@/lib/feedback";
import {
  lastScreenBeforeSettings, readFeedbackDraft, sendFeedback, writeFeedbackDraft, type FeedbackOutcome,
} from "@/lib/feedback-client";
import { currentAccountOrNull, isCurrent } from "@/lib/device/account";
import { CAPTION, FIELD_LABEL } from "./settings-styles";

type Phase = "idle" | "sending" | "sent" | "failed";

const FAILURE: Record<Exclude<FeedbackOutcome, "sent">, string> = {
  failed: "Not sent. Check your connection and try again. Your text is still here.",
  rate_limited: "You have sent a lot of feedback today. Try again tomorrow. Your text is still here.",
  signed_out: "Your session ended. Sign in again, then send it. Your text is still here.",
};

/**
 * Settings → Data & account → Send feedback (readiness audit 2026-11-17, A1). The row opens a
 * sheet with a 2,000-character box, an optional "include the screen I was on" switch (the last
 * screen before Settings, shown so the tester sees what is sent) and Send. The draft lives here,
 * above the sheet, and in sessionStorage under the account, so a failed send, closing the sheet, a
 * remount or a reload never loses it. A confirmed send clears it only when the text is still the
 * one that was sent.
 */
export default function FeedbackCard() {
  const [open, setOpen] = useState(false);
  const [draft, setDraftState] = useState(readFeedbackDraft);
  const setDraft = useCallback((next: SetStateAction<string>) => {
    setDraftState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      writeFeedbackDraft(value);
      return value;
    });
  }, []);
  return (
    <section aria-label="Send feedback" className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className={`m-0 min-w-0 ${CAPTION}`}>Tell us what worked, what broke or what was confusing.</p>
        <Button variant="secondary" size="sm" className="shrink-0" aria-haspopup="dialog"
          onClick={() => setOpen(true)}>
          Send feedback
        </Button>
      </div>
      {open ? (
        <FeedbackSheet draft={draft} onDraft={setDraft} screen={feedbackScreen(lastScreenBeforeSettings())}
          send={sendForCurrentAccount} onClose={() => setOpen(false)} />
      ) : null}
    </section>
  );
}

async function sendForCurrentAccount(body: FeedbackBody): Promise<FeedbackOutcome> {
  const account = currentAccountOrNull();
  if (account === null || !isCurrent(account)) return "signed_out";
  return sendFeedback(account, body);
}

export function FeedbackSheet({ draft, onDraft, screen, send, onClose }: {
  draft: string;
  /** Takes a value or an updater; the updater sees the latest draft. */
  onDraft: (next: SetStateAction<string>) => void;
  /** The screen the switch would send, or null when there is none to send. */
  screen: string | null;
  send: (body: FeedbackBody) => Promise<FeedbackOutcome>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [withScreen, setWithScreen] = useState(false);
  const ready = draft.trim().length > 0 && phase !== "sending";

  const submit = async (): Promise<void> => {
    if (!ready) return;
    const submitted = draft;
    setPhase("sending");
    setError(null);
    const outcome = await send({
      message: submitted.trim(),
      screen: withScreen ? screen : null,
      appBuild: buildSha(),
    }).catch((): FeedbackOutcome => "failed");
    if (outcome === "sent") {
      // Clear only the text that was sent: a draft edited since (a closed and reopened sheet) stays.
      onDraft((current) => (current === submitted ? "" : current));
      setPhase("sent");
      return;
    }
    setError(FAILURE[outcome]);
    setPhase("failed");
  };

  if (phase === "sent") {
    return (
      <Sheet title="Send feedback" onClose={onClose}
        footer={<Button variant="primary" size="lg" block onClick={onClose}>Done</Button>}>
        <Notice tone="success" title="Thanks. Your feedback was sent." />
      </Sheet>
    );
  }

  return (
    <Sheet title="Send feedback" onClose={onClose}
      footer={<div className="flex flex-col gap-2.5">
        <Button variant="primary" size="lg" block disabled={!ready}
          status={phase === "sending" ? "pending" : "idle"} onClick={() => { void submit(); }}>
          Send
        </Button>
        <Button variant="tertiary" block disabled={phase === "sending"} onClick={onClose}>Cancel</Button>
      </div>}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="flex flex-col gap-2">
          <span className={`pl-1.5 ${FIELD_LABEL}`}>What did you do, and what did you see?</span>
          <textarea value={draft} maxLength={FEEDBACK_MAX_CHARS} rows={6}
            disabled={phase === "sending"}
            onChange={(e) => { onDraft(e.target.value); if (phase === "failed") setPhase("idle"); }}
            className="well w-full resize-none px-4 py-3 text-body font-medium text-charcoal" />
        </label>
        <span className={`-mt-2 self-end ${CAPTION}`}>
          {draft.length.toLocaleString("en-US")} / {FEEDBACK_MAX_CHARS.toLocaleString("en-US")}
        </span>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className={FIELD_LABEL}>Include the screen I was on</span>
            <span className={CAPTION}>{screen ? `Sends "${screen}" with your note.` : "No other screen yet."}</span>
          </div>
          <Button type="button" variant="secondary" size="sm" role="switch" aria-checked={withScreen && screen !== null}
            aria-label="Include the screen I was on" className="shrink-0" disabled={screen === null}
            onClick={() => setWithScreen((on) => !on)}>
            {withScreen && screen !== null ? "On" : "Off"}
          </Button>
        </div>
        <p className={`m-0 ${CAPTION}`}>
          We save your note with your account so the people running this test can read it and follow up. Other accounts never see it.
        </p>
        {error ? <Notice tone="error" title={error} /> : null}
      </form>
    </Sheet>
  );
}

function buildSha(): string | null {
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA;
  return sha && /^[A-Za-z0-9._-]{1,64}$/.test(sha) ? sha : null;
}
