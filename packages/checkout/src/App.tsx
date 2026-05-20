import { For, Show } from "solid-js";
import { Router, Route } from "@solidjs/router";
import { Confirm } from "./pages/Confirm";
import { SecureCheckout } from "./pages/SecureCheckout";
import { PortalPage } from "./pages/Portal";
import { ChevronDown } from "lucide-solid";
import { I18nProvider, useI18n, SUPPORTED_LOCALES, Locale } from "./locales/i18n";

function LanguageSwitcher() {
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

export default function App() {
    return (
        <I18nProvider>
            <>
                <LanguageSwitcher />
                <Router>
                    <Route path="/portal/:token" component={PortalPage} />
                    <Route path="/pay/s/:token" component={SecureCheckout} />
                    <Route path="/pay/confirm/:invoiceId" component={Confirm} />
                </Router>
            </>
        </I18nProvider>
    );
}

