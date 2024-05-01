import type { Metadata, Viewport } from "next";
import "./globals.css";

const UBIQUITY_REWARDS = "Ubiquity Rewards";

export const metadata: Metadata = {
  title: "Ubiquity Rewards | Ubiquity DAO",
  description: UBIQUITY_REWARDS,
  robots: "index,follow",
  twitter: {
    card: "summary_large_image",
    creator: "@UbiquityDAO",
    description: UBIQUITY_REWARDS,
    title: UBIQUITY_REWARDS,
  },
  openGraph: {
    description: UBIQUITY_REWARDS,
    siteName: UBIQUITY_REWARDS,
    title: UBIQUITY_REWARDS,
    type: "website",
    url: "https://dao.ubq.fi",
  },
};

export const viewport: Viewport = {
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
