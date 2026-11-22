// @vitest-environment jsdom
/**
 * Fast logging (2026-11-21): Today's re-log batches. Each batch keeps its own card, Undo and Try
 * again, so a second re-log never takes the first one's Undo away; aggregated marks show once;
 * every control waits while its batch is running.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { LoggedFood } from "@/lib/types";
import { EGG, RICE, entry, item } from "../log/fast/relog-fixtures";

const state = vi.hoisted(() => ({ days: {} as Record<string, { extras: LoggedFood[] }> }));
vi.mock("@/lib/device/account", () => ({
  accountHandle: () => ({ userId: "u1", epoch: 1 }),
  currentAccountOrNull: () => ({ userId: "u1", epoch: 1 }),
  isCurrent: () => true,
}));
vi.mock("@/lib/store", () => ({ getDay: (date: string) => state.days[date] }));
vi.mock("@/lib/log-commit-client", () => ({
  commitLogEntry: vi.fn(),
  committedEntry: (date: string, fallback: LoggedFood) =>
    state.days[date]?.extras.find((e) => e.id === fallback.id) ?? fallback,
}));
vi.mock("@/lib/log/delete-entry", () => ({ forgetLoggedEntry: vi.fn() }));

import RelogReceipts from "@/components/today/RelogReceipts";
import { useRelogBatches } from "@/components/today/useRelogBatches";
import type { RelogDeps } from "@/lib/log/relog-batch";
import { NUTRITION_UNCHECKED_COPY } from "@/lib/nutrition-display";

const eggs = entry("eggs", "2026-11-20T08:00:00Z", [item(EGG, 150)]);
const rice = entry("rice", "2026-11-20T13:00:00Z", [item(RICE, 200)], { name: "Rice" });
const AT = new Date("2026-11-21T12:00:00Z");

type Req = { local_date: string };
type Opts = { optimistic: { date: string; entry: LoggedFood } };
let answers: Record<string, unknown>[];
const commit = vi.fn(async (req: Req, opts: Opts) => {
  const out = answers.shift() ?? { status: "ok" };
  if (out.status === "ok") (state.days[req.local_date] ??= { extras: [] }).extras.push({ ...opts.optimistic.entry, rev: 2 });
  return out;
});
const forget = vi.fn(async (date: string, id: string) => {
  state.days[date].extras = state.days[date].extras.filter((e) => e.id !== id);
});

function Harness({ onChange }: { onChange: () => void }) {
  const relogs = useRelogBatches(onChange, { commit, forget } as unknown as RelogDeps);
  return (
    <>
      <button type="button" onClick={() => void relogs.start([eggs], { at: AT, slot: "meal-1" })}>eggs</button>
      <button type="button" onClick={() => void relogs.start([rice, eggs], { at: AT, slot: "meal-2" })}>both</button>
      <RelogReceipts batches={relogs.batches} isRunning={relogs.isRunning}
        onUndo={(id) => void relogs.undo(id)} onRetry={(id) => void relogs.retry(id)} onDismiss={relogs.dismiss} />
    </>
  );
}

beforeEach(() => { state.days = {}; answers = []; commit.mockClear(); forget.mockClear(); });
afterEach(cleanup);

const cards = () => screen.queryAllByText(/Logged|Undone|did not log/).map((el) => el.closest("[data-relog-batch]") as HTMLElement);

describe("Today's re-log receipts", () => {
  it("keeps each batch's Undo on its own", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByText("eggs"));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(1));
    fireEvent.click(screen.getByText("both"));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(2));
    expect(screen.getByRole("group", { name: "Re-logged meals" })).toBeTruthy();
    // Undo the first batch: the second keeps its own Undo.
    fireEvent.click(within(cards()[0]).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(screen.getByText("Undone.")).toBeTruthy());
    expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(1);
    expect(screen.getByText("Logged Rice, Eggs.")).toBeTruthy();
    expect(forget).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("offers Try again for what did not log, and sends only that", async () => {
    answers = [{ status: "ok" }, { status: "refused", reason: "x", message: "No." }];
    render(<Harness onChange={() => {}} />);
    fireEvent.click(screen.getByText("both"));
    await waitFor(() => expect(screen.getByText("Logged Rice. Eggs did not log.")).toBeTruthy());
    commit.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Logged Rice, Eggs.")).toBeTruthy());
    expect(commit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows every entry's marks once, and nutrition not fully checked", async () => {
    answers = [{ status: "ok", nutrition_unchecked: true }, { status: "ok", flagged: [{ path: "p", message: "blocked:gluten" }] }];
    render(<Harness onChange={() => {}} />);
    fireEvent.click(screen.getByText("both"));
    await waitFor(() => expect(screen.getByText(/off-plan/)).toBeTruthy());
    expect(screen.getByText(new RegExp(NUTRITION_UNCHECKED_COPY.replace(".", "\\.")))).toBeTruthy();
  });

  it("disables a batch's buttons while its Undo runs", async () => {
    render(<Harness onChange={() => {}} />);
    fireEvent.click(screen.getByText("eggs"));
    await waitFor(() => screen.getByRole("button", { name: "Undo" }));
    let release: () => void = () => {};
    forget.mockImplementationOnce(() => new Promise<void>((r) => { release = r; }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true));
    await act(async () => { release(); });
  });

  it("dismisses one batch's card without touching another", async () => {
    render(<Harness onChange={() => {}} />);
    fireEvent.click(screen.getByText("eggs"));
    await waitFor(() => screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByText("both"));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(2));
    fireEvent.click(within(cards()[0]).getByRole("button", { name: "Dismiss" }));
    expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(1);
  });
});
