"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import TabBar from "@/components/TabBar";
import { noteScreen } from "@/lib/feedback-client";

const PRIMARY_ROUTES = ["/body", "/foods", "/coach", "/settings", "/week"] as const;

export function isPrimaryRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return PRIMARY_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export default function AppChrome() {
  const pathname = usePathname();
  // The screen "Send feedback" can name (Settings → Data & account): memory only, this page load.
  useEffect(() => { noteScreen(pathname); }, [pathname]);
  if (!isPrimaryRoute(pathname)) return null;

  return <TabBar />;
}
