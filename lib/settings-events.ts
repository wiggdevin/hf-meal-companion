/**
 * "Settings changed on this device": fired after the coach changes a setting that a screen reads
 * once (today the weight unit of the weigh-in field), and again after its Undo. Display only: it
 * carries no data, so a listener re-reads the store.
 */
export const SETTINGS_CHANGED_EVENT = "meal-companion:settings-changed";

export function announceSettingsChanged(): void {
  globalThis.dispatchEvent?.(new Event(SETTINGS_CHANGED_EVENT));
}
