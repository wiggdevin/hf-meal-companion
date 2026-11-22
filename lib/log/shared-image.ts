/**
 * Fast logging (2026-11-21): the image the share sheet sent (manifest `share_target`).
 *
 * public/sw.js receives the POST, keeps the first image in its own cache under SHARED_IMAGE_KEY,
 * and sends the window to `/?log=photo&shared=1`. Today takes it here once and deletes it. The
 * names are repeated in sw.js (plain script, no imports); tests/sw/sw-share-target.test.ts
 * checks the two agree.
 */
export const SHARE_CACHE = "hf-share";
export const SHARED_IMAGE_KEY = "/log/shared-image";

/** The shared image as a File, removed from the cache. Null when there is none or no cache API. */
export async function takeSharedImage(): Promise<File | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const response = await cache.match(SHARED_IMAGE_KEY);
    if (!response) return null;
    await cache.delete(SHARED_IMAGE_KEY);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    return new File([blob], "shared-photo", { type: blob.type });
  } catch {
    return null;
  }
}
