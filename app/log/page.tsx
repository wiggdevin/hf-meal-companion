import { redirect } from "next/navigation";
import { logRedirectPath } from "@/lib/log/log-intent";

/** `/log?mode=voice|photo|label|barcode|text&slot=…`: the fast-log deep link. The middleware
 *  guards it like any page (signed out → sign-in with `next`); here it only forwards to Today. */
export default async function LogPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
): Promise<never> {
  redirect(logRedirectPath(await searchParams));
}
