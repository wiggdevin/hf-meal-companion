/**
 * The coach's nutrition charts (`kcal_week`, `macros_trend`): what was eaten on each day of a
 * window, read on the SERVER by the phone's own rule (lib/trends/series.ts `dayMacroIntake`).
 *
 * One snapshot per chart: the window's log entries, its plan days (eaten slots, recipe snapshots,
 * day-type overrides, the "fully logged" mark), the account's settings and its target revisions
 * are each read once, never once per day. Which dates qualify and what they total come from the
 * same rows, so a date cannot be charted from a read that no longer holds it. A day is charted
 * when it recorded something: a log entry, an eaten recipe or a ticked plan slot. A ticked slot
 * nothing describes is never estimated; it makes the day a floor ("at least").
 *
 * Reads only, and every read stops when `signal` aborts (the turn ended or the phone left) or
 * when a sibling read fails.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCommitSlot } from "@/lib/log/contract";
import { amountLabel, entryMass, massOf } from "@/lib/log/mass";
import { itemKcal } from "@/lib/nutrients/energy";
import { readByDateChunks, readByIdBatches } from "@/lib/server/date-chunks";
import { eatenSlotIds } from "@/lib/server/expenditure-intake";
import { judgePartialItems } from "@/lib/server/log-recipe-coverage";
import { fetchAllRows } from "@/lib/server/paged-read";
import { defaultSettings } from "@/lib/store";
import { planDayFields, planDayProjectionSchema } from "@/lib/sync/plan-days-schema";
import { settingsProfileFromRow, type UserSettingsProfileRow } from "@/lib/sync/user-settings";
import { resolveTargets, targetDayType } from "@/lib/targets";
import { settingsWithTargetRevisions, targetRevisionFromProfile } from "@/lib/targets/revision";
import { dayMacroIntake, type DayMacroIntake } from "@/lib/trends/series";
import type { TargetProfile } from "@/lib/api-types";
import type { LoggedFood, LoggedItem, Macros, Settings, StoredDay, TargetRevision } from "@/lib/types";

export type ChartIntakeDay = DayMacroIntake & {
  date: string;
  /** The revision in force that day for its day type; null before the account's first one. */
  target: Macros | null;
};

/** Either every date from `from` to `to` (both inclusive), or exactly the listed dates. */
export type IntakeDates = { from: string; to: string } | { dates: readonly string[] };

type Row = Record<string, unknown>;
type ItemRow = { seq: number; grams: number | string | null; food_ref_id: string;
  qty?: number | string | null; unit?: string | null;
  snapshot: Record<string, { amount: number | string | null }> | null;
  nutrition_partial?: boolean | null };
type EntryRow = { id: string; local_date: string; slot: string; log_items: ItemRow[] };

const ENTRY_COLUMNS = "id, local_date, slot, "
  + "log_items(seq, qty, unit, grams, food_ref_id, snapshot, nutrition_partial)";
const PLAN_COLUMNS = "local_date, day_type_override, floor_day, swaps, slot_notes, item_overrides, eaten_slots, "
  + "day_complete_at";

/** A query that stops with `signal`; test doubles without `abortSignal` run unchanged. */
function bound<Q>(query: Q, signal: AbortSignal): Q {
  const q = query as Q & { abortSignal?: (s: AbortSignal) => Q };
  return typeof q.abortSignal === "function" ? q.abortSignal(signal) : query;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** The same per-item totals as lib/server/day-context.ts: an unknown energy adds nothing. */
function itemMacros(snapshot: ItemRow["snapshot"]): Macros {
  const s = snapshot ?? {};
  const at = (code: string) => num(s[code]?.amount ?? 0);
  return { kcal: itemKcal(s) ?? 0, protein: at("protein"), carbs: at("carbohydrate"), fat: at("fat_total") };
}

function loggedFood(entry: EntryRow, partial: boolean): LoggedFood {
  const items: LoggedItem[] = [...entry.log_items].sort((a, b) => a.seq - b.seq).map((item) => {
    const grams = massOf(item.grams);
    const amount = grams === null
      ? { grams: null, qty: num(item.qty), unit: item.unit ?? "each" }
      : { grams, qty: grams, unit: "g" };
    return {
      id: `${entry.id}:${item.seq}`, seq: item.seq, food_ref_id: item.food_ref_id, ...amount,
      snapshot: (item.snapshot ?? {}) as LoggedItem["snapshot"], foodId: item.food_ref_id, name: "",
      portionLabel: grams === null ? amountLabel(amount) : `${Math.round(grams)} g`,
      macros: itemMacros(item.snapshot),
    };
  });
  const { grams, massUnknown } = entryMass(items);
  // An entry with no items measured nothing: NaN totals read as unmeasured (series.ts `add`), not 0.
  const macros = items.length === 0 ? { kcal: NaN, protein: NaN, carbs: NaN, fat: NaN } : items.reduce((t, i) => ({ kcal: t.kcal + i.macros.kcal, protein: t.protein + i.macros.protein,
    carbs: t.carbs + i.macros.carbs, fat: t.fat + i.macros.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return {
    // Every slot a log may name (ritual slots too), so a ticked slot with its own log counts once.
    ...(isCommitSlot(entry.slot) ? { slot: entry.slot } : {}),
    id: entry.id, foodId: "meal", name: "", qty: 1, grams, ...(massUnknown ? { massUnknown: true } : {}),
    portionLabel: "", macros, at: "", items, ...(partial ? { nutritionPartial: true } : {}),
  };
}

async function readEntries(admin: SupabaseClient, userId: string, span: IntakeDates, signal: AbortSignal) {
  const base = () => admin.from("log_entries").select(ENTRY_COLUMNS).eq("user_id", userId).is("deleted_at", null);
  const run = async (query: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await bound(query, signal);
    if (error) throw error;
    return (data ?? []) as EntryRow[];
  };
  return "dates" in span
    ? readByIdBatches([...span.dates], (batch) => run(base().in("local_date", batch)))
    : readByDateChunks(span.from, span.to, (start, end) =>
      run(base().gte("local_date", start).lte("local_date", end)));
}

async function readPlanDays(admin: SupabaseClient, userId: string, span: IntakeDates, signal: AbortSignal) {
  const base = () => admin.from("plan_days").select(PLAN_COLUMNS).eq("user_id", userId);
  const run = async (query: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await bound(query, signal);
    if (error) throw error;
    return (data ?? []) as Row[];
  };
  return "dates" in span
    ? readByIdBatches([...span.dates], (batch) => run(base().in("local_date", batch)))
    : readByDateChunks(span.from, span.to, (start, end) =>
      run(base().gte("local_date", start).lte("local_date", end)));
}

/** The settings the targets resolve from: the profile row and every revision up to `through`. */
async function targetSettings(admin: SupabaseClient, userId: string, through: string,
  signal: AbortSignal): Promise<Settings> {
  const [row, profiles] = await Promise.all([
    // Throw here, not after Promise.all, so a failed settings read stops its siblings at once.
    bound(admin.from("user_settings").select("*").eq("user_id", userId), signal).maybeSingle()
      .then((result) => { if (result.error) throw result.error; return result; }),
    fetchAllRows<TargetProfile>((from, to) => bound(admin.from("target_profiles").select("*")
      .eq("user_id", userId).lte("effective_from", through)
      .order("effective_from", { ascending: true }).order("rev", { ascending: true }).range(from, to), signal)),
  ]);
  const settingsRow = (row.data ?? {}) as UserSettingsProfileRow;
  const base: Settings = { ...defaultSettings(), ...settingsProfileFromRow(settingsRow) };
  const revisions = profiles.flatMap((profile) => {
    const revision = targetRevisionFromProfile(profile);
    return revision ? [revision as TargetRevision] : [];
  });
  return settingsWithTargetRevisions(base, revisions, through);
}

/** A signal that aborts with `outer` and on demand (the first failed read cancels its siblings). */
function linked(outer: AbortSignal | undefined): AbortController {
  const controller = new AbortController();
  if (outer?.aborted) controller.abort(outer.reason);
  else outer?.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
  return controller;
}

/**
 * Every charted day in `span`, oldest first. `today` is the account's real date: a day at or
 * after it that is not marked "fully logged" is still being eaten, so its totals are a floor
 * (lib/trends/series.ts: a partial day does not count for intake).
 */
export async function readIntakeWindow(admin: SupabaseClient, userId: string, span: IntakeDates,
  opts: { today: string; signal?: AbortSignal }): Promise<ChartIntakeDay[]> {
  const through = "dates" in span ? [...span.dates].sort().at(-1) : span.to;
  if (!through) return [];
  const controller = linked(opts.signal);
  const signal = controller.signal;
  const stopOnFailure = <T>(work: Promise<T>) => work.catch((error: unknown) => {
    controller.abort(error);
    throw error;
  });
  signal.throwIfAborted();
  const [entries, plans, settings] = await Promise.all([
    stopOnFailure(readEntries(admin, userId, span, signal)),
    stopOnFailure(readPlanDays(admin, userId, span, signal)),
    stopOnFailure(targetSettings(admin, userId, through, signal)),
  ]);
  signal.throwIfAborted();
  let unchecked = false;
  // #21, the same judgement as one day's context: the recorded flag, else the recipe's revision.
  const judged = await judgePartialItems(admin, entries.flatMap((entry) => entry.log_items),
    { onError: "mark", userId, signal, onUnchecked: () => { unchecked = true; } });
  signal.throwIfAborted();
  const days = new Map<string, StoredDay>();
  const dayOf = (date: string) => {
    const known = days.get(date);
    if (known) return known;
    const fresh: StoredDay = { date };
    days.set(date, fresh);
    return fresh;
  };
  for (const plan of plans) {
    const date = String(plan.local_date).slice(0, 10);
    const parsed = planDayProjectionSchema.safeParse(Object.fromEntries(
      Object.entries(plan).filter(([key, value]) => key !== "local_date" && value !== null)));
    if (parsed.success) days.set(date, { ...dayOf(date), ...planDayFields(parsed.data) });
  }
  let index = 0;
  for (const entry of entries) {
    let partial = false;
    for (let i = 0; i < entry.log_items.length; i += 1, index += 1) if (judged[index]) partial = true;
    const day = dayOf(String(entry.local_date).slice(0, 10));
    day.extras = [...(day.extras ?? []), loggedFood(entry, partial)];
  }
  const wanted = "dates" in span ? new Set(span.dates) : null;
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).flatMap((day) => {
    if (wanted && !wanted.has(day.date)) return [];
    if (!wanted && "from" in span && (day.date < span.from || day.date > span.to)) return [];
    const intake = dayMacroIntake(day);
    if (!intake) return [];
    // A day still being eaten, or one whose recipe check could not run, is a floor.
    const inProgress = (day.date >= opts.today && !day.dayCompleteAt) || unchecked;
    const resolved = resolveTargets(targetDayType(day.date, day.dayTypeOverride, settings), settings, day.date);
    const target = resolved?.macros ?? null;
    const floor = (value: DayMacroIntake[keyof DayMacroIntake]) => ({ ...value, partial: value.partial || inProgress });
    return [{ date: day.date, target, kcal: floor(intake.kcal), protein: floor(intake.protein),
      carbs: floor(intake.carbs), fat: floor(intake.fat) }];
  });
}

/**
 * The latest `count` dates, within `lookback` days ending on `to`, that recorded something: a
 * logged energy row (`daily_energy`) or a ticked plan slot. The original `kcal_week` rule ("the
 * last seven logged days"), now bounded so an open-ended ask never scans the whole account.
 */
export async function recentRecordedDates(admin: SupabaseClient, userId: string,
  opts: { to: string; from: string; count: number; signal?: AbortSignal }): Promise<string[]> {
  const controller = linked(opts.signal);
  const signal = controller.signal;
  signal.throwIfAborted();
  const fail = (error: unknown): never => { controller.abort(error); throw error; };
  const [logged, plans] = await Promise.all([
    bound(admin.from("daily_energy").select("local_date").eq("user_id", userId)
      .gte("local_date", opts.from).lte("local_date", opts.to)
      .order("local_date", { ascending: false }).limit(opts.count), signal)
      .then(({ data, error }) => (error ? fail(error) : (data ?? []) as Row[]), fail),
    bound(admin.from("plan_days").select("local_date, eaten_slots").eq("user_id", userId)
      .gte("local_date", opts.from).lte("local_date", opts.to), signal)
      .then(({ data, error }) => (error ? fail(error) : (data ?? []) as Row[]), fail),
  ]);
  const dates = new Set<string>();
  for (const row of logged) if (typeof row.local_date === "string") dates.add(row.local_date.slice(0, 10));
  for (const row of plans) {
    if (eatenSlotIds(row.eaten_slots).length > 0 && typeof row.local_date === "string") {
      dates.add(row.local_date.slice(0, 10));
    }
  }
  return [...dates].sort().slice(-opts.count);
}
