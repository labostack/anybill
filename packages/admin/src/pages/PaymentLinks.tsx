/** Links — generate secure checkout and portal links for customers. */
import { createSignal, onMount, For, Show } from "solid-js";
import { api } from "../api/client";
import { Link, Copy, Check, Clock, ExternalLink, CreditCard, UserCircle } from "lucide-solid";

type LinkType = "checkout" | "portal";

interface Subscription {
    id: string;
    name: string;
    amount: number;
    currency: string;
    interval: string;
    intervalCount: number;
}

interface GeneratedLink {
    type: LinkType;
    url: string;
    expiresAt: string;
    label: string;
    uid: string;
}

export function PaymentLinks() {
    const [activeTab, setActiveTab] = createSignal<LinkType>("checkout");
    const [subs, setSubs] = createSignal<Subscription[]>([]);

    // Checkout form
    const [subId, setSubId] = createSignal("");
    const [checkoutUid, setCheckoutUid] = createSignal("");

    // Portal form
    const [portalUid, setPortalUid] = createSignal("");

    // Shared
    const [ttlMinutes, setTtlMinutes] = createSignal(30);
    const [loading, setLoading] = createSignal(false);
    const [formError, setFormError] = createSignal("");
    const [result, setResult] = createSignal<GeneratedLink | null>(null);
    const [copied, setCopied] = createSignal(false);
    const [history, setHistory] = createSignal<GeneratedLink[]>([]);
    const [copiedIdx, setCopiedIdx] = createSignal<number | null>(null);

    onMount(async () => {
        try {
            const data = await api.get<Subscription[]>("/subscriptions");
            setSubs(data);
        } catch { /* ignore */ }
    });

    const formatPrice = (amount: number, currency: string) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);

    const selectedSub = () => subs().find(s => s.id === subId());

    // ─── Generate ───────────────────────────────────────────────

    const generateCheckoutLink = async () => {
        setFormError("");
        if (!subId()) { setFormError("Please select a subscription plan"); return; }
        if (!checkoutUid().trim()) { setFormError("User ID is required"); return; }

        setLoading(true);
        try {
            const data = await api.post<{ url: string; expiresAt: string }>("/checkout-links", {
                sub_id: subId(),
                uid: checkoutUid().trim(),
                ttl: ttlMinutes() * 60,
            });

            const link: GeneratedLink = {
                type: "checkout",
                url: `${window.location.origin}${data.url}`,
                expiresAt: data.expiresAt,
                label: selectedSub()?.name || "Unknown",
                uid: checkoutUid().trim(),
            };

            setResult(link);
            setCopied(false);
            setHistory(prev => [link, ...prev]);
        } catch (err: any) {
            setFormError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const generatePortalLink = async () => {
        setFormError("");
        if (!portalUid().trim()) { setFormError("User ID is required"); return; }

        setLoading(true);
        try {
            const data = await api.post<{ url: string; expiresAt: string }>("/portal-links", {
                uid: portalUid().trim(),
                ttl: ttlMinutes() * 60,
            });

            const link: GeneratedLink = {
                type: "portal",
                url: `${window.location.origin}${data.url}`,
                expiresAt: data.expiresAt,
                label: "Portal",
                uid: portalUid().trim(),
            };

            setResult(link);
            setCopied(false);
            setHistory(prev => [link, ...prev]);
        } catch (err: any) {
            setFormError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const generate = () => {
        if (activeTab() === "checkout") generateCheckoutLink();
        else generatePortalLink();
    };

    // ─── Clipboard ──────────────────────────────────────────────

    const copyUrl = async (url: string) => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const copyHistoryUrl = async (url: string, idx: number) => {
        await navigator.clipboard.writeText(url);
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 2000);
    };

    const formatExpiry = (iso: string) => {
        return new Date(iso).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const truncateUrl = (url: string, max = 50) =>
        url.length > max ? url.slice(0, max) + "…" : url;

    const switchTab = (tab: LinkType) => {
        setActiveTab(tab);
        setFormError("");
        setResult(null);
    };

    // ─── Render ─────────────────────────────────────────────────

    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Links</h1>
                    <p class="page-description">Generate secure checkout and portal links for your customers</p>
                </div>
            </div>

            {/* Tab Switcher */}
            <div class="links-tabs">
                <button
                    class={`links-tab ${activeTab() === "checkout" ? "active" : ""}`}
                    onClick={() => switchTab("checkout")}
                >
                    <CreditCard size={16} />
                    Checkout Link
                </button>
                <button
                    class={`links-tab ${activeTab() === "portal" ? "active" : ""}`}
                    onClick={() => switchTab("portal")}
                >
                    <UserCircle size={16} />
                    Portal Link
                </button>
            </div>

            {/* Generator Form */}
            <div class="card">
                <div class="card-title">
                    <Show when={activeTab() === "checkout"} fallback={
                        <>
                            <UserCircle size={16} style={{ "vertical-align": "-3px", "margin-right": "8px", opacity: 0.6 }} />
                            Generate Portal Link
                        </>
                    }>
                        <CreditCard size={16} style={{ "vertical-align": "-3px", "margin-right": "8px", opacity: 0.6 }} />
                        Generate Checkout Link
                    </Show>
                </div>

                <Show when={activeTab() === "checkout"}>
                    <p class="form-hint" style={{ "margin-bottom": "16px" }}>
                        Creates a one-time payment link for a specific plan. The customer will be redirected to the payment gateway.
                    </p>
                </Show>
                <Show when={activeTab() === "portal"}>
                    <p class="form-hint" style={{ "margin-bottom": "16px" }}>
                        Creates a self-service portal link. The customer can view, cancel, change, or renew their subscription.
                    </p>
                </Show>

                <Show when={formError()}>
                    <div class="error-msg">{formError()}</div>
                </Show>

                {/* Checkout-specific: Subscription Plan */}
                <Show when={activeTab() === "checkout"}>
                    <div class="form-group">
                        <label>Subscription Plan</label>
                        <select value={subId()} onChange={(e) => setSubId(e.target.value)}>
                            <option value="">Select a plan…</option>
                            <For each={subs()}>
                                {(s) => (
                                    <option value={s.id}>
                                        {s.name} — {formatPrice(s.amount, s.currency)} / {s.interval === "one_time" ? "one-time" : s.intervalCount > 1 ? `every ${s.intervalCount} ${s.interval}s` : s.interval}
                                    </option>
                                )}
                            </For>
                        </select>
                    </div>
                </Show>

                {/* User ID (both types) */}
                <div class="form-group">
                    <label>User ID</label>
                    <input
                        type="text"
                        value={activeTab() === "checkout" ? checkoutUid() : portalUid()}
                        onInput={(e) => {
                            if (activeTab() === "checkout") setCheckoutUid(e.target.value);
                            else setPortalUid(e.target.value);
                        }}
                        placeholder="e.g. user_123 or email@example.com"
                    />
                    <div class="form-hint">
                        {activeTab() === "checkout"
                            ? "Your application's unique identifier for this customer"
                            : "The uid of the subscriber who will access the portal"}
                    </div>
                </div>

                <div class="form-group">
                    <label>Link Expiration (minutes)</label>
                    <input
                        type="number"
                        value={ttlMinutes()}
                        onInput={(e) => setTtlMinutes(Math.max(1, Math.min(1440, parseInt(e.target.value) || 30)))}
                        min={1}
                        max={1440}
                    />
                    <div class="form-hint">1–1440 minutes (24 hours max). Default: 30 minutes.</div>
                </div>

                <button class="btn btn-primary" onClick={generate} disabled={loading()}>
                    <Link size={16} />
                    {loading() ? "Generating…" : "Generate Link"}
                </button>
            </div>

            {/* Result */}
            <Show when={result()}>
                <div class="card" style={{ "border-color": "rgba(104, 211, 145, 0.25)" }}>
                    <div class="card-title" style={{ color: "var(--success)" }}>
                        <Check size={16} style={{ "vertical-align": "-3px", "margin-right": "8px" }} />
                        {result()!.type === "checkout" ? "Checkout" : "Portal"} Link Generated
                    </div>

                    <div class="form-group">
                        <label>{result()!.type === "checkout" ? "Checkout" : "Portal"} URL</label>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <input
                                type="text"
                                value={result()!.url}
                                readOnly
                                style={{ flex: "1", "font-family": "'SF Mono', 'Fira Code', 'Consolas', monospace", "font-size": "13px" }}
                            />
                            <button class="btn btn-ghost" onClick={() => copyUrl(result()!.url)}>
                                {copied() ? <Check size={16} /> : <Copy size={16} />}
                                {copied() ? "Copied!" : "Copy"}
                            </button>
                            <a
                                href={result()!.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="btn btn-ghost"
                                title="Open in new tab"
                            >
                                <ExternalLink size={16} />
                            </a>
                        </div>
                    </div>

                    <div style={{ display: "flex", "align-items": "center", gap: "6px", "font-size": "13px", color: "var(--text-muted)" }}>
                        <Clock size={14} />
                        Expires {formatExpiry(result()!.expiresAt)}
                    </div>
                </div>
            </Show>

            {/* Session History */}
            <div style={{ "margin-top": "8px" }}>
                <div class="card-title" style={{ "margin-bottom": "12px" }}>
                    Session History
                </div>

                <Show when={history().length === 0}>
                    <div class="empty-state">
                        <Link size={48} />
                        <h3>No links generated yet</h3>
                        <p>Generate your first link above. History is kept for the current session.</p>
                    </div>
                </Show>

                <Show when={history().length > 0}>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Plan / Label</th>
                                    <th>User ID</th>
                                    <th>URL</th>
                                    <th>Expires</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                <For each={history()}>
                                    {(link, idx) => (
                                        <tr>
                                            <td>
                                                <span class={`badge ${link.type === "checkout" ? "badge-info" : "badge-portal"}`}>
                                                    {link.type}
                                                </span>
                                            </td>
                                            <td style={{ "font-weight": "500", color: "var(--text)" }}>{link.label}</td>
                                            <td class="mono">{link.uid}</td>
                                            <td class="mono" title={link.url}>{truncateUrl(link.url)}</td>
                                            <td>
                                                <span class="badge badge-pending">
                                                    {formatExpiry(link.expiresAt)}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    class="btn btn-ghost btn-sm btn-icon"
                                                    title={copiedIdx() === idx() ? "Copied!" : "Copy URL"}
                                                    onClick={() => copyHistoryUrl(link.url, idx())}
                                                >
                                                    <Show when={copiedIdx() === idx()} fallback={<Copy size={14} />}>
                                                        <Check size={14} style="color: var(--success)" />
                                                    </Show>
                                                </button>
                                            </td>
                                        </tr>
                                    )}
                                </For>
                            </tbody>
                        </table>
                    </div>
                </Show>
            </div>
        </div>
    );
}
