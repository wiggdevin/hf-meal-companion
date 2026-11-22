"use client";

/**
 * Onboarding v2 question set §1c/§4: the safety round. Always asked, tap-only, before the pace
 * screen and before any food UI. Its answers never reach a model. "No, none of these" is the
 * largest control and finishes the round in one tap. Each other chip opens its follow-up below it:
 *
 * - Food allergy → the existing rule editor (`DietaryProfilePicker`), with the cross-contact line.
 * - Pregnant or breastfeeding (shown to every adult) → Pregnant · Breastfeeding · Trying to get
 *   pregnant. Pregnant and breastfeeding hold the pace (`safetyConditionEntries` writes them to
 *   `conditions` before the target; "Pregnant" arms the tuna check).
 * - Medicine that affects food → the kind, in plain names; its food rules through the same editor.
 *   The app does not change doses or timing.
 * - A health condition → optional free text, saved to `conditions`, never sent to a model.
 * - A diet a clinician set for me → the editor or Later; holds the pace.
 *
 * When the editor was opened, Continue hands back `rulesEdited: true` so the shell re-reads the
 * account's rules before any food UI (ONB2-RULE-REREAD).
 */
import { useEffect, useId, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Reveal from "@/components/Onboarding/beats/Reveal";
import ChoiceChips from "@/components/Onboarding/beats/ChoiceChips";
import { BeatNote, BeatQuestion } from "@/components/Onboarding/beats/BeatQuestion";
import DietaryProfilePicker from "@/components/Onboarding/DietaryProfilePicker";
import { FIELD_CLASS } from "@/components/Onboarding/facts/FactQuestion";
import { APP_NAME } from "@/lib/brand";
import { currentAccountOrNull } from "@/lib/device/account";
import {
  confirmProfileInstance, fetchProfileInstances, removeProfileInstance,
} from "@/lib/profile/instances-client";
import { profileSummary } from "@/lib/policy/profiles/catalog-summary";
import { CLINICIAN_ADVICE_FIRST_NOTE } from "@/lib/policy/profiles/condition-packs";
import {
  type MedicineKind, type PregnancyAnswer, type SafetyPick, type SafetyRound as SafetyRoundAnswer,
} from "@/components/Onboarding/v2/plan-answers";

const PICKS: { value: SafetyPick; label: string }[] = [
  { value: "allergy", label: "Food allergy" },
  { value: "pregnancy", label: "Pregnant or breastfeeding" },
  { value: "medicine", label: "Medicine that affects food" },
  { value: "condition", label: "A health condition" },
  { value: "clinician_diet", label: "A diet a clinician set for me" },
];
const PREGNANCY: { value: PregnancyAnswer; label: string }[] = [
  { value: "pregnant", label: "Pregnant" },
  { value: "breastfeeding", label: "Breastfeeding" },
  { value: "trying_to_conceive", label: "Trying to get pregnant" },
];
const MEDICINES: { value: MedicineKind; label: string }[] = [
  { value: "glp1", label: "GLP-1 (like Ozempic, Wegovy, Mounjaro, Zepbound)" },
  { value: "warfarin", label: "Warfarin" },
  { value: "maoi", label: "An MAOI" },
  { value: "thyroid", label: "Thyroid medicine (levothyroxine)" },
  { value: "insulin", label: "Insulin or a sulfonylurea" },
  { value: "other", label: "Something else" },
];
const CONDITION_MAX = 64;

/**
 * The common food allergens as one-tap chips (W062 WARN 1): each writes the same confirmed
 * catalog allergy the rule editor's "Add to my profile" does. "Something else" opens the editor
 * for any other allergy; "None of these" says no allergen applies. Continue waits for one of them.
 */
export const ALLERGEN_CHIPS = [
  { value: "peanut", label: "Peanut", profileIds: ["allergy_peanut"] },
  { value: "tree-nut", label: "Tree nuts", profileIds: ["allergy_tree_nut"] },
  { value: "milk", label: "Milk", profileIds: ["allergy_milk"] },
  { value: "egg", label: "Egg", profileIds: ["allergy_egg"] },
  { value: "wheat", label: "Wheat", profileIds: ["allergy_wheat"] },
  { value: "soy", label: "Soy", profileIds: ["allergy_soy"] },
  { value: "fish", label: "Fish", profileIds: ["allergy_fish"] },
  { value: "shellfish", label: "Shellfish", profileIds: ["allergy_crustacean", "allergy_mollusc"] },
  { value: "sesame", label: "Sesame", profileIds: ["allergy_sesame"] },
] as const;
type AllergenKey = (typeof ALLERGEN_CHIPS)[number]["value"] | "other";
const ALLERGEN_OPTIONS: { value: AllergenKey | "none"; label: string }[] = [
  ...ALLERGEN_CHIPS.map(({ value, label }) => ({ value, label })),
  { value: "other", label: "Something else" },
  { value: "none", label: "None of these" },
];
const ALLERGEN_SAVE_ERROR = "Couldn’t save that allergy. Check your connection and try again.";

export type SafetyRoundResult = SafetyRoundAnswer & { rulesEdited: boolean };

function RuleEditorToggle({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return <Button variant="secondary" size="md" className="self-start" aria-expanded={open} onClick={onToggle}>
    {label}
  </Button>;
}

export default function SafetyRound({ initial, note, onDone, busy = false }: {
  initial: SafetyRoundAnswer | null;
  /** A line above the question, e.g. when a typed health detail opened this card early. */
  note?: string | null;
  onDone: (result: SafetyRoundResult) => void;
  /** True while the shell re-reads the account's rules after Continue. */
  busy?: boolean;
}) {
  const [picks, setPicks] = useState<SafetyPick[]>(initial?.picks ?? []);
  const [pregnancy, setPregnancy] = useState<PregnancyAnswer | null>(initial?.pregnancy ?? null);
  const [medicines, setMedicines] = useState<MedicineKind[]>(initial?.medicines ?? []);
  const [conditionText, setConditionText] = useState(initial?.conditionText ?? "");
  const [editorOpen, setEditorOpen] = useState(false);
  const [edited, setEdited] = useState(false);
  const conditionId = useId();
  const [allergens, setAllergens] = useState<AllergenKey[]>([]);
  const [noAllergen, setNoAllergen] = useState(false);
  const [allergenWrites, setAllergenWrites] = useState(0);
  const [allergenError, setAllergenError] = useState<string | null>(null);
  const touchedAllergens = useRef(false);

  // Chips for the allergies this account already has (a returning or back-navigated visit).
  useEffect(() => {
    const h = currentAccountOrNull();
    if (!h) return;
    let live = true;
    fetchProfileInstances(h).then(({ instances }) => {
      if (!live || touchedAllergens.current) return;
      const held = new Set(instances.filter((i) => i.rules.some((r) => r.confirmation === "confirmed"))
        .map((i) => i.profileId));
      const on = ALLERGEN_CHIPS.filter((chip) => chip.profileIds.every((id) => held.has(id)))
        .map((chip) => chip.value);
      if (on.length > 0) setAllergens(on);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  async function writeAllergen(key: AllergenKey, on: boolean): Promise<void> {
    const chip = ALLERGEN_CHIPS.find((item) => item.value === key);
    if (!chip) return;
    const h = currentAccountOrNull();
    setAllergenWrites((count) => count + 1);
    setEdited(true);
    try {
      if (!h) throw new Error("no account");
      for (const id of chip.profileIds) {
        if (on) {
          const items = profileSummary(id)?.items ?? [];
          if (items.length === 0) throw new Error("unknown profile");
          await confirmProfileInstance(h, id, items.map((item) => ({ facet: item.facet, confirmed: true })));
        } else {
          await removeProfileInstance(h, id);
        }
      }
    } catch {
      // The chip goes back to what is actually saved, and the line says so.
      setAllergens((current) => on ? current.filter((k) => k !== key) : [...current, key]);
      setAllergenError(ALLERGEN_SAVE_ERROR);
    } finally {
      setAllergenWrites((count) => count - 1);
    }
  }
  function clearAllergens() {
    for (const key of allergens) if (key !== "other") void writeAllergen(key, false);
    setAllergens([]);
    setNoAllergen(false);
  }
  function toggleAllergen(value: AllergenKey | "none") {
    touchedAllergens.current = true;
    setAllergenError(null);
    if (value === "none") {
      if (noAllergen) { setNoAllergen(false); return; }
      for (const key of allergens) if (key !== "other") void writeAllergen(key, false);
      setAllergens([]);
      setNoAllergen(true);
      return;
    }
    setNoAllergen(false);
    const on = !allergens.includes(value);
    setAllergens((current) => on ? [...current, value] : current.filter((k) => k !== value));
    if (value === "other") {
      if (on) { setEditorOpen(true); setEdited(true); }
      return;
    }
    void writeAllergen(value, on);
  }

  const has = (pick: SafetyPick) => picks.includes(pick);
  function togglePick(pick: SafetyPick) {
    // Un-ticking "Food allergy" takes back the allergies this step saved.
    if (pick === "allergy" && picks.includes("allergy")) clearAllergens();
    setPicks((current) => current.includes(pick) ? current.filter((p) => p !== pick) : [...current, pick]);
  }
  function toggleMedicine(kind: MedicineKind) {
    setMedicines((current) => current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]);
  }
  function toggleEditor() {
    setEditorOpen((open) => !open);
    setEdited(true);
  }
  const ready = picks.length > 0
    && (!has("allergy") || (allergenWrites === 0 && (allergens.length > 0 || noAllergen)))
    && (!has("pregnancy") || pregnancy !== null)
    && (!has("medicine") || medicines.length > 0);

  function finish() {
    if (!ready || busy) return;
    onDone({
      picks, pregnancy: has("pregnancy") ? pregnancy : null,
      medicines: has("medicine") ? medicines : [],
      conditionText: has("condition") ? conditionText.trim().slice(0, CONDITION_MAX) : "",
      rulesEdited: edited,
    });
  }
  const showsEditor = has("allergy") || has("medicine") || has("clinician_diet");

  return <div className="flex w-full flex-col gap-4" data-testid="safety-round">
    {note && <BeatNote live>{note}</BeatNote>}
    <BeatQuestion>Before we pick foods: does anything here apply to you?</BeatQuestion>
    {/* One primary at a time: once a chip is picked, Continue is the primary and this steps back. */}
    <Button size="lg" block variant={picks.length > 0 ? "secondary" : "primary"} disabled={busy}
      onClick={() => onDone({ picks: [], pregnancy: null, medicines: [], conditionText: "", rulesEdited: false })}>
      No, none of these
    </Button>
    <p className="m-0 pt-2 text-caption text-graphite">Or tap any that apply</p>
    <ChoiceChips label="Applies to me" multiple block options={PICKS} value={picks} onChange={togglePick} />

    <Reveal id="safety-allergy" open={has("allergy")}>
      <div className="-mx-1 flex flex-col gap-2 px-1 py-1">
        <BeatQuestion>Which allergies? We&rsquo;ll keep these out of every plan.</BeatQuestion>
        <div data-testid="allergen-chips">
          <ChoiceChips label="Allergies" multiple options={ALLERGEN_OPTIONS}
            value={noAllergen ? ["none"] : allergens} onChange={toggleAllergen} />
        </div>
        {allergenError && <p role="alert" className="m-0 text-caption text-alert">{allergenError}</p>}
        {!noAllergen && allergens.length === 0 && <BeatNote>Pick at least one, or None of these, to continue.</BeatNote>}
        <BeatNote>Always check labels yourself. {APP_NAME} can&rsquo;t see cross-contact.</BeatNote>
      </div>
    </Reveal>
    <Reveal id="safety-pregnancy" open={has("pregnancy")}>
      <div className="-mx-1 flex flex-col gap-2 px-1 py-1">
        <BeatQuestion>Which one?</BeatQuestion>
        <ChoiceChips label="Pregnancy" options={PREGNANCY} value={pregnancy} onChange={setPregnancy} />
        <BeatNote>{CLINICIAN_ADVICE_FIRST_NOTE}</BeatNote>
      </div>
    </Reveal>
    <Reveal id="safety-medicine" open={has("medicine")}>
      <div className="-mx-1 flex flex-col gap-2 px-1 py-1">
        <BeatQuestion>Which kind of medicine?</BeatQuestion>
        <ChoiceChips label="Medicine" multiple block options={MEDICINES} value={medicines} onChange={toggleMedicine} />
        <BeatNote>{APP_NAME} does not change doses or timing. {CLINICIAN_ADVICE_FIRST_NOTE}</BeatNote>
      </div>
    </Reveal>
    <Reveal id="safety-condition" open={has("condition")}>
      <div className="-mx-1 flex flex-col gap-2 px-1 py-1">
        <label htmlFor={conditionId} className="font-display text-[28px] leading-[1.1] tracking-display-md text-charcoal">
          Thanks. Want to name it? This is optional.
        </label>
        <input id={conditionId} type="text" maxLength={CONDITION_MAX} value={conditionText}
          onChange={(event) => setConditionText(event.target.value)} className={FIELD_CLASS}
          autoComplete="off" />
        <BeatNote>
          {APP_NAME} doesn&rsquo;t change your plan for health conditions yet. {CLINICIAN_ADVICE_FIRST_NOTE} You
          can add food rules any time in Foods › Avoids.
        </BeatNote>
      </div>
    </Reveal>
    <Reveal id="safety-clinician" open={has("clinician_diet")}>
      <div className="-mx-1 flex flex-col gap-2 px-1 py-1">
        <BeatQuestion>Got it. Want to add the foods it rules out?</BeatQuestion>
        <BeatNote>Your clinician guides calorie changes. {APP_NAME} will plan meals that fit your rules.</BeatNote>
      </div>
    </Reveal>

    {showsEditor && <div className="flex flex-col gap-2">
      <RuleEditorToggle open={editorOpen} onToggle={toggleEditor}
        label={editorOpen ? "Close the rule editor" : "Add food rules"} />
      {/* The picker is a light-surface form; inside `.matte` it needs `.matte-reset`. */}
      <Reveal id="safety-editor" open={editorOpen}>
        <div className="matte-reset surface flex-col p-4"><DietaryProfilePicker /></div>
      </Reveal>
    </div>}

    {picks.length > 0 && <Button variant="primary" size="lg" block disabled={!ready || busy}
      onClick={finish}>{busy ? "Checking your rules…" : "Continue"}</Button>}
  </div>;
}
