import { Router, Route } from "@solidjs/router";
import { Checkout } from "./pages/Checkout";
import { Confirm } from "./pages/Confirm";

export default function App() {
    return (
        <Router>
            <Route path="/pay/checkout" component={Checkout} />
            <Route path="/pay/confirm/:invoiceId" component={Confirm} />
        </Router>
    );
}
