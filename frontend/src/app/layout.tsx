import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "react-loading-skeleton/dist/skeleton.css";
import { SkeletonTheme } from "react-loading-skeleton";
import { AppProvider } from "@/context/AppContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TASKEZY Enterprise Platform - Unified SaaS for Real Estate",
  description:
    "TASKEZY is the central business operations platform for Indian Real Estate brokerages & developers, unifying CRM pipelines, geofenced HRMS, and automated GST finance ledgers under a secure multi-tenant architecture.",
  icons: {
    icon: "/favicon.png"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}>
        {/* App-wide skeleton colors, matched to the slate palette every
            card/table already uses, so a loading placeholder never looks
            like a different design language from the real content it's
            standing in for. */}
        <SkeletonTheme baseColor="#e2e8f0" highlightColor="#f1f5f9" borderRadius={8}>
          <AppProvider>{children}</AppProvider>
        </SkeletonTheme>
      </body>
    </html>
  );
}
