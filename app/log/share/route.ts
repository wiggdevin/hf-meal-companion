/** The share target when no service worker took the POST (first launch, or the worker not yet
 *  active): the image cannot be kept here, so the user lands on the photo capture to take or pick it. */
export function POST(request: Request): Response {
  return Response.redirect(new URL("/?log=photo", request.url), 303);
}
