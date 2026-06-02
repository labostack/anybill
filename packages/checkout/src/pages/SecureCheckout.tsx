/** SecureCheckout page — token-based checkout. Resolves a secure link token
 *  via /api/checkout/resolve/:token, then renders the same two-column
 *  layout as the regular Checkout page. */
import { createSignal, onMount, For, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Ticket,
} from "lucide-solid";
import { useI18n } from "../locales/i18n";
import { isEmbedded } from "../App";

const API = "/api/checkout";

/**
 * Resolve a provider displayName that may be a plain string
 * or a locale map `{ en: "...", ru: "..." }`.
 * Priority: exact locale → "en" fallback → first value → empty string.
 */
function resolveDisplayName(
  name: string | Record<string, string>,
  lang: string,
): string {
  if (typeof name === "string") return name;
  return name[lang] ?? name["en"] ?? Object.values(name)[0] ?? "";
}

export function SecureCheckout() {
  const { t, locale, formatPrice, intervalLabel, formatDate } = useI18n();
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
    // Capture referrer for "back" button
    if (
      document.referrer &&
      new URL(document.referrer).origin !== window.location.origin
    ) {
      setReferrerUrl(document.referrer);
    }
    try {
      const res = await fetch(`${API}/resolve/${params.token}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || t("common.invalidLink"));
      }
      const data = await res.json();

      // resolve returns subscription, providers, and checkoutConfig
      setInfo(data);
      if (data.providers.length === 1)
        setSelectedProvider(data.providers[0].id);

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
        body: JSON.stringify({
          token: params.token,
          code: couponCode().trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        const rawError = data.errorCode || data.error || data.message || "";
        let translated = t(`apiErrors.${rawError}` as any);
        if (!translated || translated.includes("apiErrors.")) {
          translated = rawError || t("apiErrors.fallback");
        }
        setCouponError(translated);
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

  const effectiveAmount = () =>
    couponApplied() ? couponApplied().finalAmount : info().subscription.amount;

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
          couponCode: couponApplied()
            ? couponApplied().coupon?.code || couponApplied().code
            : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const code =
          err.errorCode || err.error || err.message || "Payment failed";
        let translated = t(`apiErrors.${code}` as any);
        if (!translated || translated.includes("apiErrors.")) translated = code;
        throw new Error(translated);
      }
      const { paymentUrl } = await res.json();

      // Redirect to the provider's payment gateway.
      // Must break out of iframe — providers block iframe embedding (CSRF).
      // 1. postMessage: parent navigates itself (works when origins are both HTTPS)
      // 2. window.top: direct top-level nav (works in Chrome, new tab in Safari)
      // 3. window.location: last resort (in-frame, may hit provider CSRF)
      try {
        if (window.parent !== window) {
          window.parent.postMessage(
            { type: "anybill:checkout:redirect", url: paymentUrl },
            "*",
          );
          return;
        }
      } catch {
        try {
          window.top!.location.href = paymentUrl;
          return;
        } catch {}
      }
      window.location.href = paymentUrl;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <Show
      when={!tokenError()}
      fallback={
        <div class="confirm-container">
          <div class="confirm-card">
            <div class="token-error">
              <AlertTriangle size={32} />
              <div class="token-error-title">{t("common.linkExpired")}</div>
              <div class="token-error-message">{tokenError()}</div>
            </div>
          </div>
        </div>
      }
    >
      <Show
        when={info()}
        fallback={
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
        }
      >
        <div class="checkout-layout">
          {/* ─── Left Column: Product Summary ─── */}
          <div class="checkout-left">
            <div class="checkout-left-inner">
              {/* Back to referrer — hidden in embed mode */}
              <Show when={referrerUrl() && !isEmbedded}>
                <a class="checkout-back" href={referrerUrl()}>
                  <ArrowLeft size={16} />
                  <span>{t("common.back")}</span>
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
                  {info().checkoutConfig?.brandName || t("common.checkout")}
                </span>
              </div>

              {/* Product */}
              <div class="product-name">{info().subscription.name}</div>
              <div class="product-price">
                <Show
                  when={couponApplied()}
                  fallback={formatPrice(
                    info().subscription.amount,
                    info().subscription.currency,
                  )}
                >
                  <span class="price-original">
                    {formatPrice(
                      info().subscription.amount,
                      info().subscription.currency,
                    )}
                  </span>{" "}
                  <span class="price-discounted">
                    {formatPrice(
                      effectiveAmount(),
                      info().subscription.currency,
                    )}
                  </span>
                </Show>
              </div>
              <div class="product-interval">
                {intervalLabel(
                  info().subscription.interval,
                  info().subscription.intervalCount,
                )}
              </div>

              {/* Order Summary */}
              <div class="order-summary">
                {/* Item row */}
                <div class="order-row">
                  <div>
                    <div class="order-item-name">
                      {info().subscription.name}
                    </div>
                    <Show when={info().subscription.description}>
                      <div class="order-item-desc">
                        {info().subscription.description}
                      </div>
                    </Show>
                  </div>
                  <div class="order-item-price">
                    {formatPrice(
                      info().subscription.amount,
                      info().subscription.currency,
                    )}
                  </div>
                </div>

                {/* Discount row — only when coupon applied */}
                <Show when={couponApplied()}>
                  <div class="order-row order-discount-row">
                    <div>
                      <div class="order-item-name order-discount-label">
                        {t("checkout.promoApplied")}{" "}
                        {couponApplied().coupon?.code || couponApplied().code}
                      </div>
                    </div>
                    <div class="order-item-price order-discount-value">
                      −
                      {formatPrice(
                        couponApplied().discountAmount,
                        info().subscription.currency,
                      )}
                    </div>
                  </div>
                </Show>

                {/* Total */}
                <div class="order-total">
                  <span class="order-total-label">
                    {t("checkout.totalDueToday")}
                  </span>
                  <span class="order-total-value">
                    {formatPrice(
                      effectiveAmount(),
                      info().subscription.currency,
                    )}
                  </span>
                </div>
              </div>

              {/* Coupon / Promo Code — below order summary */}
              <Show when={!couponApplied()}>
                <Show when={!showCouponInput()}>
                  <button
                    class="coupon-toggle"
                    onClick={() => setShowCouponInput(true)}
                  >
                    <Ticket size={14} />
                    <span>{t("checkout.addPromoCode")}</span>
                  </button>
                </Show>
                <Show when={showCouponInput()}>
                  <div class="coupon-input-wrap">
                    <input
                      type="text"
                      class="coupon-input"
                      placeholder={t("checkout.promoCodePlaceholder")}
                      value={couponCode()}
                      onInput={(e) =>
                        setCouponCode(e.target.value.toUpperCase())
                      }
                      onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                    />
                    <button
                      class="coupon-apply-btn"
                      onClick={applyCoupon}
                      disabled={!couponCode().trim() || applyingCoupon()}
                    >
                      {applyingCoupon() ? "..." : t("common.apply")}
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
                  <span class="coupon-applied-code">
                    {couponApplied().coupon?.code || couponApplied().code}
                  </span>
                  <span class="coupon-applied-desc">
                    {(() => {
                      const val =
                        couponApplied().coupon?.value || couponApplied().value;
                      const isPercent =
                        couponApplied().coupon?.type === "percent" ||
                        couponApplied().type === "percent";
                      const formattedVal = isPercent
                        ? `${val}%`
                        : formatPrice(val, info().subscription.currency);
                      return t("checkout.discountApplied", {
                        amount: formattedVal,
                      });
                    })()}
                  </span>
                  <Show when={!info().coupon}>
                    <button class="coupon-remove" onClick={removeCoupon}>
                      ✕
                    </button>
                  </Show>
                </div>
              </Show>

              {/* Powered by */}
              <Show when={!info().checkoutConfig?.hidePoweredBy}>
                <div class="powered-by">
                  <Lock size={12} />
                  {t("common.poweredBy")}{" "}
                  <a
                    href="https://github.com/labostack/anybill"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    anybill
                  </a>
                </div>
              </Show>
            </div>
          </div>

          {/* ─── Right Column: Payment ─── */}
          <div class="checkout-right">
            <div class="checkout-right-inner">
              <div class="payment-section-title">{t("checkout.payWith")}</div>

              <Show when={error()}>
                <div class="error-msg">{error()}</div>
              </Show>

              <Show when={info().existingSubscription}>
                <div class="checkout-warning">
                  <AlertTriangle size={16} />
                  <div>
                    {t("checkout.existingSubWarning", {
                      name: info().existingSubscription.name,
                      date: formatDate(
                        info().existingSubscription.currentPeriodEnd,
                      ),
                    })}
                  </div>
                </div>
              </Show>

              <div class="payment-section-label">
                {t("checkout.paymentMethod")}
              </div>

              <div class="provider-list">
                <For each={info().providers}>
                  {(provider: {
                    id: string;
                    displayName: string | Record<string, string>;
                  }) => (
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
                        {resolveDisplayName(provider.displayName, locale())}
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
                  ? t("common.processing")
                  : t("checkout.payAmount", {
                      amount: formatPrice(
                        effectiveAmount(),
                        info().subscription.currency,
                      ),
                    })}
              </button>

              <div class="security-info">
                <ShieldCheck size={14} />
                <span>{t("checkout.secureInfo")}</span>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </Show>
  );
}
