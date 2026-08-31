import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
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
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
