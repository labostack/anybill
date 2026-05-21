/** Invoices page — filterable, paginated list with search, provider filter, date range, amount display. */
import { createSignal, createMemo, onMount, For, Show } from "solid-js";
import { api } from "../api/client";
import { Search, X, ChevronRight, AlertTriangle } from "lucide-solid";
import { Pagination } from "../components/Pagination";
import { debounce } from "../utils/debounce";

function fmtDate(d: string | null | undefined) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(d: string | null | undefined) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtAmount(amount: number, currency: string) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
}

export function Invoices() {
    const [data, setData] = createSignal<any>({ items: [], total: 0 });
    const [statusFilter, setStatusFilter] = createSignal("");
    const [providerFilter, setProviderFilter] = createSignal("");
    const [uidSearch, setUidSearch] = createSignal("");
    const [dateFrom, setDateFrom] = createSignal("");
    const [dateTo, setDateTo] = createSignal("");
    const [page, setPage] = createSignal(1);
    const [limit, setLimit] = createSignal(50);

    // Detail drawer
    const [selected, setSelected] = createSignal<any>(null);
    const [detail, setDetail] = createSignal<any>(null);
    const [detailLoading, setDetailLoading] = createSignal(false);

    // Collect unique providers from loaded data for the filter dropdown
    const providers = createMemo(() => {
        const seen = new Set<string>();
        for (const inv of data().items) {
            if (inv.provider) seen.add(inv.provider);
        }
        return [...seen].sort();
    });

    const load = async () => {
        let qs = `?page=${page()}&limit=${limit()}`;
        if (statusFilter()) qs += `&status=${statusFilter()}`;
        if (providerFilter()) qs += `&provider=${providerFilter()}`;
        if (uidSearch()) qs += `&subscriberUid=${encodeURIComponent(uidSearch())}`;
        if (dateFrom()) qs += `&from=${dateFrom()}`;
        if (dateTo()) qs += `&to=${dateTo()}T23:59:59`;
        setData(await api.get(`/invoices${qs}`));
    };

    // Debounced version for text/date inputs (400ms delay)
    const debouncedLoad = debounce(() => { setPage(1); load(); }, 400);

    onMount(load);

    const clearFilters = () => {
        setStatusFilter(""); setProviderFilter(""); setUidSearch(""); setDateFrom(""); setDateTo("");
        setPage(1); load();
    };

    const hasFilters = createMemo(() =>
        statusFilter() || providerFilter() || uidSearch() || dateFrom() || dateTo()
    );

    const openDetail = async (inv: any) => {
        setSelected(inv);
        setDetail(null);
        setDetailLoading(true);
        try {
            const d = await api.get(`/invoices/${inv.id}`);
            setDetail(d);
        } finally {
            setDetailLoading(false);
        }
    };

    const closeDetail = () => { setSelected(null); setDetail(null); };

    const deleteInvoice = async (id: string) => {
        if (!confirm(`Permanently delete invoice ${id.slice(0, 8)}...? This cannot be undone.`)) return;
        try {
            await api.del(`/invoices/${id}`);
            closeDetail();
            load();
        } catch (err: any) { alert(err.message); }
    };

    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Invoices</h1>
                    <p class="page-description">
                        {data().total > 0 ? `${data().total} total invoices` : "All payment transactions"}
                    </p>
                </div>
            </div>

            {/* Toolbar */}
            <div class="plans-toolbar" style="margin-bottom: 20px">
                <div class="search-wrap">
                    <Search size={14} class="search-icon" />
                    <input
                        class="search-input"
                        placeholder="Search by subscriber UID..."
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
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                        <option value="failed">Failed</option>
                        <option value="refunded">Refunded</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <select value={providerFilter()} onChange={(e) => { setProviderFilter(e.target.value); setPage(1); load(); }}>
                        <option value="">All providers</option>
                        <For each={providers()}>{(p) => <option value={p}>{p}</option>}</For>
                    </select>
                    <input
                        type="date"
                        title="From"
                        value={dateFrom()}
                        onInput={(e) => { setDateFrom(e.target.value); debouncedLoad(); }}
                        style="min-width: 140px"
                    />
                    <input
                        type="date"
                        title="To"
                        value={dateTo()}
                        onInput={(e) => { setDateTo(e.target.value); debouncedLoad(); }}
                        style="min-width: 140px"
                    />
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
                            <th>ID</th>
                            <th>Subscriber</th>
                            <th>Plan</th>
                            <th>Amount</th>
                            <th>Provider</th>
                            <th>Status</th>
                            <th>Date</th>
                            <th style="width: 40px"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <For each={data().items} fallback={
                            <tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted)">No invoices found</td></tr>
                        }>
                            {(inv: any) => (
                                <tr class="subscriber-row" onClick={() => openDetail(inv)} style="cursor: pointer">
                                    <td class="mono">{inv.id.slice(0, 8)}</td>
                                    <td class="mono" style="font-size: 12px">{inv.subscriber?.uid || "—"}</td>
                                    <td style="color: var(--text); font-weight: 500">{inv.subscription?.name || "—"}</td>
                                    <td>
                                        <Show when={inv.couponId} fallback={fmtAmount(inv.amount, inv.currency)}>
                                            <div>
                                                <span style="text-decoration: line-through; opacity: 0.4; margin-right: 6px; font-size: 12px">
                                                    {fmtAmount(inv.originalAmount || inv.amount, inv.currency)}
                                                </span>
                                                <span style="font-weight: 600">{fmtAmount(inv.amount, inv.currency)}</span>
                                            </div>
                                        </Show>
                                    </td>
                                    <td>
                                        <span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary)">
                                            {inv.provider || "—"}
                                        </span>
                                    </td>
                                    <td><span class={`badge badge-${inv.status}`}>{inv.status}</span></td>
                                    <td style="color: var(--text-muted); font-size: 13px">{fmtDate(inv.createdAt)}</td>
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
                                <h2 class="drawer-title">Invoice</h2>
                                <span class="drawer-uid mono">{selected()?.id}</span>
                            </div>
                            <button class="btn btn-ghost btn-sm btn-icon" onClick={closeDetail}><X size={16} /></button>
                        </div>

                        <Show when={detailLoading()}>
                            <div style="text-align: center; padding: 60px; color: var(--text-muted)">Loading...</div>
                        </Show>

                        <Show when={detail() && !detailLoading()}>
                            <div>
                                <div class="drawer-status-row">
                                    <span class={`badge badge-${detail().status}`}>{detail().status}</span>
                                    <span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary)">
                                        {detail().provider || "—"}
                                    </span>
                                </div>

                                <div class="drawer-section">
                                    <div class="drawer-section-title">Details</div>
                                    <div class="drawer-info-grid">
                                        <div class="drawer-info-item">
                                            <span class="drawer-info-label">Amount</span>
                                            <span class="drawer-info-value">{fmtAmount(detail().amount, detail().currency)}</span>
                                        </div>
                                        <Show when={detail().couponId}>
                                            <div class="drawer-info-item">
                                                <span class="drawer-info-label">Original Amount</span>
                                                <span class="drawer-info-value" style="text-decoration: line-through; opacity: 0.6">
                                                    {fmtAmount(detail().originalAmount || detail().amount, detail().currency)}
                                                </span>
                                            </div>
                                            <div class="drawer-info-item">
                                                <span class="drawer-info-label">Discount</span>
                                                <span class="drawer-info-value" style="color: var(--success)">
                                                    -{fmtAmount(detail().discountAmount || 0, detail().currency)}
                                                </span>
                                            </div>
                                            <div class="drawer-info-item">
                                                <span class="drawer-info-label">Coupon</span>
                                                <span class="drawer-info-value mono">{detail().couponId}</span>
                                            </div>
                                        </Show>
                                        <div class="drawer-info-item">
                                            <span class="drawer-info-label">Date Created</span>
                                            <span class="drawer-info-value">{fmtDateTime(detail().createdAt)}</span>
                                        </div>
                                        <Show when={detail().paidAt}>
                                            <div class="drawer-info-item">
                                                <span class="drawer-info-label">Paid At</span>
                                                <span class="drawer-info-value">{fmtDateTime(detail().paidAt)}</span>
                                            </div>
                                        </Show>
                                    </div>
                                </div>

                                <div class="drawer-section">
                                    <div class="drawer-section-title">Subscriber</div>
                                    <div class="drawer-info-grid">
                                        <div class="drawer-info-item">
                                            <span class="drawer-info-label">UID</span>
                                            <span class="drawer-info-value mono">{detail().subscriber?.uid || "—"}</span>
                                        </div>
                                        <div class="drawer-info-item">
                                            <span class="drawer-info-label">Plan</span>
                                            <span class="drawer-info-value">{detail().subscription?.name || "—"}</span>
                                        </div>
                                    </div>
                                </div>

                                <Show when={detail().providerInvoiceId || detail().paymentUrl}>
                                    <div class="drawer-section">
                                        <div class="drawer-section-title">Provider Info</div>
                                        <div class="drawer-info-grid">
                                            <Show when={detail().providerInvoiceId}>
                                                <div class="drawer-info-item" style="grid-column: span 2">
                                                    <span class="drawer-info-label">Provider Invoice ID</span>
                                                    <span class="drawer-info-value mono" style="font-size: 11px; word-break: break-all;">
                                                        {detail().providerInvoiceId}
                                                    </span>
                                                </div>
                                            </Show>
                                            <Show when={detail().paymentUrl}>
                                                <div class="drawer-info-item" style="grid-column: span 2">
                                                    <span class="drawer-info-label">Payment URL</span>
                                                    <a href={detail().paymentUrl} target="_blank" rel="noreferrer" class="drawer-info-value mono" style="font-size: 11px; word-break: break-all; color: var(--primary);">
                                                        {detail().paymentUrl}
                                                    </a>
                                                </div>
                                            </Show>
                                        </div>
                                    </div>
                                </Show>
                            </div>
                            <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06)">
                                <button
                                    class="btn btn-sm"
                                    style="width: 100%; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #f87171; display: flex; align-items: center; justify-content: center; gap: 6px;"
                                    onClick={() => deleteInvoice(detail().id)}
                                >
                                    <AlertTriangle size={13} />
                                    Delete invoice permanently
                                </button>
                            </div>
                        </Show>
                    </div>
                </div>
            </Show>
        </div>
    );
}
