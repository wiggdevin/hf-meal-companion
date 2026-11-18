import { GROUNDS, LEGACY_GROUNDS } from "./grounds";

/** Device-level copy of the last ground painted, read before first paint (not account data). */
export const GROUND_DEVICE_KEY = "smc:device:ground";

/**
 * An inline script for the top of <body>: paints the last ground on this phone before the first
 * frame, so a Black user does not see White flash while the account binds (a stored legacy id maps to its ground). The account's
 * own choice (components/GroundTheme.tsx) still wins once it is known.
 */
export const GROUND_BOOT_SCRIPT = `(function(){try{var c=${JSON.stringify(
  Object.fromEntries(GROUNDS.map((g) => [g.id, g.base])),
)};var a=${JSON.stringify(LEGACY_GROUNDS)};var g=localStorage.getItem(${JSON.stringify(GROUND_DEVICE_KEY)});g=a[g]||g;if(g&&c[g]){document.documentElement.dataset.ground=g;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c[g]);}}catch(e){}})();`;
