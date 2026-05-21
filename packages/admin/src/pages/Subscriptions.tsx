/** Subscriptions page — plan management with interval-accordion sub-groups, search, filters, and "Add variant" shortcut. */
import { createSignal, createMemo, onMount, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { api } from "../api/client";
import { Plus, ChevronDown, ChevronUp, Users, Copy, Check, Search, X, FileText, DollarSign, RefreshCw, Tag, GripVertical } from "lucide-solid";

type PlanTab = "basics" | "pricing" | "billing" | "squads" | "metadata";

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

function minorToDisplay(minor: string | number): string {
    const n = typeof minor === "string" ? parseInt(minor, 10) : minor;
    if (!n && n !== 0) return "";
    return (n / 100).toFixed(2);
}

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
    // Two levels of collapse: plan group + interval sub-group
    const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
    const [collapsedInterval, setCollapsedInterval] = createSignal<Record<string, boolean>>({});
    const [form, setForm] = createSignal({ name: "", description: "", displayAmount: "", currency: "USD", interval: "month", intervalCount: "1", squadEnabled: false, squadMaxMembers: "0", trialDays: "0" });
    const [metaRows, setMetaRows] = createStore<{ key: string; value: string }[]>([]);
    const [formError, setFormError] = createSignal("");
    const [saving, setSaving] = createSignal(false);
    const [planTab, setPlanTab] = createSignal<PlanTab>("basics");

    // Filters
    const [search, setSearch] = createSignal("");
    const [filterCurrency, setFilterCurrency] = createSignal("");
    const [filterStatus, setFilterStatus] = createSignal("");
    const [filterInterval, setFilterInterval] = createSignal("");

    const load = async () => {
        const data = await api.get("/subscriptions");
        setItems(data);
    };

    onMount(load);

    // All unique currencies in data
    const currencies = createMemo(() => {
        const set = new Set<string>();
        for (const s of items()) set.add(s.currency);
        return [...set].sort();
    });

    // All unique intervals in data
    const intervals = createMemo(() => {
        const set = new Set<string>();
        for (const s of items()) set.add(s.interval);
        return [...set].sort((a, b) => (INTERVAL_ORDER[a] ?? 99) - (INTERVAL_ORDER[b] ?? 99));
    });

    // Filtered items
    const filtered = createMemo(() => {
        const q = search().toLowerCase().trim();
        return items().filter(sub => {
            if (filterCurrency() && sub.currency !== filterCurrency()) return false;
            if (filterStatus() === "active" && !sub.isActive) return false;
            if (filterStatus() === "inactive" && sub.isActive) return false;
            if (filterInterval() && sub.interval !== filterInterval()) return false;
            if (q) {
                const nameMatch = sub.name.toLowerCase().includes(q);
                const priceMatch = (sub.amount / 100).toFixed(2).includes(q);
                if (!nameMatch && !priceMatch) return false;
            }
            return true;
        });
    });

    const hasActiveFilters = createMemo(() =>
        search() || filterCurrency() || filterStatus() || filterInterval()
    );

    // Group by name, preserve API sort order
    const grouped = createMemo(() => {
        const groups: Record<string, any[]> = {};
        const order: string[] = [];
        for (const sub of filtered()) {
            if (!groups[sub.name]) {
                groups[sub.name] = [];
                order.push(sub.name);
            }
            groups[sub.name].push(sub);
        }
        return order.map(name => [name, groups[name]] as [string, any[]]);
    });

    // Drag and Drop
    const [draggedName, setDraggedName] = createSignal<string | null>(null);
    const [dragOverName, setDragOverName] = createSignal<string | null>(null);

    const handleDragStart = (name: string, e: DragEvent) => {
        setDraggedName(name);
        if (e.dataTransfer) {
            e.dataTransfer.setData("text/plain", name);
            e.dataTransfer.effectAllowed = "move";
        }
    };

    const handleDragOver = (name: string, e: DragEvent) => {
        e.preventDefault();
        if (draggedName() !== name) {
            setDragOverName(name);
        }
    };

    const handleDragLeave = (name: string, e: DragEvent) => {
        if (dragOverName() === name) {
            setDragOverName(null);
        }
    };

    const handleDrop = async (targetName: string, e: DragEvent) => {
        e.preventDefault();
        setDragOverName(null);
        const sourceName = draggedName();
        if (!sourceName || sourceName === targetName) {
            setDraggedName(null);
            return;
        }

        const currentOrder = grouped().map(g => g[0]);
        const sourceIdx = currentOrder.indexOf(sourceName);
        const targetIdx = currentOrder.indexOf(targetName);
        
        currentOrder.splice(sourceIdx, 1);
        currentOrder.splice(targetIdx, 0, sourceName);
        
        const sortedItems = [...items()].sort((a, b) => {
            return currentOrder.indexOf(a.name) - currentOrder.indexOf(b.name);
        });
        setItems(sortedItems);

        const currentIds = sortedItems.map(p => p.id);

        try {
            await api.put("/subscriptions/reorder", { ids: currentIds });
        } catch (err) {
            console.error("Reorder failed", err);
            load();
        }
        setDraggedName(null);
    };

    // Sub-group plans by interval inside a group, returning ordered array
    const byInterval = (plans: any[]) => {
        const groups: Record<string, any[]> = {};
        for (const p of plans) {
            if (!groups[p.interval]) groups[p.interval] = [];
            groups[p.interval].push(p);
        }
        // Sort variants within interval by amount ascending
        for (const k in groups) {
            groups[k].sort((a: any, b: any) => a.amount - b.amount);
        }
        return Object.entries(groups).sort(
            ([a], [b]) => (INTERVAL_ORDER[a] ?? 99) - (INTERVAL_ORDER[b] ?? 99)
        );
    };

    const toggleCollapse = (name: string) =>
        setCollapsed(prev => ({ ...prev, [name]: !prev[name] }));

    const toggleInterval = (key: string) =>
        setCollapsedInterval(prev => ({ ...prev, [key]: !prev[key] }));

    const openCreate = (prefillName?: string) => {
        setEditing(null);
        setForm({ name: prefillName || "", description: "", displayAmount: "", currency: "USD", interval: "month", intervalCount: "1", squadEnabled: false, squadMaxMembers: "0", trialDays: "0" });
        setMetaRows([]);
        setFormError("");
        setPlanTab("basics");
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
            squadEnabled: sub.squadEnabled || false,
            squadMaxMembers: String(sub.squadMaxMembers || 0),
            trialDays: String(sub.trialDays || 0),
        });
        const meta = sub.metadata && typeof sub.metadata === "object" ? sub.metadata : {};
        setMetaRows(Object.entries(meta).map(([key, value]) => ({ key, value: String(value) })));
        setFormError("");
        setPlanTab("basics");
        setShowModal(true);
    };

    const save = async () => {
        setFormError("");
        setSaving(true);
        try {
            const amount = displayToMinor(form().displayAmount);
            const metadata: Record<string, any> = {};
            for (const { key, value } of metaRows) {
                const k = key.trim();
                if (!k) continue;
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
        if (!confirm("Delete this subscription plan? This cannot be undone.")) return;
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

    const handleAmountInput = (raw: string) => {
        let cleaned = raw.replace(/[^0-9.]/g, "");
        const parts = cleaned.split(".");
        if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
        if (parts.length === 2 && parts[1].length > 2) {
            cleaned = parts[0] + "." + parts[1].slice(0, 2);
        }
        setForm({ ...form(), displayAmount: cleaned });
    };

    const clearFilters = () => {
        setSearch("");
        setFilterCurrency("");
        setFilterStatus("");
        setFilterInterval("");
    };

    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Plans</h1>
                    <p class="page-description">Manage your subscription plans</p>
                </div>
                <button class="btn btn-primary" onClick={() => openCreate()}>
                    <Plus size={16} />
                    Create plan
                </button>
            </div>

            {/* Toolbar */}
            <div class="plans-toolbar">
                <div class="search-wrap">
                    <Search size={14} class="search-icon" />
                    <input
                        class="search-input"
                        placeholder="Search by name or price..."
                        value={search()}
                        onInput={(e) => setSearch(e.target.value)}
                    />
                    <Show when={search()}>
                        <button class="search-clear" onClick={() => setSearch("")}><X size={12} /></button>
                    </Show>
                </div>
                <div class="filters">
                    <select value={filterCurrency()} onChange={(e) => setFilterCurrency(e.target.value)}>
                        <option value="">All currencies</option>
                        <For each={currencies()}>{(c) => <option value={c}>{c}</option>}</For>
                    </select>
                    <select value={filterInterval()} onChange={(e) => setFilterInterval(e.target.value)}>
                        <option value="">All intervals</option>
                        <For each={intervals()}>{(i) => <option value={i}>{INTERVAL_LABELS[i] || i}</option>}</For>
                    </select>
                    <select value={filterStatus()} onChange={(e) => setFilterStatus(e.target.value)}>
                        <option value="">All statuses</option>
                        <option value="active">Active only</option>
                        <option value="inactive">Inactive only</option>
                    </select>
                    <Show when={hasActiveFilters()}>
                        <button class="btn btn-ghost btn-sm" onClick={clearFilters} style="color: var(--text-muted)">
                            <X size={13} /> Clear
                        </button>
                    </Show>
                </div>
            </div>

            <Show when={grouped().length === 0}>
                <div class="plan-groups-empty">
                    <p class="text-muted" style="text-align: center; padding: 48px 20px; font-size: 14px">
                        {hasActiveFilters() ? "No plans match your filters." : "No plans yet. Create your first plan to get started."}
                    </p>
                </div>
            </Show>

            <div class="plan-groups">
                <For each={grouped()}>
                    {([name, plans]) => {
                        const status = () => getGroupStatus(plans);
                        const isCollapsed = () => collapsed()[name] ?? false;
                        const intervalGroups = () => byInterval(plans);

                        return (
                            <div 
                                class={`plan-group ${dragOverName() === name ? 'plan-group-drag-over' : ''} ${draggedName() === name ? 'plan-group-dragging' : ''}`}
                                draggable={!hasActiveFilters()}
                                onDragStart={(e) => handleDragStart(name, e)}
                                onDragOver={(e) => handleDragOver(name, e)}
                                onDragLeave={(e) => handleDragLeave(name, e)}
                                onDrop={(e) => handleDrop(name, e)}
                            >
                                <div class="plan-group-header" onClick={() => toggleCollapse(name)}>
                                    <div class="plan-group-info" style="display: flex; align-items: center; gap: 12px;">
                                        <Show when={!hasActiveFilters()}>
                                            <div class="drag-handle" style="cursor: grab; color: var(--text-muted); display: flex;" onClick={(e) => e.stopPropagation()}>
                                                <GripVertical size={16} />
                                            </div>
                                        </Show>
                                        <div>
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
                                    </div>
                                    <div class="plan-group-header-right">
                                        <button
                                            class="btn btn-ghost btn-sm plan-add-variant"
                                            title="Add a variant with this plan name"
                                            onClick={(e) => { e.stopPropagation(); openCreate(name); }}
                                        >
                                            <Plus size={13} /> Add variant
                                        </button>
                                        <div class="plan-group-toggle">
                                            <Show when={isCollapsed()} fallback={<ChevronUp size={16} />}>
                                                <ChevronDown size={16} />
                                            </Show>
                                        </div>
                                    </div>
                                </div>

                                <Show when={!isCollapsed()}>
                                    <div class="plan-group-body">
                                        <For each={intervalGroups()}>
                                            {([interval, variants], idx) => {
                                                const iKey = `${name}__${interval}`;
                                                const isOpen = () => !(collapsedInterval()[iKey] ?? false);
                                                const totalSubs = variants.reduce((s: number, v: any) => s + (v.activeSubscribers || 0), 0);

                                                // Show separator only when previous section is open (has visible rows)
                                                const prevIsOpen = () => {
                                                    if (idx() === 0) return false;
                                                    const prevInterval = intervalGroups()[idx() - 1][0];
                                                    const prevKey = `${name}__${prevInterval}`;
                                                    return !(collapsedInterval()[prevKey] ?? false);
                                                };

                                                return (
                                                    <>
                                                        {/* Separator only when previous accordion is expanded */}
                                                        <Show when={idx() > 0 && intervalGroups().length > 1 && prevIsOpen()}>
                                                            <div class="plan-interval-sep" />
                                                        </Show>
                                                        <div class="plan-interval-accordion">
                                                        {/* Accordion header — only shown when multiple interval types */}
                                                        <Show when={intervalGroups().length > 1}>
                                                            <button
                                                                class="plan-interval-accordion-header"
                                                                onClick={() => toggleInterval(iKey)}
                                                            >
                                                                <span class={`plan-interval-tag plan-interval-${interval}`}>
                                                                    {INTERVAL_LABELS[interval] || interval}
                                                                </span>
                                                                <span class="plan-interval-accordion-meta">
                                                                    {variants.length} {variants.length === 1 ? "variant" : "variants"}
                                                                    <Show when={totalSubs > 0}>
                                                                        <span class="plan-interval-accordion-subs">
                                                                            <Users size={11} /> {totalSubs}
                                                                        </span>
                                                                    </Show>
                                                                </span>
                                                                <span class="plan-interval-accordion-chevron">
                                                                    <Show when={isOpen()} fallback={<ChevronDown size={14} />}>
                                                                        <ChevronUp size={14} />
                                                                    </Show>
                                                                </span>
                                                            </button>
                                                        </Show>

                                                        <Show when={isOpen()}>
                                                            <For each={variants}>
                                                                {(sub) => (
                                                                    <div class={`plan-variant ${!sub.isActive ? "plan-variant-inactive" : ""}`}>
                                                                        <div class="plan-variant-main">
                                                                            <div class="plan-variant-interval">
                                                                                <Show when={intervalGroups().length === 1}>
                                                                                    <span class={`plan-interval-tag plan-interval-${interval}`}>
                                                                                        {INTERVAL_LABELS[interval] || interval}
                                                                                    </span>
                                                                                </Show>
                                                                            </div>
                                                                            <div class="plan-variant-price">
                                                                                <span class="plan-price-value">{formatPrice(sub.amount, sub.currency)}</span>
                                                                                <span class="plan-price-period">
                                                                                    {sub.interval !== "one_time"
                                                                                        ? `/ ${formatInterval(sub.interval, sub.intervalCount).toLowerCase()}`
                                                                                        : "one-time"}
                                                                                </span>
                                                                            </div>
                                                                            <div class="plan-variant-currency-tag">{sub.currency}</div>
                                                                            <div class="plan-variant-badges">
                                                                                <Show when={sub.trialDays > 0}>
                                                                                    <span class="badge badge-info">Trial · {sub.trialDays}d</span>
                                                                                </Show>
                                                                                <Show when={sub.squadEnabled}>
                                                                                    <span class="badge badge-info">Squad{sub.squadMaxMembers ? ` · ${sub.squadMaxMembers}` : ""}</span>
                                                                                </Show>

                                                                                <span class={`badge ${sub.isActive ? "badge-active" : "badge-expired"}`}>
                                                                                    {sub.isActive ? "Active" : "Inactive"}
                                                                                </span>
                                                                            </div>
                                                                            <div class="plan-variant-subscribers">
                                                                                <Users size={12} />
                                                                                <span>{sub.activeSubscribers || 0}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div class="plan-variant-actions">
                                                                            <button
                                                                                class="btn btn-ghost btn-sm btn-icon"
                                                                                title={copiedId() === sub.id ? "Copied!" : "Copy plan ID"}
                                                                                onClick={() => copyId(sub.id)}
                                                                            >
                                                                                <Show when={copiedId() === sub.id} fallback={<Copy size={13} />}>
                                                                                    <Check size={13} style="color: var(--success)" />
                                                                                </Show>
                                                                            </button>
                                                                            <button class="btn btn-ghost btn-sm" onClick={() => openEdit(sub)}>Edit</button>
                                                                            <button class="btn btn-danger btn-sm" onClick={() => remove(sub.id)}>Delete</button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </For>
                                                        </Show>
                                                        </div>
                                                    </>
                                                );
                                            }}
                                        </For>
                                    </div>
                                </Show>
                            </div>
                        );
                    }}
                </For>
            </div>

            {/* Create / Edit Modal — Tabbed */}
            <Show when={showModal()}>
                <div class="modal-overlay" onClick={() => setShowModal(false)}>
                    <div class="plan-modal" onClick={(e) => e.stopPropagation()}>
                        {/* Left sidebar with icon tabs */}
                        <div class="plan-modal-sidebar">
                            <div class="plan-modal-title">
                                <span class="plan-modal-title-text">{editing() ? "Edit" : "New"} Plan</span>
                            </div>
                            <nav class="plan-modal-tabs">
                                <button
                                    class={`plan-modal-tab ${planTab() === "basics" ? "plan-modal-tab-active" : ""}`}
                                    onClick={() => setPlanTab("basics")}
                                    title="Basics"
                                >
                                    <FileText size={18} />
                                    <span>Basics</span>
                                </button>
                                <button
                                    class={`plan-modal-tab ${planTab() === "pricing" ? "plan-modal-tab-active" : ""}`}
                                    onClick={() => setPlanTab("pricing")}
                                    title="Pricing"
                                >
                                    <DollarSign size={18} />
                                    <span>Pricing</span>
                                </button>
                                <button
                                    class={`plan-modal-tab ${planTab() === "billing" ? "plan-modal-tab-active" : ""}`}
                                    onClick={() => setPlanTab("billing")}
                                    title="Billing"
                                >
                                    <RefreshCw size={18} />
                                    <span>Billing</span>
                                </button>
                                <button
                                    class={`plan-modal-tab ${planTab() === "squads" ? "plan-modal-tab-active" : ""}`}
                                    onClick={() => setPlanTab("squads")}
                                    title="Squads"
                                >
                                    <Users size={18} />
                                    <span>Squads</span>
                                </button>
                                <button
                                    class={`plan-modal-tab ${planTab() === "metadata" ? "plan-modal-tab-active" : ""}`}
                                    onClick={() => setPlanTab("metadata")}
                                    title="Metadata"
                                >
                                    <Tag size={18} />
                                    <span>Metadata</span>
                                </button>
                            </nav>
                            <div class="plan-modal-sidebar-footer">
                                <Show when={form().name}>
                                    <div class="plan-modal-preview-name">{form().name || "—"}</div>
                                </Show>
                                <Show when={form().displayAmount}>
                                    <div class="plan-modal-preview-price">
                                        {form().currency} {form().displayAmount}
                                        <span class="plan-modal-preview-interval">/ {form().interval}</span>
                                    </div>
                                </Show>
                            </div>
                        </div>

                        {/* Right content panel */}
                        <div class="plan-modal-content">
                            <div class="plan-modal-scroll-area">
                                <Show when={formError()}>
                                    <div class="error-msg">{formError()}</div>
                                </Show>

                            {/* ── Tab: Basics ───────────────────────── */}
                            <Show when={planTab() === "basics"}>
                                <div class="plan-modal-section">
                                    <div class="plan-modal-section-header">
                                        <FileText size={16} />
                                        <h3>Basic Info</h3>
                                    </div>
                                    <p class="plan-modal-section-desc">The plan name and optional description visible to customers</p>
                                    <div class="form-group">
                                        <label>Plan Name</label>
                                        <input
                                            value={form().name}
                                            onInput={(e) => setForm({ ...form(), name: e.target.value })}
                                            placeholder="e.g. Pro, Starter, Enterprise"
                                            autofocus
                                        />
                                        <div class="form-hint">Plans with the same name are grouped together as variants</div>
                                    </div>
                                    <div class="form-group">
                                        <label>Description <span style="color: var(--text-muted); font-weight: 400">(optional)</span></label>
                                        <textarea
                                            value={form().description}
                                            onInput={(e) => setForm({ ...form(), description: e.target.value })}
                                            rows={4}
                                            placeholder="Describe what's included in this plan..."
                                        />
                                    </div>
                                </div>
                            </Show>

                            {/* ── Tab: Pricing ──────────────────────── */}
                            <Show when={planTab() === "pricing"}>
                                <div class="plan-modal-section">
                                    <div class="plan-modal-section-header">
                                        <DollarSign size={16} />
                                        <h3>Pricing</h3>
                                    </div>
                                    <p class="plan-modal-section-desc">Set the amount, currency and billing interval</p>
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
                                            <div class="form-hint">ISO 4217 code (USD, EUR, GBP…)</div>
                                        </div>
                                    </div>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label>Billing Period</label>
                                            <select value={form().interval} onChange={(e) => {
                                                const interval = e.target.value;
                                                setForm({ ...form(), interval });
                                            }}>
                                                <option value="day">Daily</option>
                                                <option value="week">Weekly</option>
                                                <option value="month">Monthly</option>
                                                <option value="year">Yearly</option>
                                                <option value="one_time">One-time</option>
                                            </select>
                                        </div>
                                        <Show when={form().interval !== "one_time"}>
                                            <div class="form-group">
                                                <label>Every N periods</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={form().intervalCount}
                                                    onInput={(e) => setForm({ ...form(), intervalCount: e.target.value })}
                                                />
                                                <div class="form-hint">
                                                    Bills every {form().intervalCount || 1} {INTERVAL_UNITS[form().interval] || "period(s)"}
                                                </div>
                                            </div>
                                        </Show>
                                        <Show when={form().interval === "one_time"}>
                                            <div class="form-group">
                                                <label style="color: var(--text-muted)">Interval count</label>
                                                <input type="number" value="1" disabled style="opacity: 0.4" />
                                                <div class="form-hint">Not applicable for one-time payments</div>
                                            </div>
                                        </Show>
                                    </div>
                                </div>
                            </Show>

                            {/* ── Tab: Billing ──────────────────────── */}
                            <Show when={planTab() === "billing"}>
                                <div class="plan-modal-section">
                                    <div class="plan-modal-section-header">
                                        <RefreshCw size={16} />
                                        <h3>Billing Behavior</h3>
                                    </div>
                                    <p class="plan-modal-section-desc">Configure trial periods and renewal handling</p>

                                    <div class="form-group">
                                        <label>Trial Period</label>
                                        <div class="plan-trial-input">
                                            <input
                                                type="number"
                                                min="0"
                                                value={form().trialDays}
                                                onInput={(e) => setForm({ ...form(), trialDays: e.target.value })}
                                                placeholder="0"
                                                disabled={form().interval === "one_time"}
                                                style={form().interval === "one_time" ? "opacity: 0.4" : ""}
                                            />
                                            <span class="plan-trial-unit">days</span>
                                        </div>
                                        <Show when={form().interval === "one_time"}>
                                            <div class="form-hint" style="color: var(--warning)">Trials not available for one-time plans</div>
                                        </Show>
                                        <Show when={form().interval !== "one_time"}>
                                            <div class="form-hint">Set to 0 to disable. Activated programmatically via SDK.</div>
                                        </Show>
                                    </div>


                                </div>
                            </Show>

                            {/* ── Tab: Squads ───────────────────────── */}
                            <Show when={planTab() === "squads"}>
                                <div class="plan-modal-section">
                                    <div class="plan-modal-section-header">
                                        <Users size={16} />
                                        <h3>Squads</h3>
                                    </div>
                                    <p class="plan-modal-section-desc">Allow subscribers to create group / family subscriptions and share access</p>

                                    <div class="plan-squad-toggle-card">
                                        <div class="plan-squad-toggle-info">
                                            <div class="plan-squad-toggle-title">Enable Squads</div>
                                            <div class="plan-squad-toggle-desc">Subscribers can create a squad and invite members who share their access</div>
                                        </div>
                                        <label class="toggle-row" style="margin-bottom: 0">
                                            <input
                                                type="checkbox"
                                                checked={form().squadEnabled}
                                                onChange={(e) => setForm({ ...form(), squadEnabled: e.target.checked })}
                                            />
                                        </label>
                                    </div>

                                    <Show when={form().squadEnabled}>
                                        <div class="form-group" style="margin-top: 20px">
                                            <label>Max members per squad</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={form().squadMaxMembers}
                                                onInput={(e) => setForm({ ...form(), squadMaxMembers: e.target.value })}
                                                placeholder="0"
                                            />
                                            <div class="form-hint">Members excluding the owner. Set to 0 for unlimited.</div>
                                        </div>
                                    </Show>

                                    <Show when={!form().squadEnabled}>
                                        <div class="plan-squad-disabled-hint">
                                            <Users size={32} />
                                            <span>Enable squads to allow group subscriptions</span>
                                        </div>
                                    </Show>
                                </div>
                            </Show>

                            {/* ── Tab: Metadata ─────────────────────── */}
                            <Show when={planTab() === "metadata"}>
                                <div class="plan-modal-section">
                                    <div class="plan-modal-section-header">
                                        <Tag size={16} />
                                        <h3>Metadata</h3>
                                    </div>
                                    <p class="plan-modal-section-desc">Custom key–value properties attached to this plan (e.g. max_proxies, features)</p>

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

                                    <button
                                        type="button"
                                        class="btn btn-ghost btn-sm plan-meta-add-btn"
                                        onClick={() => setMetaRows(metaRows.length, { key: "", value: "" })}
                                    >
                                        <Plus size={13} /> Add field
                                    </button>

                                    <Show when={metaRows.length === 0}>
                                        <div class="plan-meta-empty">
                                            <Tag size={28} />
                                            <span>No metadata fields yet</span>
                                        </div>
                                    </Show>
                                    <div class="form-hint" style="margin-top: 12px">Numbers are auto-cast. Strings remain as strings.</div>
                                </div>
                            </Show>
                            </div>

                            {/* Footer actions */}
                            <div class="plan-modal-actions">
                                <button class="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button class="btn btn-primary" onClick={save} disabled={saving()}>
                                    {saving() ? "Saving..." : editing() ? "Save changes" : "Create plan"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
}
