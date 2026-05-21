/** Coupons page — promo code management with CRUD modal, status badges, plan restriction, and filters. */
import { createSignal, createMemo, onMount, For, Show } from "solid-js";
import { api } from "../api/client";
import { Plus, Ticket, Pencil, Trash2, Search, X } from "lucide-solid";

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

export function Coupons() {
    const [coupons, setCoupons] = createSignal<any[]>([]);
    const [showModal, setShowModal] = createSignal(false);
    const [editing, setEditing] = createSignal<any>(null);
    const [formError, setFormError] = createSignal("");
    const [saving, setSaving] = createSignal(false);
    const [subscriptions, setSubscriptions] = createSignal<any[]>([]);

    // Filters
    const [searchCode, setSearchCode] = createSignal("");
    const [filterStatus, setFilterStatus] = createSignal("");
    const [filterType, setFilterType] = createSignal("");
    const [filterPlan, setFilterPlan] = createSignal("");

    // Form signals
    const [formCode, setFormCode] = createSignal("");
    const [formType, setFormType] = createSignal("percent");
    const [formValue, setFormValue] = createSignal("");
    const [formDisplayValue, setFormDisplayValue] = createSignal(""); // masked display for fixed amount
    const [formCurrency, setFormCurrency] = createSignal("USD");
    const [formMaxRedemptions, setFormMaxRedemptions] = createSignal("");
    const [formMaxPerUser, setFormMaxPerUser] = createSignal("1");
    const [formMinAmount, setFormMinAmount] = createSignal("");
    const [formDisplayMinAmount, setFormDisplayMinAmount] = createSignal(""); // masked display for min amount
    const [formExpiry, setFormExpiry] = createSignal("");
    const [formSubIds, setFormSubIds] = createSignal<string[]>([]);
    const [formIsActive, setFormIsActive] = createSignal(true);

    const load = async () => {
        const data = await api.get("/coupons");
        setCoupons(data);
    };

    const loadSubscriptions = async () => {
        const data = await api.get("/subscriptions");
        setSubscriptions(data);
    };

    onMount(() => {
        load();
        loadSubscriptions();
    });

    const formatAmount = (amount: number, currency: string) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);

    const getStatus = (c: any) => {
        if (!c.isActive) return "inactive";
        if (c.expiresAt && new Date(c.expiresAt) < new Date()) return "expired";
        if (c.maxRedemptions && c.timesRedeemed >= c.maxRedemptions) return "exhausted";
        return "active";
    };

    const statusBadgeClass = (status: string) => {
        switch (status) {
            case "active": return "badge-active";
            case "expired": return "badge-expired";
            case "exhausted": return "badge-pending";
            case "inactive": return "badge-cancelled";
            default: return "";
        }
    };

    // Filtered coupons
    const filtered = createMemo(() => {
        const q = searchCode().toLowerCase().trim();
        return coupons().filter(c => {
            if (q && !c.code.toLowerCase().includes(q)) return false;
            if (filterType() && c.type !== filterType()) return false;
            if (filterStatus()) {
                const s = getStatus(c);
                if (s !== filterStatus()) return false;
            }
            if (filterPlan()) {
                const ids: string[] = c.subscriptionIds || [];
                if (ids.length > 0 && !ids.includes(filterPlan())) return false;
            }
            return true;
        });
    });

    const hasFilters = createMemo(() => searchCode() || filterStatus() || filterType() || filterPlan());

    const clearFilters = () => {
        setSearchCode(""); setFilterStatus(""); setFilterType(""); setFilterPlan("");
    };

    /** Format amount input — allow digits and one dot, max 2 decimals */
    const handleAmountInput = (raw: string, setter: (v: string) => void) => {
        let cleaned = raw.replace(/[^0-9.]/g, "");
        const parts = cleaned.split(".");
        if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
        if (parts.length === 2 && parts[1].length > 2) {
            cleaned = parts[0] + "." + parts[1].slice(0, 2);
        }
        setter(cleaned);
    };

    const openCreate = () => {
        setEditing(null);
        setFormCode("");
        setFormType("percent");
        setFormValue("");
        setFormDisplayValue("");
        setFormCurrency("USD");
        setFormMaxRedemptions("");
        setFormMaxPerUser("1");
        setFormMinAmount("");
        setFormDisplayMinAmount("");
        setFormExpiry("");
        setFormSubIds([]);
        setFormIsActive(true);
        setFormError("");
        setShowModal(true);
    };

    const openEdit = (coupon: any) => {
        setEditing(coupon);
        setFormCode(coupon.code);
        setFormType(coupon.type);
        setFormValue(coupon.type === "percent" ? String(coupon.value) : "");
        setFormDisplayValue(coupon.type === "fixed" ? minorToDisplay(coupon.value) : "");
        setFormCurrency(coupon.currency || "USD");
        setFormMaxRedemptions(coupon.maxRedemptions ? String(coupon.maxRedemptions) : "");
        setFormMaxPerUser(coupon.maxRedemptionsPerUser ? String(coupon.maxRedemptionsPerUser) : "1");
        setFormMinAmount(coupon.minAmount ? String(coupon.minAmount) : "");
        setFormDisplayMinAmount(coupon.minAmount ? minorToDisplay(coupon.minAmount) : "");
        setFormExpiry(coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 16) : "");
        setFormSubIds(coupon.subscriptionIds || []);
        setFormIsActive(coupon.isActive);
        setFormError("");
        setShowModal(true);
    };

    const save = async () => {
        setFormError("");
        setSaving(true);
        try {
            if (editing()) {
                // Edit mode — only editable fields
                const body: any = {
                    isActive: formIsActive(),
                };
                if (formMaxRedemptions()) body.maxRedemptions = Number(formMaxRedemptions());
                if (formMaxPerUser()) body.maxRedemptionsPerUser = Number(formMaxPerUser());
                const minAmt = formType() === 'fixed' ? displayToMinor(formDisplayMinAmount()) : Number(formMinAmount());
                if (minAmt > 0) body.minAmount = minAmt;
                if (formExpiry()) body.expiresAt = new Date(formExpiry()).toISOString();
                else body.expiresAt = null;
                if (formSubIds().length > 0) body.subscriptionIds = formSubIds();
                else body.subscriptionIds = [];

                await api.put(`/coupons/${editing().id}`, body);
            } else {
                // Create mode
                const body: any = {
                    code: formCode().toUpperCase(),
                    type: formType(),
                    value: formType() === "percent" ? Number(formValue()) : displayToMinor(formDisplayValue()),
                };
                if (formType() === "fixed") body.currency = formCurrency().toUpperCase();
                if (formMaxRedemptions()) body.maxRedemptions = Number(formMaxRedemptions());
                if (formMaxPerUser()) body.maxRedemptionsPerUser = Number(formMaxPerUser());
                const minAmt = formType() === 'fixed' ? displayToMinor(formDisplayMinAmount()) : Number(formMinAmount());
                if (minAmt > 0) body.minAmount = minAmt;
                if (formExpiry()) body.expiresAt = new Date(formExpiry()).toISOString();
                if (formSubIds().length > 0) body.subscriptionIds = formSubIds();

                await api.post("/coupons", body);
            }
            setShowModal(false);
            load();
        } catch (err: any) {
            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const remove = async (coupon: any) => {
        if (coupon.timesRedeemed > 0) {
            alert("Cannot delete a coupon that has been used. You can deactivate it instead.");
            return;
        }
        if (!confirm("Delete this coupon? This action cannot be undone.")) return;
        try {
            await api.del(`/coupons/${coupon.id}`);
            load();
        } catch (err: any) {
            alert(err.message);
        }
    };

    const toggleSubId = (id: string) => {
        setFormSubIds((prev) =>
            prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
        );
    };

    const formatDate = (date: string) =>
        new Date(date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });

    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Coupons</h1>
                    <p class="page-description">Create and manage discount codes</p>
                </div>
                <button class="btn btn-primary" onClick={openCreate}>
                    <Plus size={16} /> Create coupon
                </button>
            </div>

            {/* Toolbar */}
            <div class="plans-toolbar" style="margin-bottom: 20px">
                <div class="search-wrap">
                    <Search size={14} class="search-icon" />
                    <input
                        class="search-input"
                        placeholder="Search by code..."
                        value={searchCode()}
                        onInput={(e) => setSearchCode(e.target.value)}
                    />
                    <Show when={searchCode()}>
                        <button class="search-clear" onClick={() => setSearchCode("")}><X size={12} /></button>
                    </Show>
                </div>
                <div class="filters">
                    <select value={filterStatus()} onChange={(e) => setFilterStatus(e.target.value)}>
                        <option value="">All statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="expired">Expired</option>
                        <option value="exhausted">Exhausted</option>
                    </select>
                    <select value={filterType()} onChange={(e) => setFilterType(e.target.value)}>
                        <option value="">All types</option>
                        <option value="percent">Percentage</option>
                        <option value="fixed">Fixed amount</option>
                    </select>
                    <select value={filterPlan()} onChange={(e) => setFilterPlan(e.target.value)}>
                        <option value="">All plans</option>
                        <For each={subscriptions()}>{(s: any) =>
                            <option value={s.id}>{s.name}</option>
                        }</For>
                    </select>
                    <Show when={hasFilters()}>
                        <button class="btn btn-ghost btn-sm" onClick={clearFilters} style="color: var(--text-muted)">
                            <X size={13} /> Clear
                        </button>
                    </Show>
                </div>
            </div>

            <Show when={filtered().length === 0}>
                <div class="card">
                    <div class="empty-state">
                        <Ticket size={40} />
                        <h3>{hasFilters() ? "No coupons match filters" : "No coupons yet"}</h3>
                        <p>{hasFilters() ? "Try adjusting your filters" : "Create your first coupon to offer discounts"}</p>
                    </div>
                </div>
            </Show>

            <Show when={filtered().length > 0}>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Type</th>
                                <th>Usage</th>
                                <th>Min. Amount</th>
                                <th>Plans</th>
                                <th>Status</th>
                                <th>Expires</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={filtered()}>
                                {(c: any) => {
                                    const status = () => getStatus(c);
                                    return (
                                        <tr>
                                            <td>
                                                <span class="badge" style="font-family: monospace; background: rgba(255,255,255,0.05); color: var(--text); letter-spacing: 0.5px">
                                                    {c.code}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="badge" style="background: rgba(99,179,237,0.1); color: var(--accent)">
                                                    {c.type === "percent"
                                                        ? `${c.value}%`
                                                        : formatAmount(c.value, c.currency || "USD")
                                                    }
                                                </span>
                                            </td>
                                            <td>{c.timesRedeemed} / {c.maxRedemptions || "∞"}</td>
                                            <td>
                                                {c.minAmount
                                                    ? formatAmount(c.minAmount, c.currency || "USD")
                                                    : "—"
                                                }
                                            </td>
                                            <td>
                                                {!c.subscriptionIds || c.subscriptionIds.length === 0
                                                    ? "All"
                                                    : <span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary)">{c.subscriptionIds.length} plan{c.subscriptionIds.length !== 1 ? "s" : ""}</span>
                                                }
                                            </td>
                                            <td>
                                                <span class={`badge ${statusBadgeClass(status())}`}>
                                                    {status()}
                                                </span>
                                            </td>
                                            <td>{c.expiresAt ? formatDate(c.expiresAt) : "Never"}</td>
                                            <td>
                                                <div style="display: flex; gap: 4px">
                                                    <button
                                                        class="btn btn-ghost btn-sm btn-icon"
                                                        title="Edit"
                                                        onClick={() => openEdit(c)}
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        class="btn btn-danger btn-sm btn-icon"
                                                        title="Delete"
                                                        onClick={() => remove(c)}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }}
                            </For>
                        </tbody>
                    </table>
                </div>
            </Show>

            {/* Create / Edit Modal */}
            <Show when={showModal()}>
                <div class="modal-overlay" onClick={() => setShowModal(false)}>
                    <div class="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>{editing() ? "Edit Coupon" : "Create Coupon"}</h2>
                        <Show when={formError()}>
                            <div class="error-msg">{formError()}</div>
                        </Show>

                        <div class="form-group">
                            <label>Code</label>
                            <input
                                value={formCode()}
                                onInput={(e) => setFormCode(e.target.value.toUpperCase())}
                                placeholder="e.g. SAVE20"
                                disabled={!!editing()}
                                style={editing() ? "opacity: 0.5" : ""}
                            />
                            <Show when={editing()}>
                                <div class="form-hint" style="color: var(--warning)">Cannot be changed after creation</div>
                            </Show>
                        </div>

                        <div class="form-group">
                            <label>Type</label>
                            <select
                                value={formType()}
                                onChange={(e) => setFormType(e.target.value)}
                                disabled={!!editing()}
                                style={editing() ? "opacity: 0.5" : ""}
                            >
                                <option value="percent">Percentage</option>
                                <option value="fixed">Fixed amount</option>
                            </select>
                            <Show when={editing()}>
                                <div class="form-hint" style="color: var(--warning)">Cannot be changed after creation</div>
                            </Show>
                        </div>

                        <div class="form-group">
                            <label>{formType() === "percent" ? "Discount (%)" : "Discount"}</label>
                            <Show when={formType() === "percent"} fallback={
                                <>
                                    <div class="amount-input-wrap">
                                        <span class="amount-currency-prefix">{formCurrency()}</span>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={formDisplayValue()}
                                            onInput={(e) => handleAmountInput(e.target.value, setFormDisplayValue)}
                                            placeholder="0.00"
                                            class="amount-input"
                                            disabled={!!editing()}
                                            style={editing() ? "opacity: 0.5" : ""}
                                        />
                                    </div>
                                    <Show when={formDisplayValue()}>
                                        <div class="form-hint">{displayToMinor(formDisplayValue())} minor units</div>
                                    </Show>
                                </>
                            }>
                                <input
                                    type="number"
                                    value={formValue()}
                                    onInput={(e) => setFormValue(e.target.value)}
                                    placeholder="20"
                                    disabled={!!editing()}
                                    style={editing() ? "opacity: 0.5" : ""}
                                />
                                <div class="form-hint">e.g. 20 = 20% off</div>
                            </Show>
                            <Show when={editing()}>
                                <div class="form-hint" style="color: var(--warning)">Cannot be changed after creation</div>
                            </Show>
                        </div>

                        <Show when={formType() === "fixed"}>
                            <div class="form-group">
                                <label>Currency</label>
                                <input
                                    value={formCurrency()}
                                    onInput={(e) => setFormCurrency(e.target.value.toUpperCase())}
                                    placeholder="USD"
                                    maxLength={3}
                                    style={editing() ? "opacity: 0.5; text-transform: uppercase" : "text-transform: uppercase"}
                                    disabled={!!editing()}
                                />
                                <Show when={editing()}>
                                    <div class="form-hint" style="color: var(--warning)">Cannot be changed after creation</div>
                                </Show>
                            </div>
                        </Show>

                        <div class="form-row">
                            <div class="form-group">
                                <label>Max redemptions</label>
                                <input
                                    type="number"
                                    value={formMaxRedemptions()}
                                    onInput={(e) => setFormMaxRedemptions(e.target.value)}
                                    placeholder="Unlimited"
                                    min="0"
                                />
                            </div>
                            <div class="form-group">
                                <label>Max per user</label>
                                <input
                                    type="number"
                                    value={formMaxPerUser()}
                                    onInput={(e) => setFormMaxPerUser(e.target.value)}
                                    min="0"
                                />
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Min. order amount</label>
                            <Show when={formType() === "fixed"} fallback={
                                <>
                                    <input
                                        type="number"
                                        value={formMinAmount()}
                                        onInput={(e) => setFormMinAmount(e.target.value)}
                                        placeholder="No minimum"
                                        min="0"
                                    />
                                    <div class="form-hint">In minor units of the plan's currency (e.g. 1000 = 10.00)</div>
                                </>
                            }>
                                <div class="amount-input-wrap">
                                    <span class="amount-currency-prefix">{formCurrency()}</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={formDisplayMinAmount()}
                                        onInput={(e) => handleAmountInput(e.target.value, setFormDisplayMinAmount)}
                                        placeholder="0.00"
                                        class="amount-input"
                                    />
                                </div>
                                <Show when={formDisplayMinAmount()}>
                                    <div class="form-hint">{displayToMinor(formDisplayMinAmount())} minor units</div>
                                </Show>
                            </Show>
                        </div>

                        <div class="form-group">
                            <label>Expiry date</label>
                            <input
                                type="datetime-local"
                                value={formExpiry()}
                                onInput={(e) => setFormExpiry(e.target.value)}
                            />
                        </div>

                        <Show when={editing()}>
                            <div class="form-group">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer">
                                    <input
                                        type="checkbox"
                                        checked={formIsActive()}
                                        onChange={(e) => setFormIsActive(e.target.checked)}
                                        style="width: 16px; height: 16px; accent-color: var(--primary)"
                                    />
                                    Active
                                </label>
                                <div class="form-hint">Deactivate to prevent further redemptions</div>
                            </div>
                        </Show>

                        <div class="form-group">
                            <label>Restrict to plans</label>
                            <div class="form-hint" style="margin-bottom: 10px">Leave all unchecked to apply to all plans</div>
                            <Show when={subscriptions().length > 0} fallback={
                                <div class="form-hint">No plans found</div>
                            }>
                                <div class="webhook-events-grid">
                                    <For each={subscriptions()}>
                                        {(sub: any) => (
                                            <label class="webhook-event-check">
                                                <input
                                                    type="checkbox"
                                                    checked={formSubIds().includes(sub.id)}
                                                    onChange={() => toggleSubId(sub.id)}
                                                />
                                                <span>{sub.name} — {new Intl.NumberFormat("en-US", { style: "currency", currency: sub.currency }).format(sub.amount / 100)}</span>
                                            </label>
                                        )}
                                    </For>
                                </div>
                            </Show>
                        </div>

                        <div class="modal-actions">
                            <button class="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                            <button class="btn btn-primary" onClick={save} disabled={saving() || (!editing() && !formCode())}>
                                {saving() ? "Saving..." : editing() ? "Save changes" : "Create coupon"}
                            </button>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
}
