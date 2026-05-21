/** Subscribers page — full-featured list with search/filters, detail drawer, and manual plan management. */
import { createSignal, createMemo, onMount, For, Show } from "solid-js";
import { api } from "../api/client";
import { Search, X, Users, ChevronRight, Gift, RefreshCw, Ban, Trash2, Calendar } from "lucide-solid";
import { Pagination } from "../components/Pagination";
import { debounce } from "../utils/debounce";

const STATUS_COLORS: Record<string, string> = {
    active: "badge-active",
    trialing: "badge-info",
    pending: "badge-pending",
    cancelled: "badge-cancelled",
    expired: "badge-expired",
    past_due: "badge-pending",
};

function fmtDate(d: string | null | undefined, fallback = "—") {
    if (!d) return fallback;
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(d: string | null | undefined) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtAmount(amount: number, currency: string) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
}

export function Subscribers() {
    const [data, setData] = createSignal<any>({ items: [], total: 0 });
    const [statusFilter, setStatusFilter] = createSignal("");
    const [uidSearch, setUidSearch] = createSignal("");
    const [planFilter, setPlanFilter] = createSignal("");
    const [dateFrom, setDateFrom] = createSignal("");
    const [dateTo, setDateTo] = createSignal("");
    const [page, setPage] = createSignal(1);
    const [limit, setLimit] = createSignal(50);

    // Subscriptions for plan filter dropdown + grant modal
    const [subscriptions, setSubscriptions] = createSignal<any[]>([]);

    // Detail drawer
    const [selected, setSelected] = createSignal<any>(null);
    const [detail, setDetail] = createSignal<any>(null);
    const [detailLoading, setDetailLoading] = createSignal(false);

    // Grant plan modal
    const [showGrant, setShowGrant] = createSignal(false);
    const [grantPlanId, setGrantPlanId] = createSignal("");
    const [grantPeriodDays, setGrantPeriodDays] = createSignal("30");
    const [grantLoading, setGrantLoading] = createSignal(false);
    const [grantError, setGrantError] = createSignal("");

    // Change plan modal
    const [showChangePlan, setShowChangePlan] = createSignal(false);
    const [newPlanId, setNewPlanId] = createSignal("");
    const [changePlanLoading, setChangePlanLoading] = createSignal(false);

    // Extend period modal
    const [showExtend, setShowExtend] = createSignal(false);
    const [extendDate, setExtendDate] = createSignal("");
    const [extendLoading, setExtendLoading] = createSignal(false);

    const load = async () => {
        let qs = `?page=${page()}&limit=${limit()}`;
        if (statusFilter()) qs += `&status=${statusFilter()}`;
        if (uidSearch()) qs += `&uid=${encodeURIComponent(uidSearch())}`;
        if (planFilter()) qs += `&subscriptionId=${planFilter()}`;
        if (dateFrom()) qs += `&createdFrom=${encodeURIComponent(dateFrom())}`;
        if (dateTo()) qs += `&createdTo=${encodeURIComponent(dateTo())}`;
        setData(await api.get(`/subscribers${qs}`));
    };

    // Debounced version for text/date inputs (400ms delay)
    const debouncedLoad = debounce(() => { setPage(1); load(); }, 400);

    const loadSubs = async () => {
        const d = await api.get("/subscriptions");
        setSubscriptions(d);
    };

    onMount(() => { load(); loadSubs(); });

    const openDetail = async (sub: any) => {
        setSelected(sub);
        setDetail(null);
        setDetailLoading(true);
        try {
            const d = await api.get(`/subscribers/${sub.id}`);
            setDetail(d);
        } finally {
            setDetailLoading(false);
        }
    };

    const closeDetail = () => { setSelected(null); setDetail(null); };

    const cancel = async (id: string) => {
        if (!confirm("Cancel this subscription?")) return;
        try {
            await api.post(`/subscribers/${id}/cancel`);
            closeDetail();
            load();
        } catch (err: any) { alert(err.message); }
    };

    const refund = async (id: string) => {
        if (!confirm("Refund this subscriber? This will attempt to refund via the payment provider.")) return;
        try {
            await api.post(`/subscribers/${id}/refund`);
            closeDetail();
            load();
        } catch (err: any) { alert(err.message); }
    };

    const revoke = async (id: string) => {
        if (!confirm("Revoke access immediately? The subscriber status will be set to cancelled.")) return;
        try {
            await api.put(`/subscribers/${id}`, { status: "cancelled" });
            closeDetail();
            load();
        } catch (err: any) { alert(err.message); }
    };

    const doGrant = async () => {
        setGrantError("");
        setGrantLoading(true);
        const sub = detail() || selected();
        try {
            const body: any = {};
            if (grantPlanId()) body.subscriptionId = grantPlanId();
            if (grantPeriodDays()) body.periodDays = Number(grantPeriodDays());
            await api.post(`/subscribers/${sub.id}/grant`, body);
            setShowGrant(false);
            const d = await api.get(`/subscribers/${sub.id}`);
            setDetail(d);
            load();
        } catch (err: any) {
            setGrantError(err.message);
        } finally {
            setGrantLoading(false);
        }
    };

    const doChangePlan = async () => {
        setChangePlanLoading(true);
        const sub = detail() || selected();
        try {
            await api.put(`/subscribers/${sub.id}`, { subscriptionId: newPlanId() });
            setShowChangePlan(false);
            const d = await api.get(`/subscribers/${sub.id}`);
            setDetail(d);
            load();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setChangePlanLoading(false);
        }
    };

    const doExtend = async () => {
        setExtendLoading(true);
        const sub = detail() || selected();
        try {
            await api.put(`/subscribers/${sub.id}`, { currentPeriodEnd: new Date(extendDate()).toISOString() });
            setShowExtend(false);
            const d = await api.get(`/subscribers/${sub.id}`);
            setDetail(d);
            load();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setExtendLoading(false);
        }
    };

    const clearFilters = () => {
        setUidSearch(""); setStatusFilter(""); setPlanFilter(""); setDateFrom(""); setDateTo("");
        setPage(1); load();
    };

    const hasFilters = createMemo(() => uidSearch() || statusFilter() || planFilter() || dateFrom() || dateTo());

    // Unique plan names for filter dropdown
    const planOptions = createMemo(() => {
        const seen = new Map<string, string>();
        for (const s of subscriptions()) {
            if (!seen.has(s.id)) seen.set(s.id, s.name);
        }
        return [...seen.entries()];
    });

    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Subscribers</h1>
                    <p class="page-description">
                        {data().total > 0 ? `${data().total} total subscribers` : "Users with active or past subscriptions"}
                    </p>
                </div>
            </div>

            {/* Toolbar */}
            <div class="plans-toolbar" style="margin-bottom: 20px">
                <div class="search-wrap">
                    <Search size={14} class="search-icon" />
                    <input
                        class="search-input"
                        placeholder="Search by UID..."
                        value={uidSearch()}
                        onInput={(e) => { setUidSearch(e.target.value); debouncedLoad(); }}
                    />
                    <Show when={uidSearch()}>
                        <button class="search-clear" onClick={() => { setUidSearch(""); setPage(1); load(); }}><X size={12} /></button>
                    </Show>
                </div>
                <div class="filters">
                    <select value={statusFilter()} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); load(); }}>
                        <option value="">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="trialing">Trialing</option>
                        <option value="active">Active</option>
                        <option value="past_due">Past due</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="expired">Expired</option>
                    </select>
                    <select value={planFilter()} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); load(); }}>
                        <option value="">All plans</option>
                        <For each={planOptions()}>{([id, name]) => <option value={id}>{name}</option>}</For>
                    </select>
                    <input type="date" title="From" value={dateFrom()} onInput={(e) => { setDateFrom(e.target.value); debouncedLoad(); }} style="min-width: 140px" />
                    <input type="date" title="To" value={dateTo()} onInput={(e) => { setDateTo(e.target.value); debouncedLoad(); }} style="min-width: 140px" />
                    <Show when={hasFilters()}>
                        <button class="btn btn-ghost btn-sm" onClick={clearFilters} style="color: var(--text-muted)">
                            <X size={13} /> Clear
                        </button>
                    </Show>
                </div>
            </div>

            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>UID</th>
                            <th>Plan</th>
                            <th>Status</th>
                            <th>Period End</th>
                            <th>Joined</th>
                            <th style="width: 40px"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <For each={data().items} fallback={
                            <tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted)">No subscribers yet</td></tr>
                        }>
                            {(sub: any) => (
                                <tr class="subscriber-row" onClick={() => openDetail(sub)}>
                                    <td class="mono">{sub.uid}</td>
                                    <td style="color: var(--text); font-weight: 500">{sub.subscription?.name || "—"}</td>
                                    <td><span class={`badge ${STATUS_COLORS[sub.status] || ""}`}>{sub.status}</span></td>
                                    <td>
                                        {sub.currentPeriodEnd
                                            ? fmtDate(sub.currentPeriodEnd)
                                            : sub.subscription?.interval === "one_time"
                                                ? <span class="text-muted" style="font-style: italic">One-time</span>
                                                : "—"}
                                    </td>
                                    <td style="color: var(--text-muted); font-size: 13px">{fmtDate(sub.createdAt)}</td>
                                    <td><ChevronRight size={14} style="color: var(--text-muted)" /></td>
                                </tr>
                            )}
                        </For>
                    </tbody>
                </table>
            </div>

            <Pagination
                page={page()}
                total={data().total}
                limit={limit()}
                onPageChange={(p) => { setPage(p); load(); }}
                onLimitChange={(l) => { setLimit(l); setPage(1); load(); }}
            />

            {/* ── Detail Drawer ── */}
            <Show when={selected()}>
                <div class="drawer-overlay" onClick={closeDetail}>
                    <div class="drawer" onClick={(e) => e.stopPropagation()}>
                        <div class="drawer-header">
                            <div>
                                <h2 class="drawer-title">Subscriber</h2>
                                <span class="drawer-uid mono">{selected()?.uid}</span>
                            </div>
                            <button class="btn btn-ghost btn-sm btn-icon" onClick={closeDetail}><X size={16} /></button>
                        </div>

                        <Show when={detailLoading()}>
                            <div style="text-align: center; padding: 60px; color: var(--text-muted)">Loading...</div>
                        </Show>

                        <Show when={detail() && !detailLoading()}>
                            <div>
                                {/* Status + badges */}
                                <div class="drawer-status-row">
                                    <span class={`badge ${STATUS_COLORS[detail().status] || ""}`}>{detail().status}</span>
                                    <Show when={detail().subscription?.interval === "one_time"}>
                                        <span class="badge" style="background: var(--warning-bg); color: var(--warning)">One-time</span>
                                    </Show>
                                    <Show when={detail().squad}>
                                        <span class="badge badge-info"><Users size={11} /> Squad owner</span>
                                    </Show>
                                </div>

                                {/* Info grid */}
                                <div class="drawer-section">
                                    <div class="drawer-section-title">Subscription</div>
                                    <div class="drawer-info-grid">
                                        <div class="drawer-info-item">
                                            <span class="drawer-info-label">Plan</span>
                                            <span class="drawer-info-value">{detail().subscription?.name || "—"}</span>
                                        </div>
                                        <div class="drawer-info-item">
                                            <span class="drawer-info-label">Amount</span>
                                            <span class="drawer-info-value">
                                                {detail().subscription ? fmtAmount(detail().subscription.amount, detail().subscription.currency) : "—"}
                                            </span>
                                        </div>
                                        <div class="drawer-info-item">
                                            <span class="drawer-info-label">Interval</span>
                                            <span class="drawer-info-value">{detail().subscription?.interval || "—"}</span>
                                        </div>
                                        <div class="drawer-info-item">
                                            <span class="drawer-info-label">Renewal</span>
                                            <span class="drawer-info-value">
                                                {detail().renewalMode === "provider_managed"
                                                    ? `Auto-renew (${detail().provider || "provider"})`
                                                    : detail().renewalMode || "—"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div class="drawer-section">
                                    <div class="drawer-section-title">Billing Period</div>
                                    <div class="drawer-info-grid">
                                        <div class="drawer-info-item">
                                            <span class="drawer-info-label">Period start</span>
                                            <span class="drawer-info-value">{fmtDate(detail().currentPeriodStart)}</span>
                                        </div>
                                        <div class="drawer-info-item">
                                            <span class="drawer-info-label">Period end</span>
                                            <span class="drawer-info-value">{fmtDate(detail().currentPeriodEnd)}</span>
                                        </div>
                                        <Show when={detail().trialEnd}>
                                            <div class="drawer-info-item">
                                                <span class="drawer-info-label">Trial end</span>
                                                <span class="drawer-info-value" style="color: var(--warning)">{fmtDate(detail().trialEnd)}</span>
                                            </div>
                                        </Show>
                                        <div class="drawer-info-item">
                                            <span class="drawer-info-label">Joined</span>
                                            <span class="drawer-info-value">{fmtDateTime(detail().createdAt)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Squad info */}
                                <Show when={detail().squad}>
                                    <div class="drawer-section">
                                        <div class="drawer-section-title">Squad</div>
                                        <div class="drawer-info-grid">
                                            <div class="drawer-info-item">
                                                <span class="drawer-info-label">Squad ID</span>
                                                <span class="drawer-info-value mono" style="font-size: 12px">{detail().squad.id}</span>
                                            </div>
                                            <div class="drawer-info-item">
                                                <span class="drawer-info-label">Members</span>
                                                <span class="drawer-info-value">{detail().squad.members?.length || 0} / {detail().squad.maxMembers || "∞"}</span>
                                            </div>
                                        </div>
                                    </div>
                                </Show>

                                {/* Invoice history */}
                                <Show when={detail().invoices?.length > 0}>
                                    <div class="drawer-section">
                                        <div class="drawer-section-title">Recent invoices</div>
                                        <div class="drawer-invoices">
                                            <For each={(detail().invoices || []).slice(0, 8)}>
                                                {(inv: any) => (
                                                    <div class="drawer-invoice-row">
                                                        <span class="mono" style="font-size: 11px; color: var(--text-muted)">{inv.id.slice(0, 8)}</span>
                                                        <span class={`badge badge-${inv.status}`} style="font-size: 10px">{inv.status}</span>
                                                        <span style="flex: 1; font-size: 12px; color: var(--text-secondary)">{inv.provider}</span>
                                                        <span style="font-size: 13px; font-weight: 600; color: var(--text)">{fmtAmount(inv.amount, inv.currency)}</span>
                                                        <span style="font-size: 11px; color: var(--text-muted)">{fmtDate(inv.createdAt)}</span>
                                                    </div>
                                                )}
                                            </For>
                                        </div>
                                    </div>
                                </Show>

                                {/* Actions */}
                                <div class="drawer-actions">
                                    <div class="drawer-section-title">Actions</div>
                                    <div class="drawer-action-grid">
                                        <button class="drawer-action-btn drawer-action-grant" onClick={() => { setGrantPlanId(detail().subscriptionId || ""); setGrantPeriodDays("30"); setGrantError(""); setShowGrant(true); }}>
                                            <Gift size={15} />
                                            <span>Grant access</span>
                                        </button>
                                        <button class="drawer-action-btn drawer-action-change" onClick={() => { setNewPlanId(detail().subscriptionId || ""); setShowChangePlan(true); }}>
                                            <RefreshCw size={15} />
                                            <span>Change plan</span>
                                        </button>
                                        <button class="drawer-action-btn drawer-action-extend" onClick={() => {
                                            const cur = detail().currentPeriodEnd ? new Date(detail().currentPeriodEnd) : new Date();
                                            setExtendDate(cur.toISOString().slice(0, 10));
                                            setShowExtend(true);
                                        }}>
                                            <Calendar size={15} />
                                            <span>Extend period</span>
                                        </button>
                                        <Show when={detail().status === "active"}>
                                            <button class="drawer-action-btn drawer-action-refund" onClick={() => refund(detail().id)}>
                                                <RefreshCw size={15} />
                                                <span>Refund</span>
                                            </button>
                                        </Show>
                                        <Show when={detail().status === "active" && detail().subscription?.interval !== "one_time"}>
                                            <button class="drawer-action-btn drawer-action-cancel" onClick={() => cancel(detail().id)}>
                                                <Ban size={15} />
                                                <span>Cancel</span>
                                            </button>
                                        </Show>
                                        <Show when={detail().status !== "cancelled"}>
                                            <button class="drawer-action-btn drawer-action-revoke" onClick={() => revoke(detail().id)}>
                                                <Trash2 size={15} />
                                                <span>Revoke access</span>
                                            </button>
                                        </Show>
                                    </div>
                                </div>
                            </div>
                        </Show>
                    </div>
                </div>
            </Show>

            {/* ── Grant Plan Modal ── */}
            <Show when={showGrant()}>
                <div class="modal-overlay" onClick={() => setShowGrant(false)}>
                    <div class="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Grant Plan Access</h2>
                        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px; margin-top: -16px">
                            Activates the subscriber without payment. Admin override only.
                        </p>
                        <Show when={grantError()}>
                            <div class="error-msg">{grantError()}</div>
                        </Show>
                        <div class="form-group">
                            <label>Plan</label>
                            <select value={grantPlanId()} onChange={(e) => setGrantPlanId(e.target.value)}>
                                <option value="">Keep current plan</option>
                                <For each={subscriptions()}>{(s: any) =>
                                    <option value={s.id}>{s.name} — {fmtAmount(s.amount, s.currency)} / {s.interval}</option>
                                }</For>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Access duration (days)</label>
                            <input type="number" min="0" value={grantPeriodDays()} onInput={(e) => setGrantPeriodDays(e.target.value)} placeholder="30" />
                            <div class="form-hint">0 = no expiry. Leave blank for indefinite access.</div>
                        </div>
                        <div class="modal-actions">
                            <button class="btn btn-ghost" onClick={() => setShowGrant(false)}>Cancel</button>
                            <button class="btn btn-primary" onClick={doGrant} disabled={grantLoading()}>
                                {grantLoading() ? "Granting..." : "Grant access"}
                            </button>
                        </div>
                    </div>
                </div>
            </Show>

            {/* ── Change Plan Modal ── */}
            <Show when={showChangePlan()}>
                <div class="modal-overlay" onClick={() => setShowChangePlan(false)}>
                    <div class="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Change Plan</h2>
                        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px; margin-top: -16px">
                            Reassigns the subscriber to a different plan. No payment is created.
                        </p>
                        <div class="form-group">
                            <label>New plan</label>
                            <select value={newPlanId()} onChange={(e) => setNewPlanId(e.target.value)}>
                                <option value="">Select a plan...</option>
                                <For each={subscriptions()}>{(s: any) =>
                                    <option value={s.id}>{s.name} — {fmtAmount(s.amount, s.currency)} / {s.interval}</option>
                                }</For>
                            </select>
                        </div>
                        <div class="modal-actions">
                            <button class="btn btn-ghost" onClick={() => setShowChangePlan(false)}>Cancel</button>
                            <button class="btn btn-primary" onClick={doChangePlan} disabled={changePlanLoading() || !newPlanId()}>
                                {changePlanLoading() ? "Saving..." : "Change plan"}
                            </button>
                        </div>
                    </div>
                </div>
            </Show>

            {/* ── Extend Period Modal ── */}
            <Show when={showExtend()}>
                <div class="modal-overlay" onClick={() => setShowExtend(false)}>
                    <div class="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Extend Billing Period</h2>
                        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px; margin-top: -16px">
                            Set a new period end date for this subscriber.
                        </p>
                        <div class="form-group">
                            <label>New period end date</label>
                            <input type="date" value={extendDate()} onInput={(e) => setExtendDate(e.target.value)} />
                        </div>
                        <div class="modal-actions">
                            <button class="btn btn-ghost" onClick={() => setShowExtend(false)}>Cancel</button>
                            <button class="btn btn-primary" onClick={doExtend} disabled={extendLoading() || !extendDate()}>
                                {extendLoading() ? "Saving..." : "Update period"}
                            </button>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
}
