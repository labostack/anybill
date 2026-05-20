/** Invoices page — filterable, paginated list of all payment transactions. */
import { createSignal, onMount, For, Show } from "solid-js";
import { api } from "../api/client";

export function Invoices() {
    const [data, setData] = createSignal<any>({ items: [], total: 0 });
    const [statusFilter, setStatusFilter] = createSignal("");
    const [page, setPage] = createSignal(1);

    const load = async () => {
        let qs = `?page=${page()}&limit=50`;
        if (statusFilter()) qs += `&status=${statusFilter()}`;
        setData(await api.get(`/invoices${qs}`));
    };

    onMount(load);

    const formatAmount = (amount: number, currency: string) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);

    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Invoices</h1>
                    <p class="page-description">All payment transactions</p>
                </div>
                <div class="filters">
                    <select value={statusFilter()} onChange={(e) => { setStatusFilter(e.target.value); load(); }}>
                        <option value="">All statuses</option>
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                        <option value="failed">Failed</option>
                        <option value="refunded">Refunded</option>
                    </select>
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
                        </tr>
                    </thead>
                    <tbody>
                        <For each={data().items} fallback={
                            <tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted)">No invoices yet</td></tr>
                        }>
                            {(inv: any) => (
                                <tr>
                                    <td class="mono">{inv.id.slice(0, 8)}</td>
                                    <td>{inv.subscriber?.uid || "—"}</td>
                                    <td style="color: var(--text); font-weight: 500">{inv.subscription?.name || "—"}</td>
                                    <td>
                                        <Show when={inv.couponId} fallback={formatAmount(inv.amount, inv.currency)}>
                                            <div>
                                                <span style="text-decoration: line-through; opacity: 0.4; margin-right: 6px; font-size: 12px">
                                                    {formatAmount(inv.originalAmount || inv.amount, inv.currency)}
                                                </span>
                                                <span>{formatAmount(inv.amount, inv.currency)}</span>
                                            </div>
                                        </Show>
                                    </td>
                                    <td><span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary)">{inv.provider}</span></td>
                                    <td><span class={`badge badge-${inv.status}`}>{inv.status}</span></td>
                                    <td>{new Date(inv.createdAt).toLocaleDateString()}</td>
                                </tr>
                            )}
                        </For>
                    </tbody>
                </table>
            </div>

            <div class="pagination">
                <button class="btn btn-ghost btn-sm" disabled={page() <= 1} onClick={() => { setPage(page() - 1); load(); }}>← Prev</button>
                <span class="page-info">Page {page()}</span>
                <button class="btn btn-ghost btn-sm" disabled={data().items.length < 50} onClick={() => { setPage(page() + 1); load(); }}>Next →</button>
            </div>
        </div>
    );
}
