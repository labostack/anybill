/** Subscribers page — paginated list with status filter, cancel, and refund actions. */
import { createSignal, onMount, For } from "solid-js";
import { api } from "../api/client";

export function Subscribers() {
    const [data, setData] = createSignal<any>({ items: [], total: 0 });
    const [statusFilter, setStatusFilter] = createSignal("");
    const [page, setPage] = createSignal(1);

    const load = async () => {
        let qs = `?page=${page()}&limit=50`;
        if (statusFilter()) qs += `&status=${statusFilter()}`;
        setData(await api.get(`/subscribers${qs}`));
    };

    onMount(load);

    const cancel = async (id: string) => {
        if (!confirm("Cancel this subscription?")) return;
        await api.post(`/subscribers/${id}/cancel`);
        load();
    };

    const refund = async (id: string) => {
        if (!confirm("Refund this subscriber? This will attempt to refund via the payment provider.")) return;
        await api.post(`/subscribers/${id}/refund`);
        load();
    };

    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Subscribers</h1>
                    <p class="page-description">Users with active or past subscriptions</p>
                </div>
                <div class="filters">
                    <select value={statusFilter()} onChange={(e) => { setStatusFilter(e.target.value); load(); }}>
                        <option value="">All statuses</option>
                        <option value="active">Active</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="expired">Expired</option>
                    </select>
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
                            <th style="width: 180px"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <For each={data().items} fallback={
                            <tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted)">No subscribers yet</td></tr>
                        }>
                            {(sub: any) => (
                                <tr>
                                    <td class="mono">{sub.uid}</td>
                                    <td style="color: var(--text); font-weight: 500">{sub.subscription?.name || "—"}</td>
                                    <td><span class={`badge badge-${sub.status}`}>{sub.status}</span></td>
                                    <td>
                                        {sub.currentPeriodEnd
                                            ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                                            : sub.subscription?.interval === "one_time"
                                                ? <span class="text-muted" style="font-style: italic">One-time</span>
                                                : "—"}
                                    </td>
                                    <td class="text-right">
                                        <div class="flex gap-2" style="justify-content: flex-end">
                                            {sub.status === "active" && (
                                                <button class="btn btn-ghost btn-sm" style="color: var(--warning); border-color: rgba(246, 197, 99, 0.2)" onClick={() => refund(sub.id)}>Refund</button>
                                            )}
                                            {sub.status === "active" && sub.subscription?.interval !== "one_time" && (
                                                <button class="btn btn-danger btn-sm" onClick={() => cancel(sub.id)}>Cancel</button>
                                            )}
                                        </div>
                                    </td>
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
