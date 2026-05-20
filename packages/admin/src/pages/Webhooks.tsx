/** Webhooks page — outgoing endpoint management, secret rotation, and delivery logs. */
import { createSignal, onMount, For, Show } from "solid-js";
import { api } from "../api/client";
import { Plus, Trash2, RotateCw, Send, ChevronDown, ChevronUp, Copy, Check, ToggleLeft, ToggleRight } from "lucide-solid";

const EVENT_TYPES = [
    "payment.confirmed",
    "payment.failed",
    "payment.refunded",
    "payment.cancelled",
    "subscription.renewed",
    "subscription.expired",
];

export function Webhooks() {
    const [endpoints, setEndpoints] = createSignal<any[]>([]);
    const [deliveries, setDeliveries] = createSignal<any[]>([]);
    const [showModal, setShowModal] = createSignal(false);
    const [newUrl, setNewUrl] = createSignal("");
    const [newDesc, setNewDesc] = createSignal("");
    const [newEvents, setNewEvents] = createSignal<string[]>([]);
    const [createdSecret, setCreatedSecret] = createSignal<string | null>(null);
    const [expandedEndpoint, setExpandedEndpoint] = createSignal<string | null>(null);
    const [copiedId, setCopiedId] = createSignal<string | null>(null);
    const [deliveryPage, setDeliveryPage] = createSignal(1);
    const [deliveryTotal, setDeliveryTotal] = createSignal(0);
    const [rotatedSecret, setRotatedSecret] = createSignal<string | null>(null);

    const loadEndpoints = async () => {
        const data = await api.get("/webhooks");
        setEndpoints(data);
    };

    const loadDeliveries = async (endpointId?: string, page = 1) => {
        const params = new URLSearchParams();
        if (endpointId) params.set("endpoint_id", endpointId);
        params.set("page", String(page));
        params.set("limit", "15");
        const data = await api.get(`/webhooks/deliveries?${params}`);
        setDeliveries(data.deliveries);
        setDeliveryTotal(data.total);
        setDeliveryPage(data.page);
    };

    onMount(() => {
        loadEndpoints();
        loadDeliveries();
    });

    const createEndpoint = async () => {
        const result = await api.post("/webhooks", {
            url: newUrl(),
            description: newDesc() || null,
            events: newEvents(),
        });
        setCreatedSecret(result.secret);
        setShowModal(false);
        setNewUrl("");
        setNewDesc("");
        setNewEvents([]);
        loadEndpoints();
    };

    const deleteEndpoint = async (id: string) => {
        if (!confirm("Delete this webhook endpoint? All delivery history will be lost.")) return;
        await api.del(`/webhooks/${id}`);
        loadEndpoints();
        loadDeliveries();
    };

    const toggleActive = async (ep: any) => {
        await api.put(`/webhooks/${ep.id}`, { isActive: !ep.isActive });
        loadEndpoints();
    };

    const rotateSecret = async (id: string) => {
        if (!confirm("Rotate signing secret? The old secret will stop working immediately.")) return;
        const result = await api.post(`/webhooks/${id}/rotate-secret`);
        setRotatedSecret(result.secret);
    };

    const sendTest = async (id: string) => {
        await api.post(`/webhooks/${id}/test`);
        setTimeout(() => loadDeliveries(), 1000);
    };

    const copyText = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    const toggleEventSelection = (event: string) => {
        setNewEvents((prev) =>
            prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
        );
    };

    const getStatusColor = (status: string) => {
        if (status === "success") return "var(--success)";
        if (status === "failed") return "var(--danger)";
        return "var(--warning)";
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    };

    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Webhooks</h1>
                    <p class="page-description">Send events to your backend when payments happen</p>
                </div>
                <button class="btn btn-primary" onClick={() => setShowModal(true)}>
                    <Plus size={16} />
                    Add endpoint
                </button>
            </div>

            {/* Created Secret Banner */}
            <Show when={createdSecret()}>
                <div class="webhook-secret-banner">
                    <div class="webhook-secret-header">
                        <div>
                            <div class="webhook-secret-title">Signing secret created</div>
                            <div class="webhook-secret-subtitle">Copy this secret — it won't be shown again</div>
                        </div>
                        <button class="btn btn-ghost btn-sm" onClick={() => setCreatedSecret(null)}>Dismiss</button>
                    </div>
                    <div class="webhook-secret-value">
                        <code>{createdSecret()}</code>
                        <button
                            class="btn btn-ghost btn-sm btn-icon"
                            onClick={() => copyText(createdSecret()!, "created-secret")}
                        >
                            <Show when={copiedId() === "created-secret"} fallback={<Copy size={14} />}>
                                <Check size={14} style="color: var(--success)" />
                            </Show>
                        </button>
                    </div>
                </div>
            </Show>

            {/* Rotated Secret Banner */}
            <Show when={rotatedSecret()}>
                <div class="webhook-secret-banner">
                    <div class="webhook-secret-header">
                        <div>
                            <div class="webhook-secret-title">New signing secret</div>
                            <div class="webhook-secret-subtitle">The old secret has been invalidated</div>
                        </div>
                        <button class="btn btn-ghost btn-sm" onClick={() => setRotatedSecret(null)}>Dismiss</button>
                    </div>
                    <div class="webhook-secret-value">
                        <code>{rotatedSecret()}</code>
                        <button
                            class="btn btn-ghost btn-sm btn-icon"
                            onClick={() => copyText(rotatedSecret()!, "rotated-secret")}
                        >
                            <Show when={copiedId() === "rotated-secret"} fallback={<Copy size={14} />}>
                                <Check size={14} style="color: var(--success)" />
                            </Show>
                        </button>
                    </div>
                </div>
            </Show>

            {/* Endpoints List */}
            <Show when={endpoints().length === 0}>
                <div class="card">
                    <div class="empty-state">
                        <Send size={40} />
                        <h3>No webhook endpoints</h3>
                        <p>Add an endpoint to start receiving payment events on your server</p>
                    </div>
                </div>
            </Show>

            <div class="webhook-endpoints">
                <For each={endpoints()}>
                    {(ep) => {
                        const isExpanded = () => expandedEndpoint() === ep.id;

                        return (
                            <div class={`webhook-endpoint ${ep.isActive ? "" : "webhook-endpoint-disabled"}`}>
                                <div class="webhook-endpoint-header">
                                    <div class="webhook-endpoint-main">
                                        <div class="webhook-endpoint-url">
                                            <span class={`webhook-dot ${ep.isActive ? "webhook-dot-active" : "webhook-dot-inactive"}`} />
                                            {ep.url}
                                        </div>
                                        <div class="webhook-endpoint-meta">
                                            <Show when={ep.description}>
                                                <span>{ep.description}</span>
                                                <span class="webhook-meta-sep">·</span>
                                            </Show>
                                            <span>{ep.events?.length ? `${ep.events.length} events` : "All events"}</span>
                                            <span class="webhook-meta-sep">·</span>
                                            <span>{ep.totalDeliveries} deliveries</span>
                                            <Show when={ep.failedDeliveries > 0}>
                                                <span class="webhook-meta-sep">·</span>
                                                <span style="color: var(--danger)">{ep.failedDeliveries} failed</span>
                                            </Show>
                                        </div>
                                    </div>
                                    <div class="webhook-endpoint-actions">
                                        <button
                                            class="btn btn-ghost btn-sm btn-icon"
                                            title={ep.isActive ? "Disable" : "Enable"}
                                            onClick={() => toggleActive(ep)}
                                        >
                                            <Show when={ep.isActive} fallback={<ToggleLeft size={16} />}>
                                                <ToggleRight size={16} style="color: var(--success)" />
                                            </Show>
                                        </button>
                                        <button
                                            class="btn btn-ghost btn-sm btn-icon"
                                            title="Send test event"
                                            onClick={() => sendTest(ep.id)}
                                        >
                                            <Send size={14} />
                                        </button>
                                        <button
                                            class="btn btn-ghost btn-sm btn-icon"
                                            title="Rotate secret"
                                            onClick={() => rotateSecret(ep.id)}
                                        >
                                            <RotateCw size={14} />
                                        </button>
                                        <button
                                            class="btn btn-ghost btn-sm btn-icon"
                                            title={isExpanded() ? "Hide deliveries" : "Show deliveries"}
                                            onClick={() => {
                                                if (isExpanded()) {
                                                    setExpandedEndpoint(null);
                                                } else {
                                                    setExpandedEndpoint(ep.id);
                                                    loadDeliveries(ep.id);
                                                }
                                            }}
                                        >
                                            <Show when={isExpanded()} fallback={<ChevronDown size={14} />}>
                                                <ChevronUp size={14} />
                                            </Show>
                                        </button>
                                        <button
                                            class="btn btn-danger btn-sm btn-icon"
                                            title="Delete"
                                            onClick={() => deleteEndpoint(ep.id)}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Masked secret */}
                                <div class="webhook-endpoint-secret">
                                    <span class="font-mono text-sm text-muted">
                                        {ep.secret}
                                    </span>
                                </div>

                                {/* Expanded: delivery log */}
                                <Show when={isExpanded()}>
                                    <div class="webhook-deliveries">
                                        <div class="webhook-deliveries-title">Recent deliveries</div>
                                        <Show when={deliveries().length === 0}>
                                            <p class="text-muted text-sm" style="padding: 16px 0">No deliveries yet</p>
                                        </Show>
                                        <For each={deliveries()}>
                                            {(d) => (
                                                <div class="webhook-delivery-row">
                                                    <span
                                                        class="webhook-delivery-status"
                                                        style={`color: ${getStatusColor(d.status)}`}
                                                    >
                                                        ●
                                                    </span>
                                                    <span class="webhook-delivery-event">{d.event}</span>
                                                    <span class="webhook-delivery-code">
                                                        <Show when={d.responseCode} fallback="—">
                                                            {d.responseCode}
                                                        </Show>
                                                    </span>
                                                    <span class="webhook-delivery-attempts">{d.attempts} attempt{d.attempts !== 1 ? "s" : ""}</span>
                                                    <span class="webhook-delivery-time">{formatDate(d.createdAt)}</span>
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

            {/* All Deliveries Section */}
            <Show when={!expandedEndpoint() && endpoints().length > 0}>
                <div class="card" style="margin-top: 24px">
                    <div class="card-title">All Deliveries</div>
                    <Show when={deliveries().length === 0}>
                        <p class="text-muted text-sm">No deliveries recorded yet. Events will appear here once payments are processed.</p>
                    </Show>
                    <For each={deliveries()}>
                        {(d) => (
                            <div class="webhook-delivery-row">
                                <span
                                    class="webhook-delivery-status"
                                    style={`color: ${getStatusColor(d.status)}`}
                                >
                                    ●
                                </span>
                                <span class="webhook-delivery-event">{d.event}</span>
                                <span class="webhook-delivery-code">
                                    <Show when={d.responseCode} fallback="—">
                                        {d.responseCode}
                                    </Show>
                                </span>
                                <span class="webhook-delivery-attempts">{d.attempts} attempt{d.attempts !== 1 ? "s" : ""}</span>
                                <span class="webhook-delivery-time">{formatDate(d.createdAt)}</span>
                            </div>
                        )}
                    </For>
                </div>
            </Show>

            {/* Create Endpoint Modal */}
            <Show when={showModal()}>
                <div class="modal-overlay" onClick={() => setShowModal(false)}>
                    <div class="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Add Webhook Endpoint</h2>
                        <div class="form-group">
                            <label>Endpoint URL</label>
                            <input
                                value={newUrl()}
                                onInput={(e) => setNewUrl(e.target.value)}
                                placeholder="https://myapp.com/webhooks/anybill"
                            />
                            <div class="form-hint">We'll send POST requests with JSON body to this URL</div>
                        </div>
                        <div class="form-group">
                            <label>Description (optional)</label>
                            <input
                                value={newDesc()}
                                onInput={(e) => setNewDesc(e.target.value)}
                                placeholder="e.g. Production server"
                            />
                        </div>
                        <div class="form-group">
                            <label>Events to listen to</label>
                            <div class="form-hint" style="margin-bottom: 10px">Leave all unchecked to receive all events</div>
                            <div class="webhook-events-grid">
                                <For each={EVENT_TYPES}>
                                    {(event) => (
                                        <label class="webhook-event-check">
                                            <input
                                                type="checkbox"
                                                checked={newEvents().includes(event)}
                                                onChange={() => toggleEventSelection(event)}
                                            />
                                            <span>{event}</span>
                                        </label>
                                    )}
                                </For>
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button class="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                            <button class="btn btn-primary" onClick={createEndpoint} disabled={!newUrl()}>
                                Create endpoint
                            </button>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
}
