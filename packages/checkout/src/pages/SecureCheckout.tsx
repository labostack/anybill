/** SecureCheckout page — token-based checkout. Resolves a secure link token
 *  via /api/checkout/resolve/:token, then renders the same two-column
 *  Stripe-style layout as the regular Checkout page. */
import { createSignal, onMount, For, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ArrowLeft, Lock, ShieldCheck, AlertTriangle } from "lucide-solid";

const API = "/api/checkout";

export function SecureCheckout() {
    const params = useParams<{ token: string }>();
    const [info, setInfo] = createSignal<any>(null);
    const [selectedProvider, setSelectedProvider] = createSignal("");
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal("");
    const [tokenError, setTokenError] = createSignal("");
    const [referrerUrl, setReferrerUrl] = createSignal("");

    onMount(async () => {
        // Capture referrer for "back" button (like Stripe)
        if (document.referrer && new URL(document.referrer).origin !== window.location.origin) {
            setReferrerUrl(document.referrer);
        }
        try {
            const res = await fetch(`${API}/resolve/${params.token}`);
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(
                    data?.message || "This checkout link has expired or is invalid"
                );
            }
            const data = await res.json();

            // resolve returns subscription, providers, and checkoutConfig
            setInfo(data);
            if (data.providers.length === 1) setSelectedProvider(data.providers[0].id);
        } catch (err: any) {
            setTokenError(err.message);
        }
    });

    const pay = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${API}/pay`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token: params.token,
                    provider: selectedProvider(),
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || "Payment failed");
            }
            const { paymentUrl, invoiceId } = await res.json();

            // Store invoiceId for confirm page
            sessionStorage.setItem("anybill_invoice", invoiceId);

            // Redirect to payment gateway
            window.location.href = paymentUrl;
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    const formatPrice = (amount: number, currency: string) => {
        return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
    };

    const intervalLabel = (interval: string, count: number) => {
        if (interval === "one_time") return "one-time payment";
        const unit = count > 1 ? `${count} ${interval}s` : interval;
        return `per ${unit}`;
    };

    return (
        <Show when={!tokenError()} fallback={
            <div class="confirm-container">
                <div class="confirm-card">
                    <div class="token-error">
                        <AlertTriangle size={32} />
                        <div class="token-error-title">Link expired</div>
                        <div class="token-error-message">{tokenError()}</div>
                    </div>
                </div>
            </div>
        }>
            <Show when={info()} fallback={
                <div class="confirm-container">
                    <Show when={error()}>
                        <div class="confirm-card">
                            <div class="error-msg">{error()}</div>
                        </div>
                    </Show>
                    <Show when={!error()}>
                        <div class="spinner" />
                    </Show>
                </div>
            }>
                <div class="checkout-layout">
                    {/* ─── Left Column: Product Summary ─── */}
                    <div class="checkout-left">
                        <div class="checkout-left-inner">
                            {/* Back to referrer */}
                            <Show when={referrerUrl()}>
                                <a class="checkout-back" href={referrerUrl()}>
                                    <ArrowLeft size={16} />
                                    <span>Back</span>
                                </a>
                            </Show>

                            {/* Brand */}
                            <div class="checkout-brand">
                                <Show when={info().checkoutConfig?.logoUrl}>
                                    <div class="checkout-brand-icon">
                                        <img src={info().checkoutConfig.logoUrl} alt="Logo" />
                                    </div>
                                </Show>
                                <span class="checkout-brand-name">
                                    {info().checkoutConfig?.brandName || "Checkout"}
                                </span>
                            </div>

                            {/* Product */}
                            <div class="product-name">{info().subscription.name}</div>
                            <div class="product-price">
                                {formatPrice(info().subscription.amount, info().subscription.currency)}
                            </div>
                            <div class="product-interval">
                                {intervalLabel(info().subscription.interval, info().subscription.intervalCount)}
                            </div>

                            {/* Order Summary */}
                            <div class="order-summary">
                                <div class="order-row">
                                    <div>
                                        <div class="order-item-name">{info().subscription.name}</div>
                                        <Show when={info().subscription.description}>
                                            <div class="order-item-desc">{info().subscription.description}</div>
                                        </Show>
                                    </div>
                                    <div class="order-item-price">
                                        {formatPrice(info().subscription.amount, info().subscription.currency)}
                                    </div>
                                </div>
                                <div class="order-total">
                                    <span class="order-total-label">Total due today</span>
                                    <span class="order-total-value">
                                        {formatPrice(info().subscription.amount, info().subscription.currency)}
                                    </span>
                                </div>
                            </div>

                            {/* Powered by */}
                            <Show when={!info().checkoutConfig?.hidePoweredBy}>
                                <div class="powered-by">
                                    <Lock size={12} />
                                    Powered by <a href="https://github.com/dortanes/anybill" target="_blank" rel="noopener noreferrer">anybill</a>
                                </div>
                            </Show>
                        </div>
                    </div>

                    {/* ─── Right Column: Payment ─── */}
                    <div class="checkout-right">
                        <div class="checkout-right-inner">
                            <div class="payment-section-title">Pay with</div>

                            <Show when={error()}>
                                <div class="error-msg">{error()}</div>
                            </Show>

                            <div class="payment-section-label">Payment method</div>

                            <div class="provider-list">
                                <For each={info().providers}>
                                    {(provider: { id: string; displayName: string }) => (
                                        <label
                                            class={`provider-option ${selectedProvider() === provider.id ? "selected" : ""}`}
                                            onClick={() => setSelectedProvider(provider.id)}
                                        >
                                            <input
                                                type="radio"
                                                name="provider"
                                                checked={selectedProvider() === provider.id}
                                            />
                                            <div class="provider-radio" />
                                            <span class="provider-name">
                                                {provider.displayName}
                                            </span>
                                        </label>
                                    )}
                                </For>
                            </div>

                            <button
                                class="pay-btn"
                                disabled={!selectedProvider() || loading()}
                                onClick={pay}
                            >
                                {loading()
                                    ? "Processing..."
                                    : `Pay ${formatPrice(info().subscription.amount, info().subscription.currency)}`
                                }
                            </button>

                            <div class="security-info">
                                <ShieldCheck size={14} />
                                <span>Your payment is processed securely. We never store your card details.</span>
                            </div>
                        </div>
                    </div>
                </div>
            </Show>
        </Show>
    );
}
