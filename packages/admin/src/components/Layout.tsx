import { A, useLocation } from "@solidjs/router";
import { For, type ParentProps } from "solid-js";
import { api } from "../api/client";
import {
    LayoutDashboard,
    Package,
    Users,
    DollarSign,
    Settings,
    LogOut,
    Layers,
    KeyRound,
    Webhook,
    Code,
    Link,
} from "lucide-solid";

const links = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { path: "/subscriptions", label: "Plans", icon: Package },
    { path: "/subscribers", label: "Subscribers", icon: Users },
    { path: "/invoices", label: "Invoices", icon: DollarSign },
];

export function Layout(props: ParentProps) {
    const loc = useLocation();

    const base = import.meta.env.BASE_URL.replace(/\/+$/, "");

    const isActive = (path: string, exact?: boolean) => {
        const current = loc.pathname.startsWith(base)
            ? loc.pathname.slice(base.length) || "/"
            : loc.pathname;
        if (exact) return current === path;
        return current.startsWith(path);
    };

    const logout = async () => {
        try { await api.post("/auth/logout"); } catch { /* ignore */ }
        location.reload();
    };

    return (
        <div class="app-shell">
            {/* Icon Rail Sidebar */}
            <aside class="sidebar-rail">
                <div class="sidebar-logo">
                    <Layers size={28} color="var(--accent)" />
                </div>
                <div class="sidebar-divider" />

                <nav class="sidebar-nav">
                    <For each={links}>{(l) => (
                        <A
                            href={l.path}
                            class={`nav-item ${isActive(l.path, l.exact) ? "active" : ""}`}
                            end={l.exact}
                            activeClass=""
                            inactiveClass=""
                        >
                            <l.icon size={20} />
                            <span class="tooltip">{l.label}</span>
                        </A>
                    )}</For>
                </nav>

                <div class="sidebar-bottom">
                    <A
                        href="/links"
                        class={`nav-item ${isActive("/links") ? "active" : ""}`}
                    >
                        <Link size={20} />
                        <span class="tooltip">Links</span>
                    </A>

                    <A
                        href="/keys"
                        class={`nav-item ${isActive("/keys") ? "active" : ""}`}
                    >
                        <KeyRound size={20} />
                        <span class="tooltip">API Keys</span>
                    </A>

                    <A
                        href="/webhooks"
                        class={`nav-item ${isActive("/webhooks") ? "active" : ""}`}
                    >
                        <Webhook size={20} />
                        <span class="tooltip">Webhooks</span>
                    </A>

                    <A
                        href="/embed"
                        class={`nav-item ${isActive("/embed") ? "active" : ""}`}
                    >
                        <Code size={20} />
                        <span class="tooltip">Embed</span>
                    </A>

                    <A
                        href="/settings"
                        class={`nav-item ${isActive("/settings") ? "active" : ""}`}
                    >
                        <Settings size={20} />
                        <span class="tooltip">Settings</span>
                    </A>

                    <button
                        class="nav-item danger"
                        onClick={logout}
                    >
                        <LogOut size={20} />
                        <span class="tooltip">Logout</span>
                    </button>
                </div>
            </aside>

            {/* Content Panel */}
            <div class="content-area">
                <div class="content-panel">
                    <div class="content-scroll">
                        <div class="content-inner">
                            {props.children}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
