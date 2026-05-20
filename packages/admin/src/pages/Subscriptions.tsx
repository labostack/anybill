/** Subscriptions page — plan management with grouped card layout, create/edit/delete modals. */
import { createSignal, createMemo, onMount, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { api } from "../api/client";
import { Plus, ChevronDown, ChevronUp, Users, Copy, Check } from "lucide-solid";

const INTERVAL_LABELS: Record<string, string> = {
    day: "Daily",
    week: "Weekly",
    month: "Monthly",
    year: "Yearly",
    one_time: "One-time",
};

const INTERVAL_ORDER: Record<string, number> = {
    day: 0,
    week: 1,
    month: 2,
    year: 3,
    one_time: 4,
};

const INTERVAL_UNITS: Record<string, string> = {
    day: "days",
    week: "weeks",
    month: "months",
    year: "years",
};

function formatInterval(interval: string, count: number): string {
    if (interval === "one_time") return "One-time payment";
    if (count === 1) return INTERVAL_LABELS[interval] || interval;
    return `Every ${count} ${INTERVAL_UNITS[interval] || interval}`;
}

/** Convert minor units (999) to display string ("9.99") */
function minorToDisplay(minor: string | number): string {
    const n = typeof minor === "string" ? parseInt(minor, 10) : minor;
    if (!n && n !== 0) return "";
    return (n / 100).toFixed(2);
}

/** Convert display string ("9.99") to minor units (999) */
function displayToMinor(display: string): number {
    const cleaned = display.replace(/[^0-9.]/g, "");
    const n = parseFloat(cleaned);
    if (isNaN(n)) return 0;
    return Math.round(n * 100);
}

export function Subscriptions() {
    const [items, setItems] = createSignal<any[]>([]);
    const [showModal, setShowModal] = createSignal(false);
    const [editing, setEditing] = createSignal<any>(null);
    const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
    const [form, setForm] = createSignal({ name: "", description: "", displayAmount: "", currency: "USD", interval: "month", intervalCount: "1", renewalMode: "manual", squadEnabled: false, squadMaxMembers: "0", trialDays: "0" });
    const [metaRows, setMetaRows] = createStore<{ key: string; value: string }[]>([]);
    const [formError, setFormError] = createSignal("");
    const [saving, setSaving] = createSignal(false);

    const load = async () => {
        const data = await api.get("/subscriptions");
        setItems(data);
    };

    onMount(load);

    // Group subscriptions by name
    const grouped = createMemo(() => {
        const groups: Record<string, any[]> = {};
        for (const sub of items()) {
            const key = sub.name;
            if (!groups[key]) groups[key] = [];
            groups[key].push(sub);
        }
        // Sort plans within each group by interval
        for (const key in groups) {
            groups[key].sort((a: any, b: any) =>
                (INTERVAL_ORDER[a.interval] ?? 99) - (INTERVAL_ORDER[b.interval] ?? 99)
            );
        }
        // Return sorted group entries
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    });

    const toggleCollapse = (name: string) => {
        setCollapsed(prev => ({ ...prev, [name]: !prev[name] }));
    };

    const openCreate = () => {
        setEditing(null);
        setForm({ name: "", description: "", displayAmount: "", currency: "USD", interval: "month", intervalCount: "1", renewalMode: "manual", squadEnabled: false, squadMaxMembers: "0", trialDays: "0" });
        setMetaRows([]);
        setFormError("");
        setShowModal(true);
    };

    const openEdit = (sub: any) => {
        setEditing(sub);
        setForm({
            name: sub.name,
            description: sub.description || "",
            displayAmount: minorToDisplay(sub.amount),
            currency: sub.currency,
            interval: sub.interval,
            intervalCount: String(sub.intervalCount),
            renewalMode: sub.renewalMode || "manual",
            squadEnabled: sub.squadEnabled || false,
            squadMaxMembers: String(sub.squadMaxMembers || 0),
            trialDays: String(sub.trialDays || 0),
        });
        // Convert existing metadata object → rows
        const meta = sub.metadata && typeof sub.metadata === "object" ? sub.metadata : {};
        setMetaRows(Object.entries(meta).map(([key, value]) => ({ key, value: String(value) })));
        setFormError("");
        setShowModal(true);
    };

    const save = async () => {
        setFormError("");
        setSaving(true);
        try {
            const amount = displayToMinor(form().displayAmount);
            // Convert metadata rows → object (skip empty keys)
            const metadata: Record<string, any> = {};
            for (const { key, value } of metaRows) {
                const k = key.trim();
                if (!k) continue;
                // Auto-cast numbers
                const num = Number(value);
                metadata[k] = value.trim() !== "" && !isNaN(num) && value.trim() !== "" ? num : value;
            }
            const hasMetadata = Object.keys(metadata).length > 0;
            const body: Record<string, any> = {
                name: form().name,
                description: form().description,
                amount,
                currency: form().currency,
                interval: form().interval,
                intervalCount: form().interval === "one_time" ? 1 : Number(form().intervalCount),
                renewalMode: form().interval === "one_time" ? "manual" : form().renewalMode,
                squadEnabled: form().squadEnabled,
                squadMaxMembers: Number(form().squadMaxMembers),
                trialDays: form().interval === "one_time" ? 0 : Number(form().trialDays || 0),
            };
            if (hasMetadata) body.metadata = metadata;
            if (editing()) {
                await api.put(`/subscriptions/${editing().id}`, body);
            } else {
                await api.post("/subscriptions", body);
            }
            setShowModal(false);
            load();
        } catch (err: any) {
            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        if (!confirm("Delete this subscription?")) return;
        try {
            await api.del(`/subscriptions/${id}`);
            load();
        } catch (err: any) {
            alert(err.message);
        }
    };

    const formatPrice = (amount: number, currency: string) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);

    const [copiedId, setCopiedId] = createSignal<string | null>(null);

    const copyId = async (id: string) => {
        await navigator.clipboard.writeText(id);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    const getGroupStatus = (plans: any[]) => {
        const active = plans.filter((p: any) => p.isActive).length;
        const subscribers = plans.reduce((sum: number, p: any) => sum + (p.activeSubscribers || 0), 0);
        return { active, total: plans.length, subscribers };
    };

    /** Format amount input — allow digits and one dot, show as currency */
    const handleAmountInput = (raw: string) => {
        // Strip everything except digits and dot
        let cleaned = raw.replace(/[^0-9.]/g, "");
        // Only one dot
        const parts = cleaned.split(".");
        if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
        // Max 2 decimal places
        if (parts.length === 2 && parts[1].length > 2) {
            cleaned = parts[0] + "." + parts[1].slice(0, 2);
        }
        setForm({ ...form(), displayAmount: cleaned });
    };

    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Plans</h1>
                    <p class="page-description">Manage your subscription plans</p>
                </div>
                <button class="btn btn-primary" onClick={openCreate}>
                    <Plus size={16} />
                    Create plan
                </button>
            </div>

            <Show when={grouped().length === 0}>
                <div class="plan-groups-empty">
                    <p class="text-muted" style="text-align: center; padding: 48px 20px; font-size: 14px">
                        No plans yet. Create your first plan to get started.
                    </p>
                </div>
            </Show>

            <div class="plan-groups">
                <For each={grouped()}>
                    {([name, plans]) => {
                        const status = () => getGroupStatus(plans);
                        const isCollapsed = () => collapsed()[name] ?? false;

                        return (
                            <div class="plan-group">
                                <div class="plan-group-header" onClick={() => toggleCollapse(name)}>
                                    <div class="plan-group-info">
                                        <h3 class="plan-group-name">{name}</h3>
                                        <span class="plan-group-meta">
                                            {plans.length} {plans.length === 1 ? "variant" : "variants"}
                                            <span class="plan-group-meta-sep">·</span>
                                            {status().active} active
                                            <span class="plan-group-meta-sep">·</span>
                                            <span class="plan-group-subscribers">
                                                <Users size={12} />
                                                {status().subscribers}
                                            </span>
                                        </span>
                                    </div>
                                    <div class="plan-group-toggle">
                                        <Show when={isCollapsed()} fallback={<ChevronUp size={16} />}>
                                            <ChevronDown size={16} />
                                        </Show>
                                    </div>
                                </div>

                                <Show when={!isCollapsed()}>
                                    <div class="plan-group-body">
                                        <For each={plans}>
                                            {(sub) => (
                                                <div class="plan-variant">
                                                    <div class="plan-variant-main">
                                                        <div class="plan-variant-interval">
                                                            <span class={`plan-interval-tag plan-interval-${sub.interval}`}>
                                                                {INTERVAL_LABELS[sub.interval] || sub.interval}
                                                            </span>
                                                        </div>
                                                        <div class="plan-variant-price">
                                                            <span class="plan-price-value">{formatPrice(sub.amount, sub.currency)}</span>
                                                            <Show when={sub.interval !== "one_time"}>
                                                                <span class="plan-price-period">
                                                                    / {formatInterval(sub.interval, sub.intervalCount).toLowerCase()}
                                                                </span>
                                                            </Show>
                                                        </div>
                                                        <div class="plan-variant-subscribers">
                                                            <Users size={13} />
                                                            <span>{sub.activeSubscribers || 0}</span>
                                                        </div>
                                                        <div class="plan-variant-status">
                                                            <Show when={sub.trialDays > 0}>
                                                                <span class="badge badge-info" title={`${sub.trialDays}-day free trial available`}>
                                                                    Trial · {sub.trialDays}d
                                                                </span>
                                                            </Show>
                                                            <Show when={sub.squadEnabled}>
                                                                <span class="badge badge-info" title="Group/family subscription enabled">
                                                                    Squad · {sub.squadMaxMembers ? `max ${sub.squadMaxMembers}` : '∞'}
                                                                </span>
                                                            </Show>
                                                            <Show when={sub.renewalMode === "provider_managed"}>
                                                                <span class="badge badge-info" title="Provider manages recurring billing">
                                                                    Auto-renew
                                                                </span>
                                                            </Show>
                                                            <span class={`badge ${sub.isActive ? "badge-active" : "badge-expired"}`}>
                                                                {sub.isActive ? "Active" : "Inactive"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div class="plan-variant-actions">
                                                        <button
                                                            class="btn btn-ghost btn-sm btn-icon"
                                                            title={copiedId() === sub.id ? "Copied!" : "Copy plan ID"}
                                                            onClick={() => copyId(sub.id)}
                                                        >
                                                            <Show when={copiedId() === sub.id} fallback={<Copy size={14} />}>
                                                                <Check size={14} style="color: var(--success)" />
                                                            </Show>
                                                        </button>
                                                        <button class="btn btn-ghost btn-sm" onClick={() => openEdit(sub)}>Edit</button>
                                                        <button class="btn btn-danger btn-sm" onClick={() => remove(sub.id)}>Delete</button>
                                                    </div>
                                                </div>
                                            )}
                                        </For>
                                    </div>
                                </Show>
                            </div>
                        );
                    }}
                </For>
            </div>

            <Show when={showModal()}>
                <div class="modal-overlay" onClick={() => setShowModal(false)}>
                    <div class="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>{editing() ? "Edit" : "Create"} Plan</h2>
                        <Show when={formError()}>
                            <div class="error-msg">{formError()}</div>
                        </Show>
                        <div class="form-group">
                            <label>Name</label>
                            <input value={form().name} onInput={(e) => setForm({ ...form(), name: e.target.value })} placeholder="e.g. Pro" />
                            <div class="form-hint">Plans with the same name will be grouped together</div>
                        </div>
                        <div class="form-group">
                            <label>Description</label>
                            <textarea value={form().description} onInput={(e) => setForm({ ...form(), description: e.target.value })} rows={2} placeholder="Optional description" />
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Price</label>
                                <div class="amount-input-wrap">
                                    <span class="amount-currency-prefix">{form().currency}</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={form().displayAmount}
                                        onInput={(e) => handleAmountInput(e.target.value)}
                                        placeholder="0.00"
                                        class="amount-input"
                                    />
                                </div>
                                <Show when={form().displayAmount}>
                                    <div class="form-hint">{displayToMinor(form().displayAmount)} minor units</div>
                                </Show>
                            </div>
                            <div class="form-group">
                                <label>Currency</label>
                                <input
                                    value={form().currency}
                                    onInput={(e) => setForm({ ...form(), currency: e.target.value.toUpperCase() })}
                                    placeholder="USD"
                                    maxLength={3}
                                    style="text-transform: uppercase"
                                />
                            </div>
                        </div>
                        <div class={form().interval === "one_time" ? "" : "form-row"}>
                            <div class="form-group">
                                <label>Billing Period</label>
                                <select value={form().interval} onChange={(e) => {
                                    const interval = e.target.value;
                                    setForm({ ...form(), interval, renewalMode: interval === "one_time" ? "manual" : form().renewalMode });
                                }}>
                                    <option value="day">Day</option>
                                    <option value="week">Week</option>
                                    <option value="month">Month</option>
                                    <option value="year">Year</option>
                                    <option value="one_time">One-time</option>
                                </select>
                            </div>
                            <Show when={form().interval !== "one_time"}>
                                <div class="form-group">
                                    <label>Every N periods</label>
                                    <input type="number" min="1" value={form().intervalCount} onInput={(e) => setForm({ ...form(), intervalCount: e.target.value })} />
                                    <div class="form-hint">
                                        e.g. 3 {INTERVAL_UNITS[form().interval] || ""} = billed every {form().intervalCount || 1} {INTERVAL_UNITS[form().interval] || ""}
                                    </div>
                                </div>
                            </Show>
                        </div>

                        <Show when={form().interval !== "one_time"}>
                            <div class="form-group">
                                <label>Trial Period (Days)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={form().trialDays}
                                    onInput={(e) => setForm({ ...form(), trialDays: e.target.value })}
                                    placeholder="0"
                                />
                                <div class="form-hint">0 = no trial. Programmatic activation via SDK.</div>
                            </div>
                        </Show>

                        <div class="form-group">
                            <label>Renewal Mode</label>
                            <div class="renewal-radio-group">
                                <label class="renewal-radio">
                                    <input
                                        type="radio"
                                        name="renewalMode"
                                        value="manual"
                                        checked={form().renewalMode === "manual"}
                                        onChange={() => setForm({ ...form(), renewalMode: "manual" })}
                                    />
                                    <div class="renewal-radio-content">
                                        <span class="renewal-radio-title">Manual</span>
                                        <span class="renewal-radio-desc">User re-purchases when period ends</span>
                                    </div>
                                </label>
                                <label class={`renewal-radio ${form().interval === "one_time" ? "renewal-radio-disabled" : ""}`}>
                                    <input
                                        type="radio"
                                        name="renewalMode"
                                        value="provider_managed"
                                        checked={form().renewalMode === "provider_managed"}
                                        disabled={form().interval === "one_time"}
                                        onChange={() => setForm({ ...form(), renewalMode: "provider_managed" })}
                                    />
                                    <div class="renewal-radio-content">
                                        <span class="renewal-radio-title">Provider-managed</span>
                                        <span class="renewal-radio-desc">Provider handles recurring, sends webhooks</span>
                                    </div>
                                </label>
                            </div>
                            <Show when={form().interval === "one_time"}>
                                <div class="form-hint" style="color: var(--warning)">One-time plans are always manual</div>
                            </Show>
                        </div>
                        <div class="form-group">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer">
                                <input
                                    type="checkbox"
                                    checked={form().squadEnabled}
                                    onChange={(e) => setForm({ ...form(), squadEnabled: e.target.checked })}
                                    style="width: 16px; height: 16px; accent-color: var(--primary)"
                                />
                                Enable Squads (group/family subscriptions)
                            </label>
                            <div class="form-hint">Allow subscribers to create squads and share access with members</div>
                        </div>
                        <Show when={form().squadEnabled}>
                            <div class="form-group">
                                <label>Max members per squad</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={form().squadMaxMembers}
                                    onInput={(e) => setForm({ ...form(), squadMaxMembers: e.target.value })}
                                />
                                <div class="form-hint">Maximum members excluding the owner. 0 = unlimited.</div>
                            </div>
                        </Show>

                        {/* Metadata key-value editor */}
                        <div class="form-group">
                            <label style="display: flex; justify-content: space-between; align-items: center">
                                <span>Metadata</span>
                                <button
                                    type="button"
                                    class="btn btn-ghost btn-sm"
                                    onClick={() => setMetaRows(metaRows.length, { key: "", value: "" })}
                                >
                                    + Add field
                                </button>
                            </label>
                            <Show when={metaRows.length === 0}>
                                <div class="form-hint">No metadata fields. Click "+ Add field" to add custom properties.</div>
                            </Show>
                            <div class="meta-rows">
                                <For each={metaRows}>
                                    {(row, i) => (
                                        <div class="meta-row">
                                            <input
                                                class="meta-key"
                                                placeholder="key"
                                                value={row.key}
                                                onInput={(e) => setMetaRows(i(), "key", e.target.value)}
                                            />
                                            <span class="meta-sep">=</span>
                                            <input
                                                class="meta-value"
                                                placeholder="value"
                                                value={row.value}
                                                onInput={(e) => setMetaRows(i(), "value", e.target.value)}
                                            />
                                            <button
                                                type="button"
                                                class="btn btn-ghost btn-sm btn-icon meta-remove"
                                                title="Remove"
                                                onClick={() => setMetaRows((r) => r.filter((_, idx) => idx !== i()))}
                                            >✕</button>
                                        </div>
                                    )}
                                </For>
                            </div>
                            <div class="form-hint">Custom properties for your app (e.g. max_proxies, features). Numbers are auto-cast.</div>
                        </div>

                        <div class="modal-actions">
                            <button class="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                            <button class="btn btn-primary" onClick={save} disabled={saving()}>
                                {saving() ? "Saving..." : editing() ? "Save changes" : "Create plan"}
                            </button>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
}
