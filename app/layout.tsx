import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { cookies } from "next/headers";
import { LanguageProvider } from "./language";
import "./styles.css";

export const metadata: Metadata = {
  title: "PolicyDiff AI",
  description: "Compare policy editions and inspect the supporting clauses.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = (await cookies()).get("policydiff_language")?.value === "he" ? "he" : "en";
  return <html lang={locale} dir={locale === "he" ? "rtl" : "ltr"} className={GeistSans.variable}>
    <body><LanguageProvider initialLocale={locale}>{children}</LanguageProvider></body></html>;
}
