/** API Keys page — create, rename, revoke API keys with masked display. */
import { createSignal, onMount, For, Show } from "solid-js";
import { api } from "../api/client";
import { Plus, Copy, Check, Trash2, Key, Eye, EyeOff } from "lucide-solid";

interface ApiKeyItem {
    id: string;
    name: string;
    key?: string;       // only present right after creation
    prefix: string;
    lastUsedAt: string | null;
    createdAt: string;
}

export function ApiKeys() {
    const [keys, setKeys] = createSignal<ApiKeyItem[]>([]);
    const [showCreate, setShowCreate] = createSignal(false);
    const [newName, setNewName] = createSignal("");
    const [newlyCreated, setNewlyCreated] = createSignal<ApiKeyItem | null>(null);
    const [copied, setCopied] = createSignal(false);
    const [revealed, setRevealed] = createSignal(false);
    const [renameId, setRenameId] = createSignal<string | null>(null);
    const [renameName, setRenameName] = createSignal("");

    const load = async () => {
        const data = await api.get<ApiKeyItem[]>("/api-keys");
        setKeys(data);
    };

    onMount(load);

    const create = async () => {
        if (!newName().trim()) return;
        const data = await api.post<ApiKeyItem>("/api-keys", { name: newName().trim() });
        setNewlyCreated(data);
        setShowCreate(false);
        setNewName("");
        setCopied(false);
        setRevealed(false);
        load();
    };

    const copyKey = async (key: string) => {
        await navigator.clipboard.writeText(key);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const dismissCreated = () => {
        setNewlyCreated(null);
        setCopied(false);
        setRevealed(false);
    };

    const startRename = (key: ApiKeyItem) => {
        setRenameId(key.id);
        setRenameName(key.name);
    };

    const saveRename = async () => {
        const id = renameId();
        if (!id || !renameName().trim()) return;
        await api.post(`/api-keys/${id}/rename`, { name: renameName().trim() });
        setRenameId(null);
        load();
    };

    const cancelRename = () => {
        setRenameId(null);
    };

    const revoke = async (id: string, name: string) => {
        if (!confirm(`Revoke API key "${name}"? This action cannot be undone.`)) return;
        await api.del(`/api-keys/${id}`);
        load();
    };

    const formatDate = (d: string | null) => {
        if (!d) return "Never";
        return new Date(d).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const timeAgo = (d: string | null) => {
        if (!d) return "Never used";
        const diff = Date.now() - new Date(d).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "Just now";
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        return formatDate(d);
    };

    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">API Keys</h1>
                    <p class="page-description">Manage keys for SDK and API access</p>
                </div>
                <button class="btn btn-primary" onClick={() => setShowCreate(true)}>
                    <Plus size={16} />
                    Create key
                </button>
            </div>

            {/* Newly created key banner */}
            <Show when={newlyCreated()}>
                <div class="apikey-created-banner">
                    <div class="apikey-created-header">
                        <div class="apikey-created-icon">
                            <Key size={20} />
                        </div>
                        <div>
                            <div class="apikey-created-title">Key created — copy it now</div>
                            <div class="apikey-created-subtitle">
                                This is the only time the full key will be shown. Store it securely.
                            </div>
                        </div>
                        <button class="btn btn-ghost btn-sm" onClick={dismissCreated}>Dismiss</button>
                    </div>
                    <div class="apikey-created-value">
                        <code>{revealed() ? newlyCreated()!.key : "•".repeat(48)}</code>
                        <div class="flex gap-2">
                            <button
                                class="btn btn-ghost btn-icon"
                                onClick={() => setRevealed(!revealed())}
                                title={revealed() ? "Hide" : "Reveal"}
                            >
                                {revealed() ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                            <button
                                class="btn btn-ghost btn-icon"
                                onClick={() => copyKey(newlyCreated()!.key!)}
                                title="Copy to clipboard"
                            >
                                {copied() ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                        </div>
                    </div>
                </div>
            </Show>

            {/* Keys list */}
            <div class="apikey-list">
                <For each={keys()} fallback={
                    <div class="empty-state">
                        <Key size={48} />
                        <h3>No API keys yet</h3>
                        <p>Create an API key to authenticate SDK requests from your application.</p>
                    </div>
                }>
                    {(k) => (
                        <div class="apikey-row">
                            <div class="apikey-row-main">
                                <div class="apikey-row-icon">
                                    <Key size={16} />
                                </div>
                                <div class="apikey-row-info">
                                    <Show when={renameId() === k.id} fallback={
                                        <div class="apikey-row-name" onClick={() => startRename(k)}>
                                            {k.name}
                                        </div>
                                    }>
                                        <div class="apikey-rename-form">
                                            <input
                                                value={renameName()}
                                                onInput={(e) => setRenameName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") saveRename();
                                                    if (e.key === "Escape") cancelRename();
                                                }}
                                                autofocus
                                            />
                                            <button class="btn btn-primary btn-sm" onClick={saveRename}>Save</button>
                                            <button class="btn btn-ghost btn-sm" onClick={cancelRename}>Cancel</button>
                                        </div>
                                    </Show>
                                    <div class="apikey-row-meta">
                                        <code class="apikey-row-prefix">{k.prefix}</code>
                                        <span class="apikey-row-sep">·</span>
                                        <span>Created {formatDate(k.createdAt)}</span>
                                        <span class="apikey-row-sep">·</span>
                                        <span>Last used: {timeAgo(k.lastUsedAt)}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="apikey-row-actions">
                                <button
                                    class="btn btn-danger btn-sm"
                                    onClick={() => revoke(k.id, k.name)}
                                >
                                    <Trash2 size={14} />
                                    Revoke
                                </button>
                            </div>
                        </div>
                    )}
                </For>
            </div>

            {/* Create Modal */}
            <Show when={showCreate()}>
                <div class="modal-overlay" onClick={() => setShowCreate(false)}>
                    <div class="modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Create API Key</h2>
                        <div class="form-group">
                            <label>Name</label>
                            <input
                                value={newName()}
                                onInput={(e) => setNewName(e.target.value)}
                                placeholder="e.g. Production, Staging, Local Dev"
                                onKeyDown={(e) => { if (e.key === "Enter") create(); }}
                                autofocus
                            />
                            <div class="form-hint">A label to help you identify this key later</div>
                        </div>
                        <div class="modal-actions">
                            <button class="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                            <button class="btn btn-primary" onClick={create}>
                                <Key size={16} />
                                Create key
                            </button>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
}
