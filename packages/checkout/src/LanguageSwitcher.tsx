import { For } from "solid-js";
import { ChevronDown } from "lucide-solid";
import { useI18n, SUPPORTED_LOCALES, Locale } from "./locales/i18n";

export function LanguageSwitcher() {
    const { locale, setLocale } = useI18n();
    return (
        <div class="lang-switcher">
            <select
                class="lang-select"
                value={locale()}
                onChange={(e) => setLocale(e.target.value as Locale)}
            >
                <For each={SUPPORTED_LOCALES}>
                    {(loc) => (
                        <option value={loc.code}>{loc.label}</option>
                    )}
                </For>
            </select>
            <div class="lang-switcher-arrow">
                <ChevronDown size={14} strokeWidth={2} />
            </div>
        </div>
    );
}
