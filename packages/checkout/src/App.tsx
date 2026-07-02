import { Router, Route } from "@solidjs/router";
import { Confirm } from "./pages/Confirm";
import { SecureCheckout } from "./pages/SecureCheckout";
import { PortalPage } from "./pages/Portal";
import { I18nProvider } from "./locales/i18n";

/** True when the checkout SPA is running inside an embed iframe. */
export const isEmbedded: boolean = (() => {
    try { return window.self !== window.top; } catch { return true; }
})();

export default function App() {
    return (
        <I18nProvider>
            <Router>
                <Route path="/portal/:token" component={PortalPage} />
                <Route path="/pay/s/:token" component={SecureCheckout} />
                <Route path="/pay/confirm/:invoiceId" component={Confirm} />
            </Router>
        </I18nProvider>
    );
}

