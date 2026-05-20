import { Router, Route } from "@solidjs/router";
import { Confirm } from "./pages/Confirm";
import { SecureCheckout } from "./pages/SecureCheckout";
import { PortalPage } from "./pages/Portal";

export default function App() {
    return (
        <Router>
            <Route path="/portal/:token" component={PortalPage} />
            <Route path="/pay/s/:token" component={SecureCheckout} />
            <Route path="/pay/confirm/:invoiceId" component={Confirm} />
        </Router>
    );
}
