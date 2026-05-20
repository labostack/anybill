import { createSignal, createContext, useContext, JSX, createMemo } from "solid-js";
import * as i18n from "@solid-primitives/i18n";
import en from "./en.json";
import ru from "./ru.json";

export type Locale = "en" | "ru";

export const DICTIONARIES: Record<Locale, any> = {
    en,
    ru,
};

export const SUPPORTED_LOCALES: { code: Locale; label: string }[] = [
    { code: "en", label: "EN" },
    { code: "ru", label: "RU" },
];

interface I18nContextType {
    locale: () => Locale;
    setLocale: (l: Locale) => void;
    t: (path: string, args?: Record<string, string | number>) => string;
    formatPrice: (amount: number, currency: string) => string;
    formatDate: (dateStr: string | null) => string;
    intervalLabel: (interval: string, count: number) => string;
}

const I18nContext = createContext<I18nContextType>();

export function I18nProvider(props: { children: JSX.Element }) {
    // 1. Detect language
    const supportedCodes = SUPPORTED_LOCALES.map(l => l.code);
    const defaultLocale = supportedCodes[0] || "en";

    const urlParams = new URLSearchParams(window.location.search);
    const queryLang = urlParams.get("lng") || urlParams.get("lang") || urlParams.get("locale");
    
    let detectedLocale: Locale = defaultLocale;

    if (queryLang && supportedCodes.includes(queryLang as Locale)) {
        detectedLocale = queryLang as Locale;
        localStorage.setItem("anybill_lang", queryLang);
    } else {
        const saved = localStorage.getItem("anybill_lang");
        if (saved && supportedCodes.includes(saved as Locale)) {
            detectedLocale = saved as Locale;
        } else {
            const browserLocales = navigator.languages
                ? navigator.languages.map(l => l.toLowerCase())
                : [navigator.language.toLowerCase()];
            
            const matched = browserLocales
                .map(bl => supportedCodes.find(sc => bl.startsWith(sc)))
                .find(Boolean);
            
            if (matched) {
                detectedLocale = matched;
            }
        }
    }

    const [locale, setLocaleState] = createSignal<Locale>(detectedLocale);

    const setLocale = (l: Locale) => {
        setLocaleState(l);
        localStorage.setItem("anybill_lang", l);
    };

    // 2. Setup reactive primitives dictionary
    const dict = createMemo(() => {
        const rawDict = DICTIONARIES[locale()] || en;
        return i18n.flatten(rawDict);
    });

    const translator = i18n.translator(dict, i18n.resolveTemplate) as any;

    // Dynamic t method supporting string interpolation and path safety
    const t = (path: string, args?: Record<string, string | number>): string => {
        const val = translator(path, args);
        return val !== undefined ? String(val) : path;
    };

    const formatPrice = (amount: number, currency: string) => {
        const currentLocale = t("common.localeTag");
        const resolvedTag = currentLocale && currentLocale !== "common.localeTag" ? currentLocale : locale();
        return new Intl.NumberFormat(resolvedTag, { style: "currency", currency }).format(amount / 100);
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "—";
        const currentLocale = t("common.localeTag");
        const resolvedTag = currentLocale && currentLocale !== "common.localeTag" ? currentLocale : locale();
        return new Date(dateStr).toLocaleDateString(resolvedTag, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    };

    const intervalLabel = (interval: string, count: number) => {
        if (interval === "one_time") {
            return t("checkout.oneTimePayment");
        }

        if (count === 1) {
            return t(`intervals.${interval}_single`);
        }

        const resolvedTag = t("common.localeTag");
        const pluralLocale = resolvedTag && resolvedTag !== "common.localeTag" ? resolvedTag : locale();
        const pluralRules = new Intl.PluralRules(pluralLocale);
        const pluralForm = pluralRules.select(count); // 'one', 'few', 'many', 'other'

        return t(`intervals.${interval}_${pluralForm}`, { count: String(count) });
    };

    return (
        <I18nContext.Provider value={{ locale, setLocale, t, formatPrice, formatDate, intervalLabel }}>
            {props.children}
        </I18nContext.Provider>
    );
}

export function useI18n() {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error("useI18n must be used within an I18nProvider");
    }
    return context;
}
