import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import "./styles.css";

export const metadata: Metadata = {
  title: "PolicyDiff AI",
  description: "Compare policy editions and inspect the supporting clauses.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={GeistSans.variable}><body>{children}</body></html>;
}
