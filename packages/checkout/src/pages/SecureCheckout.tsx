/** SecureCheckout page — token-based checkout. Resolves a secure link token
 *  via /api/checkout/resolve/:token, then renders the same two-column
 *  Stripe-style layout as the regular Checkout page. */
import { createSignal, onMount, For, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ArrowLeft, Lock, ShieldCheck, AlertTriangle, Ticket } from "lucide-solid";

const API = "/api/checkout";

export function SecureCheckout() {
    const params = useParams<{ token: string }>();
    const [info, setInfo] = createSignal<any>(null);
    const [selectedProvider, setSelectedProvider] = createSignal("");
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal("");
    const [tokenError, setTokenError] = createSignal("");
    const [referrerUrl, setReferrerUrl] = createSignal("");

    // Coupon signals
    const [couponCode, setCouponCode] = createSignal("");
    const [couponApplied, setCouponApplied] = createSignal<any>(null);
    const [couponError, setCouponError] = createSignal("");
    const [applyingCoupon, setApplyingCoupon] = createSignal(false);
    const [showCouponInput, setShowCouponInput] = createSignal(false);

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

            // Pre-applied coupon from resolve
            if (data.coupon) {
                setCouponApplied(data.coupon);
            }
        } catch (err: any) {
            setTokenError(err.message);
        }
    });

    const applyCoupon = async () => {
        if (!couponCode().trim()) return;
        setApplyingCoupon(true);
        setCouponError("");
        try {
            const res = await fetch(`${API}/apply-coupon`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: params.token, code: couponCode().trim() }),
            });
            const data = await res.json();
            if (!res.ok || !data.valid) {
                setCouponError(data.error || data.message || "Invalid coupon");
            } else {
                setCouponApplied(data);
                setCouponError("");
            }
        } catch (err: any) {
            setCouponError(err.message);
        } finally {
            setApplyingCoupon(false);
        }
    };

    const removeCoupon = () => {
        setCouponApplied(null);
        setCouponCode("");
        setCouponError("");
    };

    const effectiveAmount = () => couponApplied() ? couponApplied().finalAmount : info().subscription.amount;

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
                    couponCode: couponApplied() ? (couponApplied().coupon?.code || couponApplied().code) : undefined,
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
                                <Show when={couponApplied()} fallback={formatPrice(info().subscription.amount, info().subscription.currency)}>
                                    <span class="price-original">{formatPrice(info().subscription.amount, info().subscription.currency)}</span>
                                    {" "}
                                    <span class="price-discounted">{formatPrice(effectiveAmount(), info().subscription.currency)}</span>
                                </Show>
                            </div>
                            <div class="product-interval">
                                {intervalLabel(info().subscription.interval, info().subscription.intervalCount)}
                            </div>

                            {/* Order Summary */}
                            <div class="order-summary">
                                {/* Item row */}
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

                                {/* Discount row — only when coupon applied */}
                                <Show when={couponApplied()}>
                                    <div class="order-row order-discount-row">
                                        <div>
                                            <div class="order-item-name order-discount-label">
                                                Promo {couponApplied().coupon?.code || couponApplied().code}
                                            </div>
                                        </div>
                                        <div class="order-item-price order-discount-value">
                                            −{formatPrice(couponApplied().discountAmount, info().subscription.currency)}
                                        </div>
                                    </div>
                                </Show>

                                {/* Total */}
                                <div class="order-total">
                                    <span class="order-total-label">Total due today</span>
                                    <span class="order-total-value">
                                        {formatPrice(effectiveAmount(), info().subscription.currency)}
                                    </span>
                                </div>
                            </div>

                            {/* Coupon / Promo Code — below order summary */}
                            <Show when={!couponApplied()}>
                                <Show when={!showCouponInput()}>
                                    <button class="coupon-toggle" onClick={() => setShowCouponInput(true)}>
                                        <Ticket size={14} />
                                        <span>Add promo code</span>
                                    </button>
                                </Show>
                                <Show when={showCouponInput()}>
                                    <div class="coupon-input-wrap">
                                        <input
                                            type="text"
                                            class="coupon-input"
                                            placeholder="Promo code"
                                            value={couponCode()}
                                            onInput={(e) => setCouponCode(e.target.value.toUpperCase())}
                                            onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                                        />
                                        <button
                                            class="coupon-apply-btn"
                                            onClick={applyCoupon}
                                            disabled={!couponCode().trim() || applyingCoupon()}
                                        >
                                            {applyingCoupon() ? "..." : "Apply"}
                                        </button>
                                    </div>
                                    <Show when={couponError()}>
                                        <div class="coupon-error">{couponError()}</div>
                                    </Show>
                                </Show>
                            </Show>

                            {/* Applied coupon badge */}
                            <Show when={couponApplied()}>
                                <div class="coupon-applied">
                                    <Ticket size={14} />
                                    <span class="coupon-applied-code">{couponApplied().coupon?.code || couponApplied().code}</span>
                                    <span class="coupon-applied-desc">
                                        {couponApplied().coupon?.type === "percent" || couponApplied().type === "percent"
                                            ? `${couponApplied().coupon?.value || couponApplied().value}% off`
                                            : `${formatPrice(couponApplied().coupon?.value || couponApplied().value, info().subscription.currency)} off`
                                        }
                                    </span>
                                    <Show when={!info().coupon}>
                                        <button class="coupon-remove" onClick={removeCoupon}>✕</button>
                                    </Show>
                                </div>
                            </Show>

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
                                    : `Pay ${formatPrice(effectiveAmount(), info().subscription.currency)}`
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

