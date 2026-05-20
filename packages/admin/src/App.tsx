import { Router, Route } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Setup } from "./pages/Setup";
import { Dashboard } from "./pages/Dashboard";
import { Subscriptions } from "./pages/Subscriptions";
import { Subscribers } from "./pages/Subscribers";
import { Invoices } from "./pages/Invoices";
import { Settings } from "./pages/Settings";
import { ApiKeys } from "./pages/ApiKeys";
import { Webhooks } from "./pages/Webhooks";
import { Embed } from "./pages/Embed";
import { api } from "./api/client";

export default function App() {
    const [ready, setReady] = createSignal(false);
    const [initialized, setInitialized] = createSignal(true);
    const [authenticated, setAuthenticated] = createSignal(false);

    onMount(async () => {
        try {
            const status = await api.get<{ initialized: boolean; authenticated: boolean }>("/auth/status");
            setInitialized(status.initialized);
            setAuthenticated(status.authenticated);
        } catch { /* ignore */ }
        setReady(true);
    });

    return (
        <Show when={ready()}>
            <Router base={import.meta.env.BASE_URL.replace(/\/+$/, "")}>
                <Show when={!initialized()}>
                    <Route path="*" component={Setup} />
                </Show>
                <Show when={initialized()}>
                    <Show when={authenticated()} fallback={
                        <Route path="*" component={Login} />
                    }>
                        <Route path="/" component={Layout}>
                            <Route path="/" component={Dashboard} />
                            <Route path="/subscriptions" component={Subscriptions} />
                            <Route path="/subscribers" component={Subscribers} />
                            <Route path="/invoices" component={Invoices} />
                            <Route path="/keys" component={ApiKeys} />
                            <Route path="/webhooks" component={Webhooks} />
                            <Route path="/embed" component={Embed} />
                            <Route path="/settings" component={Settings} />
                        </Route>
                    </Show>
                </Show>
            </Router>
        </Show>
    );
}

