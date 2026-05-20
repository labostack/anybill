/** Payment Links — generate and track secure checkout links for customers. */
import { createSignal, onMount, For, Show } from "solid-js";
import { api } from "../api/client";
import { Link, Copy, Check, Clock, ExternalLink } from "lucide-solid";

interface Subscription {
    id: string;
    name: string;
    amount: number;
    currency: string;
    interval: string;
}

interface GeneratedLink {
    url: string;
    expiresAt: string;
    subName: string;
    uid: string;
}

export function PaymentLinks() {
    const [subs, setSubs] = createSignal<Subscription[]>([]);
    const [subId, setSubId] = createSignal("");
    const [uid, setUid] = createSignal("");
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

    const generate = async () => {
        setFormError("");

        if (!subId()) { setFormError("Please select a subscription plan"); return; }
        if (!uid().trim()) { setFormError("User ID is required"); return; }

        setLoading(true);
        try {
            const data = await api.post<{ url: string; expiresAt: string }>("/checkout-links", {
                sub_id: subId(),
                uid: uid().trim(),
                ttl: ttlMinutes() * 60,
            });

            const link: GeneratedLink = {
                url: data.url,
                expiresAt: data.expiresAt,
                subName: selectedSub()?.name || "Unknown",
                uid: uid().trim(),
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

    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Payment Links</h1>
                    <p class="page-description">Generate secure checkout links for your customers</p>
                </div>
            </div>

            {/* Generator Form */}
            <div class="card">
                <div class="card-title">
                    <Link size={16} style={{ "vertical-align": "-3px", "margin-right": "8px", opacity: 0.6 }} />
                    Generate Link
                </div>

                <Show when={formError()}>
                    <div class="error-msg">{formError()}</div>
                </Show>

                <div class="form-group">
                    <label>Subscription Plan</label>
                    <select value={subId()} onChange={(e) => setSubId(e.target.value)}>
                        <option value="">Select a plan…</option>
                        <For each={subs()}>
                            {(s) => (
                                <option value={s.id}>
                                    {s.name} — {formatPrice(s.amount, s.currency)} / {s.interval}
                                </option>
                            )}
                        </For>
                    </select>
                </div>

                <div class="form-group">
                    <label>User ID</label>
                    <input
                        type="text"
                        value={uid()}
                        onInput={(e) => setUid(e.target.value)}
                        placeholder="e.g. user_123 or email@example.com"
                    />
                    <div class="form-hint">Your application's unique identifier for this customer</div>
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
                        Link Generated
                    </div>

                    <div class="form-group">
                        <label>Checkout URL</label>
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
                        <p>Generate your first payment link above. History is kept for the current session.</p>
                    </div>
                </Show>

                <Show when={history().length > 0}>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Plan</th>
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
                                            <td style={{ "font-weight": "500", color: "var(--text)" }}>{link.subName}</td>
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
