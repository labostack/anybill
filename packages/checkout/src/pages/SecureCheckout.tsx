import { createSignal, onMount, For, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Ticket,
  Info,
  X,
} from "lucide-solid";
import { useI18n } from "../locales/i18n";
import { isEmbedded } from "../App";
import { LanguageSwitcher } from "../LanguageSwitcher";

const API = "/api/checkout";

/**
 * Resolve a provider displayName that may be a plain string
 * or a locale map `{ en: "...", ru: "..." }`.
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
  const [selectedVariant, setSelectedVariant] = createSignal<string | null>(null);
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
      setInfo(data);
      if (data.providers.length === 1) {
        const solo = data.providers[0];
        setSelectedProvider(solo.id);
        if (solo.variants?.length === 1) {
          setSelectedVariant(solo.variants[0].id);
        }
      }
      if (data.coupon) {
        setCouponApplied(data.coupon);
      }
    } catch (err: unknown) {
      setTokenError((err as Error).message);
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
    } catch (err: unknown) {
      setCouponError((err as Error).message);
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
          variant: selectedVariant() || undefined,
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
    } catch (err: unknown) {
      setError((err as Error).message);
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
        <div class={`co-layout${isEmbedded ? " co-embedded" : ""}`}>
          {/* ═══ LEFT PANEL: Plan + Summary ═══ */}
          <div class="co-left">
            <div class="co-left-inner">
              {/* Brand */}
              <Show when={!isEmbedded}>
                <div class="co-brand">
                  <Show when={referrerUrl()}>
                    <a class="co-back" href={referrerUrl()}>
                      <ArrowLeft size={15} />
                    </a>
                  </Show>
                  <Show when={info().checkoutConfig?.logoUrl}>
                    <img
                      class="co-brand-logo"
                      src={info().checkoutConfig.logoUrl}
                      alt=""
                    />
                  </Show>
                  <span class="co-brand-name">
                    {info().checkoutConfig?.brandName || t("common.checkout")}
                  </span>
                  <LanguageSwitcher />
                </div>
              </Show>

              {/* Plan + Price */}
              <div class="co-plan">
                <div class="co-plan-name">{info().subscription.name}</div>
                <div class="co-plan-price-row">
                  <Show
                    when={couponApplied()}
                    fallback={
                      <span class="co-plan-price">
                        {formatPrice(
                          info().subscription.amount,
                          info().subscription.currency,
                        )}
                      </span>
                    }
                  >
                    <span class="co-plan-price-old">
                      {formatPrice(
                        info().subscription.amount,
                        info().subscription.currency,
                      )}
                    </span>
                    <span class="co-plan-price co-plan-price-discounted">
                      {formatPrice(
                        effectiveAmount(),
                        info().subscription.currency,
                      )}
                    </span>
                  </Show>
                  <span class="co-plan-interval">
                    {intervalLabel(
                      info().subscription.interval,
                      info().subscription.intervalCount,
                    )}
                  </span>
                </div>
              </div>

              {/* Order Summary */}
              <div class="co-summary">
                <div class="co-summary-row">
                  <div class="co-summary-item">
                    <span class="co-summary-name">
                      {info().subscription.name}
                    </span>
                    <Show when={info().subscription.description}>
                      <span class="co-summary-desc">
                        {info().subscription.description}
                      </span>
                    </Show>
                  </div>
                  <span class="co-summary-value">
                    {formatPrice(
                      info().subscription.amount,
                      info().subscription.currency,
                    )}
                  </span>
                </div>

                {/* Discount row */}
                <Show when={couponApplied()}>
                  <div class="co-summary-row co-summary-discount">
                    <span class="co-summary-name">
                      {t("checkout.promoApplied")}{" "}
                      {couponApplied().coupon?.code || couponApplied().code}
                    </span>
                    <span class="co-summary-value">
                      −{formatPrice(
                        couponApplied().discountAmount,
                        info().subscription.currency,
                      )}
                    </span>
                  </div>
                </Show>

                {/* Total */}
                <div class="co-summary-total">
                  <span>{t("checkout.totalDueToday")}</span>
                  <span class="co-summary-total-value">
                    {formatPrice(
                      effectiveAmount(),
                      info().subscription.currency,
                    )}
                  </span>
                </div>
              </div>

              {/* Coupon */}
              <Show when={!couponApplied()}>
                <Show when={!showCouponInput()}>
                  <button
                    class="co-coupon-toggle"
                    onClick={() => setShowCouponInput(true)}
                  >
                    <Ticket size={13} />
                    <span>{t("checkout.addPromoCode")}</span>
                  </button>
                </Show>
                <Show when={showCouponInput()}>
                  <div class="co-coupon-row">
                    <input
                      type="text"
                      class="co-coupon-input"
                      placeholder={t("checkout.promoCodePlaceholder")}
                      value={couponCode()}
                      onInput={(e) =>
                        setCouponCode(e.target.value.toUpperCase())
                      }
                      onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                    />
                    <button
                      class="co-coupon-apply"
                      onClick={applyCoupon}
                      disabled={!couponCode().trim() || applyingCoupon()}
                    >
                      {applyingCoupon() ? "..." : t("common.apply")}
                    </button>
                    <button
                      class="co-coupon-close"
                      onClick={() => {
                        setShowCouponInput(false);
                        setCouponCode("");
                        setCouponError("");
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <Show when={couponError()}>
                    <div class="co-coupon-error">{couponError()}</div>
                  </Show>
                </Show>
              </Show>

              {/* Applied coupon badge */}
              <Show when={couponApplied()}>
                <div class="co-coupon-badge">
                  <Ticket size={13} />
                  <span class="co-coupon-badge-code">
                    {couponApplied().coupon?.code || couponApplied().code}
                  </span>
                  <span class="co-coupon-badge-desc">
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
                    <button class="co-coupon-remove" onClick={removeCoupon}>
                      ✕
                    </button>
                  </Show>
                </div>
              </Show>

              {/* Footer — left panel bottom */}
              <div class="co-footer">
                <div class="co-secure">
                  <ShieldCheck size={13} />
                  <span>{t("checkout.secureInfo")}</span>
                </div>
                <Show when={!info().checkoutConfig?.hidePoweredBy}>
                  <div class="co-powered">
                    <Lock size={11} />
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
          </div>

          {/* ═══ RIGHT PANEL: Payment ═══ */}
          <div class="co-right">
            <div class="co-right-inner">
              {/* Warning / Info Banner */}
              <Show when={info().existingSubscription}>
                {(() => {
                  const existing = info().existingSubscription;
                  const sameCurrency =
                    existing.currency === info().subscription.currency;
                  const isUpgrade =
                    sameCurrency &&
                    info().subscription.amount > existing.amount;

                  if (!sameCurrency) {
                    return (
                      <div class="co-banner co-banner-warn">
                        <AlertTriangle size={14} />
                        <span>
                          {t("checkout.existingSubCurrencyMismatch", {
                            name: existing.name,
                            date: formatDate(existing.currentPeriodEnd),
                          })}
                        </span>
                      </div>
                    );
                  }

                  return isUpgrade ? (
                    <div class="co-banner co-banner-info">
                      <Info size={14} />
                      <span>
                        {t("checkout.existingSubUpgrade", {
                          name: existing.name,
                        })}
                      </span>
                    </div>
                  ) : (
                    <div class="co-banner co-banner-warn">
                      <AlertTriangle size={14} />
                      <span>
                        {t("checkout.existingSubDowngrade", {
                          name: existing.name,
                          date: formatDate(existing.currentPeriodEnd),
                        })}
                      </span>
                    </div>
                  );
                })()}
              </Show>

              {/* Error */}
              <Show when={error()}>
                <div class="co-banner co-banner-error">
                  <AlertTriangle size={14} />
                  <span>{error()}</span>
                </div>
              </Show>

              {/* Payment Method */}
              <div class="co-section-label">{t("checkout.paymentMethod")}</div>

              <div class="co-providers">
                <For each={info().providers}>
                  {(provider: {
                    id: string;
                    displayName: string | Record<string, string>;
                    variants?: {
                      id: string;
                      displayName: string | Record<string, string>;
                      currency: string;
                      convertedAmount?: number | null;
                    }[];
                  }) => {
                    const hasVariants = () => (provider.variants?.length ?? 0) > 0;
                    const isSelected = () => selectedProvider() === provider.id;

                    return (
                      <>
                        <button
                          class={`co-provider${isSelected() ? " co-provider-active" : ""}`}
                          onClick={() => {
                            setSelectedProvider(provider.id);
                            if (!hasVariants()) {
                              setSelectedVariant(null);
                            } else if (provider.variants!.length === 1) {
                              setSelectedVariant(provider.variants![0].id);
                            } else {
                              setSelectedVariant(null);
                            }
                          }}
                        >
                          <div class="co-radio">
                            <Show when={isSelected()}>
                              <div class="co-radio-dot" />
                            </Show>
                          </div>
                          <span class="co-provider-name">
                            {resolveDisplayName(provider.displayName, locale())}
                          </span>
                        </button>

                        {/* Variant sub-options */}
                        <Show when={hasVariants() && isSelected()}>
                          <div class="co-variants-scroll">
                          <For each={provider.variants}>
                            {(variant) => (
                              <button
                                class={`co-variant${selectedVariant() === variant.id ? " co-variant-active" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedVariant(variant.id);
                                }}
                              >
                                <div class="co-radio co-radio-sm">
                                  <Show when={selectedVariant() === variant.id}>
                                    <div class="co-radio-dot" />
                                  </Show>
                                </div>
                                <span class="co-variant-name">
                                  {resolveDisplayName(
                                    variant.displayName,
                                    locale(),
                                  )}
                                </span>
                                <Show
                                  when={
                                    variant.convertedAmount != null &&
                                    variant.currency.toLowerCase() !==
                                      info()
                                        .subscription.currency.toLowerCase()
                                  }
                                >
                                  <span class="co-variant-price">
                                    ≈{" "}
                                    {formatPrice(
                                      couponApplied()
                                        ? Math.round(variant.convertedAmount! * effectiveAmount() / info().subscription.amount)
                                        : variant.convertedAmount!,
                                      variant.currency,
                                    )}
                                  </span>
                                </Show>
                              </button>
                            )}
                          </For>
                          </div>
                        </Show>
                      </>
                    );
                  }}
                </For>
              </div>

              {/* Pay Button */}
              <button
                class="co-pay"
                disabled={
                  !selectedProvider() ||
                  loading() ||
                  (info()
                    .providers.find(
                      (p: { id: string; variants?: { id: string }[] }) =>
                        p.id === selectedProvider(),
                    )
                    ?.variants?.length > 0 &&
                    !selectedVariant())
                }
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
            </div>
          </div>
        </div>
      </Show>
    </Show>
  );
}
