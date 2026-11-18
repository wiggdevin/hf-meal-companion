// @vitest-environment jsdom
/**
 * Readiness audit 2026-11-17 A1: the Send feedback sheet. A confirmed send shows "sent" and clears
 * the draft; every failed outcome shows why and keeps the typed text; the screen switch sends the
 * shown path only when it is on.
 */
import { useState, type SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import FeedbackCard, { FeedbackSheet } from "@/components/settings/FeedbackCard";
import { lastScreenBeforeSettings, noteScreen } from "@/lib/feedback-client";
import { feedbackScreen } from "@/lib/feedback";
import type { FeedbackBody } from "@/lib/feedback";
import type { FeedbackOutcome } from "@/lib/feedback-client";
import { readFeedbackDraft } from "@/lib/feedback-client";
import { bindAccount, unbindAccount } from "@/lib/device/account";

afterEach(() => { cleanup(); });

function Harness({ send, screenPath = "/foods", initial = "" }: {
  send: (body: FeedbackBody) => Promise<FeedbackOutcome>; screenPath?: string | null; initial?: string;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <>
      <output data-testid="draft">{draft}</output>
      <FeedbackSheet draft={draft} onDraft={setDraft} screen={screenPath} send={send} onClose={() => {}} />
    </>
  );
}

const textbox = () => screen.getByRole("textbox") as HTMLTextAreaElement;

async function typeAndSend(text: string): Promise<void> {
  fireEvent.change(textbox(), { target: { value: text } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send" })); });
}

describe("FeedbackCard", () => {
  it("closed: shows the Send feedback row in Data & account", () => {
    const markup = renderToStaticMarkup(<FeedbackCard />);
    expect(markup).toContain("Send feedback");
    expect(markup).toContain("aria-haspopup=\"dialog\"");
  });
});

describe("FeedbackSheet states", () => {
  it("idle: Send stays off until there is text, and the counter shows the 2,000 cap", () => {
    render(<Harness send={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(textbox().maxLength).toBe(2000);
    expect(screen.getByText("0 / 2,000")).toBeTruthy();
    fireEvent.change(textbox(), { target: { value: "hello" } });
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("5 / 2,000")).toBeTruthy();
  });

  it("sent: shows the thanks notice and clears the draft", async () => {
    const send = vi.fn(async (): Promise<FeedbackOutcome> => "sent");
    render(<Harness send={send} />);
    await typeAndSend("  The plan skipped lunch.  ");
    expect(send).toHaveBeenCalledWith({ message: "The plan skipped lunch.", screen: null, appBuild: null });
    expect(screen.getByText("Thanks. Your feedback was sent.")).toBeTruthy();
    expect(screen.getByTestId("draft").textContent).toBe("");
  });

  it.each<[FeedbackOutcome, string]>([
    ["failed", "Check your connection"],
    ["rate_limited", "Try again tomorrow"],
    ["signed_out", "Sign in again"],
  ])("failed (%s): shows why and keeps the typed text", async (outcome, words) => {
    const send = vi.fn(async (): Promise<FeedbackOutcome> => outcome);
    render(<Harness send={send} />);
    await typeAndSend("Keep me");
    expect(screen.getByRole("alert").textContent).toContain(words);
    expect(textbox().value).toBe("Keep me");
    expect(screen.getByTestId("draft").textContent).toBe("Keep me");
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("failed (send throws): keeps the typed text", async () => {
    render(<Harness send={vi.fn(async () => { throw new Error("offline"); })} />);
    await typeAndSend("Still here");
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(textbox().value).toBe("Still here");
  });

  it("screen switch: sends the shown path only when on", async () => {
    const send = vi.fn(async (): Promise<FeedbackOutcome> => "sent");
    render(<Harness send={send} screenPath="/foods" />);
    expect(screen.getByText("Sends \"/foods\" with your note.")).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: "Include the screen I was on" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await typeAndSend("With screen");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ screen: "/foods" }));
  });

  it("screen switch: off and disabled when there is no other screen", () => {
    render(<Harness send={vi.fn()} screenPath={null} />);
    const toggle = screen.getByRole("switch", { name: "Include the screen I was on" }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(screen.getByText("No other screen yet.")).toBeTruthy();
  });
});

describe("the remembered screen", () => {
  it("keeps the last screen before Settings and never Settings itself", () => {
    noteScreen("/foods");
    noteScreen("/settings");
    expect(lastScreenBeforeSettings()).toBe("/foods");
  });

  it("sends a plain path only", () => {
    expect(feedbackScreen("/foods?x=1#y")).toBe("/foods");
    expect(feedbackScreen("not a path")).toBeNull();
    expect(feedbackScreen(null)).toBeNull();
  });
});

describe("draft recovery and the send race", () => {
  afterEach(() => { unbindAccount(); sessionStorage.clear(); });

  function open(): void {
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
  }

  it("failed then remount: the typed text comes back for the same account only", () => {
    bindAccount("22222222-2222-4222-8222-222222222222");
    const first = render(<FeedbackCard />);
    open();
    fireEvent.change(textbox(), { target: { value: "Half a thought" } });
    first.unmount();
    render(<FeedbackCard />);
    open();
    expect(textbox().value).toBe("Half a thought");
    cleanup();
    unbindAccount();
    bindAccount("33333333-3333-4333-8333-333333333333");
    expect(readFeedbackDraft()).toBe("");
  });

  it("sent after an edit: a newer draft is kept, and Cancel is off while sending", async () => {
    let finish: (o: FeedbackOutcome) => void = () => {};
    const send = vi.fn(() => new Promise<FeedbackOutcome>((r) => { finish = r; }));
    let setOuter: (next: SetStateAction<string>) => void = () => {};
    function Race() {
      const [draft, setDraft] = useState("");
      setOuter = setDraft;
      return (
        <>
          <output data-testid="draft">{draft}</output>
          <FeedbackSheet draft={draft} onDraft={setDraft} screen={null} send={send} onClose={() => {}} />
        </>
      );
    }
    render(<Race />);
    await typeAndSend("first note");
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => { setOuter("second note"); });
    await act(async () => { finish("sent"); });
    expect(screen.getByTestId("draft").textContent).toBe("second note");
  });
});
