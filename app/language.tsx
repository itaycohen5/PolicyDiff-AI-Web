"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type Locale } from "@/lib/translations";

type Language = { locale: Locale; t: (key: string, values?: Record<string, string | number>) => string; setLocale: (locale: Locale) => void };
const LanguageContext = createContext<Language>({ locale: "en", t: (key, values) => translate("en", key, values), setLocale: () => {} });

export function LanguageProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, updateLocale] = useState(initialLocale);
  const setLocale = useCallback((value: Locale) => {
    updateLocale(value);
    document.cookie = `policydiff_language=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: (key: string, values?: Record<string, string | number>) => translate(locale, key, values) }), [locale, setLocale]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);

export function LanguageSwitch() {
  const { locale, setLocale, t } = useLanguage();
  return <div className="language-switch" role="group" aria-label={t("Interface language")} dir="ltr">
    <button type="button" lang="en" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>English</button>
    <button type="button" lang="he" aria-pressed={locale === "he"} onClick={() => setLocale("he")}>עברית</button>
  </div>;
}
