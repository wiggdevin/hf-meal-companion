import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import AppChrome from "@/components/AppChrome";
import { CapabilitiesProvider } from "@/components/CapabilitiesProvider";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import ClientErrorHook from "@/components/ClientErrorHook";
import ZodJitless from "@/components/ZodJitless";
import InstallPromptCapture from "@/components/InstallPromptCapture";
import SyncBootstrap from "@/components/SyncBootstrap";
import AuthGate from "@/components/AuthGate";
import DevFreshnessBanner from "@/components/DevFreshnessBanner";
import { NONCE_HEADER } from "@/lib/security-headers";
import { GROUND_BOOT_SCRIPT } from "@/lib/design/ground-boot";
import GroundTheme from "@/components/GroundTheme";
import { THEME_COLOR } from "@/lib/design/theme-color";
import { readAppCapabilities } from "@/lib/capabilities";
import SectionHue from "@/components/SectionHue";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

// High Frequency type (DESIGN.md §Typography, 2026-11-18): Archivo (weight 600, tight tracking) for
// headings and every numeral, Inter for body and labels, Instrument Serif italic as a rare accent.
// next/font/local self-hosts the three files in app/fonts, so the browser never calls Google and a
// build needs no network. Archivo and Inter are variable fonts (one file, every weight).
const display = localFont({
  src: "./fonts/Archivo-Variable.ttf",
  weight: "100 900",
  variable: "--font-display-face",
  display: "swap",
});
const sans = localFont({
  src: "./fonts/Inter-Variable.ttf",
  weight: "100 900",
  variable: "--font-text-face",
  display: "swap",
});
const accent = localFont({
  src: "./fonts/InstrumentSerif-Italic.ttf",
  weight: "400",
  style: "italic",
  variable: "--font-accent-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Reading the request makes every page render per request (W079): Next stamps its own scripts
  // with the request's CSP nonce (middleware.ts) only while rendering, so a page prerendered at
  // build time would carry none. The one inline script of our own takes the same nonce.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  const capabilities = readAppCapabilities(process.env);

  return (
    // `data-card-step` turns on the contrast step for legacy nested cards (app/globals.css, DESIGN.md
    // §Elevation): a `.surface` inside a `.surface` takes the inset face. Remove it to revert them all.
    <html lang="en" suppressHydrationWarning data-card-step="" className={`${display.variable} ${sans.variable} ${accent.variable}`}>
      <body className="bg-paper text-charcoal antialiased">
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: GROUND_BOOT_SCRIPT }} />
        <ZodJitless />
        <ClientErrorHook />
        <DevFreshnessBanner />
        <CapabilitiesProvider value={capabilities}>
          {/* The Harvest ground (DESIGN.md §Techniques): still, pure CSS, oat with a matte grain. */}
          <div className="harvest-ground" aria-hidden="true" />
          <SectionHue />
          <GroundTheme />
          <ServiceWorkerRegistrar />
          <SyncBootstrap />
          {/* The visible install card is inline on the Today page (owner feedback, 2026-10-08: it
              must never float over a meal card's actions). Only the silent capture — attaching
              `beforeinstallprompt` before it can be missed — lives at the root. */}
          <InstallPromptCapture />
          <AuthGate>
            {children}
            <AppChrome />
          </AuthGate>
        </CapabilitiesProvider>
      </body>
    </html>
  );
}
