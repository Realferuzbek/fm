import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { assetUrl, INVITATION_CONFIG } from "@/config/invitation";
import "./globals.css";

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap"
});

const body = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN || "http://localhost:3000"),
  title: "A tiny question for you",
  description: "A small, very intentional invitation.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "A tiny question for you ♡",
    description: "A little courage. A lot of hope. And one very convincing pug.",
    images: [{ url: assetUrl(INVITATION_CONFIG.assetPaths.petImage), alt: INVITATION_CONFIG.petImageAlt }],
  },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  formatDetection: { telephone: false, email: false, address: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
