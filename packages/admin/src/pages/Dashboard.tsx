/** Dashboard page — revenue stats, subscriber counts, and payment activity chart. */
import { createSignal, onMount, For, Show } from "solid-js";
import { api } from "../api/client";

export function Dashboard() {
    const [stats, setStats] = createSignal<any>(null);
    const [statusFilter, setStatusFilter] = createSignal("");
    const [from, setFrom] = createSignal(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
    const [to, setTo] = createSignal(new Date().toISOString().slice(0, 10));

    const load = async () => {
        let qs = `?from=${from()}&to=${to()}`;
        if (statusFilter()) qs += `&status=${statusFilter()}`;
        const data = await api.get(`/dashboard/stats${qs}`);
        setStats(data);
    };

    onMount(load);

    const formatAmount = (amount: number, currency: string) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);

    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Dashboard</h1>
                    <p class="page-description">Overview of your billing activity</p>
                </div>
            </div>

            <div class="toolbar">
                <div class="filters">
                    <input
                        type="date"
                        value={from()}
                        onInput={(e) => { setFrom(e.target.value); load(); }}
                    />
                    <input
                        type="date"
                        value={to()}
                        onInput={(e) => { setTo(e.target.value); load(); }}
                    />
                    <select
                        value={statusFilter()}
                        onChange={(e) => { setStatusFilter(e.target.value); load(); }}
                    >
                        <option value="">All statuses</option>
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                        <option value="failed">Failed</option>
                        <option value="refunded">Refunded</option>
                    </select>
                </div>
            </div>

            <Show when={stats()}>
                <div class="stats-grid">
                    <For each={Object.entries(stats().totals.revenueByCurrency || {})}>
                        {([currency, amount]: [string, any]) => (
                            <div class="stat-card">
                                <div class="stat-label">Revenue ({currency.toUpperCase()})</div>
                                <div class="stat-value">{formatAmount(amount, currency)}</div>
                            </div>
                        )}
                    </For>
                    <Show when={Object.keys(stats().totals.revenueByCurrency || {}).length === 0}>
                        <div class="stat-card">
                            <div class="stat-label">Revenue</div>
                            <div class="stat-value">—</div>
                        </div>
                    </Show>
                    <div class="stat-card">
                        <div class="stat-label">Invoices</div>
                        <div class="stat-value">{stats().totals.invoices}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Active Subscribers</div>
                        <div class="stat-value">{stats().totals.activeSubscribers}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Total Subscribers</div>
                        <div class="stat-value">{stats().totals.subscribers}</div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-title">Payment Activity</div>
                    <div class="chart-container">
                        <For each={stats().chart}>
                            {(day: any) => {
                                const totalAmount = Object.values(day.amounts || {}).reduce((s: number, v: any) => s + v, 0) as number;
                                const maxAmount = Math.max(
                                    ...stats().chart.map((d: any) =>
                                        Object.values(d.amounts || {}).reduce((s: number, v: any) => s + v, 0) as number
                                    ),
                                    1
                                );
                                const h = Math.max((totalAmount / maxAmount) * 160, 2);
                                const tooltip = Object.entries(day.amounts || {})
                                    .map(([c, a]: [string, any]) => `${(a / 100).toFixed(2)} ${c.toUpperCase()}`)
                                    .join(", ");
                                return (
                                    <div class="chart-bar-wrap">
                                        <div
                                            class="chart-bar"
                                            style={{ height: `${h}px` }}
                                            title={`${day.date}: ${day.count} payments — ${tooltip}`}
                                        />
                                        <span class="chart-label">{day.date.slice(5)}</span>
                                    </div>
                                );
                            }}
                        </For>
                    </div>
                </div>
            </Show>
        </div>
    );
}
