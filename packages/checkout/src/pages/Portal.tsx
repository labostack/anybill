/**
 * Portal page — subscriber self-service dashboard.
 *
 * Uses the same two-column Stripe-style layout as SecureCheckout.
 * Left column: subscription info + payment history.
 * Right column: actions (cancel, renew).
 *
 * For renewals, the portal redirects to the standard checkout page —
 * provider selection happens there, not here.
 * Plan changes are handled by the product's own UI via SDK checkout links.
 */
import { createSignal, onMount, For, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  CreditCard,
  RefreshCw,
  Lock,
  X,
} from "lucide-solid";
import { useI18n } from "../locales/i18n";

const API = "/api/portal";

// ─── Types ──────────────────────────────────────────────────────────

interface SubscriptionInfo {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
}

interface SubscriberInfo {
  id: string;
  subscription: SubscriptionInfo;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  renewalMode?: string;
  provider?: string | null;
}

interface InvoiceInfo {
  id: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  paidAt: string | null;
  createdAt: string;
}

interface PortalData {
  uid: string;
  role: "direct" | "owner" | "member";
  squad: {
    id: string;
    maxMembers: number;
    memberCount: number;
    ownerUid?: string;
  } | null;
  subscriber: SubscriberInfo | null;
  invoices: InvoiceInfo[];
  checkoutConfig: Record<string, any>;
}

// ─── Helpers ────────────────────────────────────────────────────────

function statusBadgeClass(status: string) {
  switch (status) {
    case "active":
    case "trialing":
      return "portal-badge portal-badge-active";
    case "cancelled":
      return "portal-badge portal-badge-cancelled";
    case "expired":
    case "past_due":
      return "portal-badge portal-badge-warning";
    case "paid":
      return "portal-badge portal-badge-active";
    case "failed":
      return "portal-badge portal-badge-cancelled";
    case "refunded":
      return "portal-badge portal-badge-warning";
    case "pending":
      return "portal-badge portal-badge-pending";
    default:
      return "portal-badge";
  }
}

// ─── Component ──────────────────────────────────────────────────────

export function PortalPage() {
  const { t, formatPrice, intervalLabel, formatDate } = useI18n();
  const params = useParams<{ token: string }>();

  // State
  const [data, setData] = createSignal<PortalData | null>(null);
  const [tokenError, setTokenError] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [actionLoading, setActionLoading] = createSignal(false);
  const [actionError, setActionError] = createSignal("");
  const [actionSuccess, setActionSuccess] = createSignal("");

  // Modal state
  const [showCancelModal, setShowCancelModal] = createSignal(false);
  const [showRenewModal, setShowRenewModal] = createSignal(false);

  // ─── Load Data ──────────────────────────────────────────────

  onMount(async () => {
    try {
      const res = await fetch(`${API}/resolve/${params.token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const code = err?.errorCode || err?.message;
        let tError = code
          ? t(`apiErrors.${code}` as any)
          : t("common.invalidLink");
        if (!tError || tError.includes("apiErrors."))
          tError = code || t("common.invalidLink");
        throw new Error(tError);
      }
      setData(await res.json());
    } catch (err: any) {
      setTokenError(err.message);
    } finally {
      setLoading(false);
    }
  });

  // ─── Actions ────────────────────────────────────────────────

  const cancelSubscription = async () => {
    const d = data();
    if (!d?.subscriber) return;
    setActionLoading(true);
    setActionError("");
    try {
      const res = await fetch(`${API}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: params.token,
          subscriberId: d.subscriber.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const code = err.errorCode || err.message || "Unknown error";
        let tError = t(`apiErrors.${code}` as any);
        if (!tError || tError.includes("apiErrors.")) tError = code;
        throw new Error(tError);
      }
      setData({ ...d, subscriber: { ...d.subscriber, status: "cancelled" } });
      setShowCancelModal(false);
      setActionSuccess(t("portal.cancelledNoActions"));
      setTimeout(() => setActionSuccess(""), 5000);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const renewSubscription = async () => {
    const d = data();
    if (!d?.subscriber) return;
    setActionLoading(true);
    setActionError("");
    try {
      const res = await fetch(`${API}/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: params.token,
          subscriberId: d.subscriber.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const code = err.errorCode || err.message || "Unknown error";
        let tError = t(`apiErrors.${code}` as any);
        if (!tError || tError.includes("apiErrors.")) tError = code;
        throw new Error(tError);
      }
      const { checkoutUrl } = await res.json();
      window.location.href = checkoutUrl;
    } catch (err: any) {
      setActionError(err.message);
      setActionLoading(false);
    }
  };

  // ─── Computed ────────────────────────────────────────────────

  const isMember = () => data()?.role === "member";

  const canCancel = () => {
    if (isMember()) return false;
    const sub = data()?.subscriber;
    if (!sub) return false;
    // No point cancelling a one-time purchase
    if (sub.subscription.interval === "one_time") return false;
    // Manual renewal = no auto-charge, subscription expires on its own
    if (sub.renewalMode === "manual") return false;
    return sub.status === "active";
  };

  const canRenew = () => {
    if (isMember()) return false;
    const sub = data()?.subscriber;
    if (!sub) return false;
    if (sub.subscription.interval === "one_time") return false;
    if (sub.renewalMode === "provider_managed") return false;
    return ["expired", "past_due", "cancelled"].includes(sub.status);
  };

  return (
    <>
      {/* Token error */}
      <Show when={tokenError()}>
        <div class="confirm-container">
          <div class="confirm-card">
            <div class="token-error">
              <AlertTriangle size={32} />
              <div class="token-error-title">{t("common.linkExpired")}</div>
              <div class="token-error-message">{tokenError()}</div>
            </div>
          </div>
        </div>
      </Show>

      {/* Loading */}
      <Show when={loading() && !tokenError()}>
        <div class="confirm-container">
          <div class="spinner" />
        </div>
      </Show>

      {/* Portal content — two-column Stripe layout */}
      <Show when={data()}>
        <div class="checkout-layout">
          {/* ─── Left Column: Subscription Info ─── */}
          <div class="checkout-left">
            <div class="checkout-left-inner">
              {/* Brand */}
              <div class="checkout-brand">
                <Show when={data()!.checkoutConfig?.logoUrl}>
                  <div class="checkout-brand-icon">
                    <img src={data()!.checkoutConfig.logoUrl} alt="Logo" />
                  </div>
                </Show>
                <span class="checkout-brand-name">
                  {data()!.checkoutConfig?.brandName ||
                    t("common.billingPortal")}
                </span>
              </div>

              <Show
                when={data()!.subscriber}
                fallback={
                  <div class="portal-empty-left">
                    <CreditCard size={36} />
                    <div class="portal-empty-title">
                      {t("portal.noActiveSub")}
                    </div>
                    <div class="portal-empty-desc">
                      {t("portal.noActiveSubDesc")}
                    </div>
                  </div>
                }
              >
                {(() => {
                  const sub = data()!.subscriber!;
                  return (
                    <>
                      <div class="product-name">{sub.subscription.name}</div>
                      <div class="product-price">
                        {formatPrice(
                          sub.subscription.amount,
                          sub.subscription.currency,
                        )}
                      </div>
                      <div class="product-interval">
                        {intervalLabel(
                          sub.subscription.interval,
                          sub.subscription.intervalCount,
                        )}
                      </div>

                      {/* Status & period */}
                      <div class="portal-status-bar">
                        <span class={statusBadgeClass(sub.status)}>
                          {t("portal.status_" + sub.status)}
                        </span>
                        <Show when={data()!.role === "owner"}>
                          <span class="portal-badge portal-badge-info">
                            {t("portal.squadOwner")}
                          </span>
                        </Show>
                        <Show when={data()!.role === "member"}>
                          <span class="portal-badge portal-badge-info">
                            {t("portal.squadMember")}
                          </span>
                        </Show>
                        <Show
                          when={
                            sub.subscription.interval !== "one_time" &&
                            sub.currentPeriodEnd
                          }
                        >
                          <span class="portal-period-text">
                            <Clock size={13} />
                            {sub.status === "active"
                              ? `${formatDate(sub.currentPeriodStart)} – ${formatDate(sub.currentPeriodEnd)}`
                              : sub.status === "trialing"
                                ? `${t("portal.trialUntil")} ${formatDate(sub.currentPeriodEnd)}`
                                : sub.status === "cancelled"
                                  ? `${t("portal.until")} ${formatDate(sub.currentPeriodEnd)}`
                                  : `${t("portal.expiredOn")} ${formatDate(sub.currentPeriodEnd)}`}
                          </span>
                        </Show>
                      </div>

                      {/* Invoice History */}
                      <Show when={data()!.invoices.length > 0}>
                        <div class="order-summary">
                          <div class="portal-invoices-title">
                            {t("portal.paymentHistory")}
                          </div>
                          <For each={data()!.invoices.slice(0, 10)}>
                            {(inv) => (
                              <div class="order-row">
                                <div>
                                  <div class="order-item-name">
                                    {formatDate(inv.paidAt || inv.createdAt)}
                                  </div>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    "align-items": "center",
                                    gap: "10px",
                                  }}
                                >
                                  <span class={statusBadgeClass(inv.status)}>
                                    {t("portal.status_" + inv.status)}
                                  </span>
                                  <div class="order-item-price">
                                    {formatPrice(inv.amount, inv.currency)}
                                  </div>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </>
                  );
                })()}
              </Show>

              {/* Powered by */}
              <Show when={!data()!.checkoutConfig?.hidePoweredBy}>
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

          {/* ─── Right Column: Actions ─── */}
          <div class="checkout-right">
            <div class="checkout-right-inner">
              <div class="payment-section-title">{t("portal.manageSub")}</div>

              {/* Success toast */}
              <Show when={actionSuccess()}>
                <div class="portal-success">
                  <CheckCircle size={16} />
                  <span>{actionSuccess()}</span>
                </div>
              </Show>

              {/* Error toast */}
              <Show when={actionError()}>
                <div class="error-msg">{actionError()}</div>
              </Show>

              <Show when={data()!.subscriber}>
                {(() => {
                  const sub = data()!.subscriber!;
                  const isOneTime = sub.subscription.interval === "one_time";

                  return (
                    <div class="portal-action-list">
                      <Show when={isMember()}>
                        <div class="portal-member-notice">
                          <div class="portal-member-notice-icon">
                            <Lock size={20} />
                          </div>
                          <div class="portal-member-notice-content">
                            <div class="portal-member-notice-title">
                              {t("portal.squadMemberNoticeTitle")}
                            </div>
                            <div class="portal-member-notice-desc">
                              {t("portal.squadMemberNoticeDesc")}
                            </div>
                          </div>
                        </div>
                      </Show>

                      <Show when={canRenew()}>
                        <button
                          class="portal-action-card portal-action-accent"
                          onClick={() => {
                            setActionError("");
                            setShowRenewModal(true);
                          }}
                        >
                          <div class="portal-action-icon">
                            <RefreshCw size={20} />
                          </div>
                          <div class="portal-action-content">
                            <div class="portal-action-title">
                              {t("portal.renewSub")}
                            </div>
                            <div class="portal-action-desc">
                              {t("portal.renewSubDesc", {
                                name: sub.subscription.name,
                              })}
                            </div>
                          </div>
                        </button>
                      </Show>

                      <Show when={canCancel()}>
                        <button
                          class="portal-action-card portal-action-danger"
                          onClick={() => {
                            setActionError("");
                            setShowCancelModal(true);
                          }}
                        >
                          <div class="portal-action-icon">
                            <XCircle size={20} />
                          </div>
                          <div class="portal-action-content">
                            <div class="portal-action-title">
                              {t("portal.cancelSub")}
                            </div>
                            <div class="portal-action-desc">
                              {t("portal.cancelSubDesc")}
                            </div>
                          </div>
                        </button>
                      </Show>

                      {/* One-time: no actions */}
                      <Show when={isOneTime}>
                        <div class="portal-no-actions">
                          {t("portal.oneTimePurchaseNoActions")}
                        </div>
                      </Show>

                      {/* Cancelled with no available actions */}
                      <Show when={sub.status === "cancelled" && !canRenew()}>
                        <div class="portal-no-actions">
                          {t("portal.cancelledNoActions")}
                        </div>
                      </Show>

                      {/* Active manual renewal — no actions needed */}
                      <Show
                        when={
                          !isOneTime &&
                          !canCancel() &&
                          !canRenew() &&
                          (sub.status === "active" || sub.status === "trialing")
                        }
                      >
                        <div class="portal-no-actions">
                          {t("portal.manualActiveNoActions")}
                        </div>
                      </Show>
                    </div>
                  );
                })()}
              </Show>

              <Show when={!data()!.subscriber}>
                <div class="portal-no-actions">{t("portal.noSubToManage")}</div>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* ─── Cancel Modal ────────────────────────────────── */}
      <Show when={showCancelModal()}>
        <div class="portal-overlay" onClick={() => setShowCancelModal(false)}>
          <div class="portal-modal" onClick={(e) => e.stopPropagation()}>
            <button
              class="portal-modal-close"
              onClick={() => setShowCancelModal(false)}
            >
              <X size={18} />
            </button>
            <div class="portal-modal-icon portal-modal-icon-danger">
              <XCircle size={28} />
            </div>
            <div class="portal-modal-title">{t("portal.cancelTitle")}</div>
            <div class="portal-modal-desc">{t("portal.cancelConfirmDesc")}</div>
            <Show when={actionError()}>
              <div class="error-msg">{actionError()}</div>
            </Show>
            <div class="portal-modal-actions">
              <button
                class="portal-btn portal-btn-ghost"
                onClick={() => setShowCancelModal(false)}
                disabled={actionLoading()}
              >
                {t("portal.keepSubBtn")}
              </button>
              <button
                class="portal-btn portal-btn-danger"
                onClick={cancelSubscription}
                disabled={actionLoading()}
              >
                {actionLoading()
                  ? t("portal.cancelling")
                  : t("portal.confirmCancelBtn")}
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* ─── Renew Modal ─────────────────────────────────── */}
      <Show when={showRenewModal()}>
        <div class="portal-overlay" onClick={() => setShowRenewModal(false)}>
          <div class="portal-modal" onClick={(e) => e.stopPropagation()}>
            <button
              class="portal-modal-close"
              onClick={() => setShowRenewModal(false)}
            >
              <X size={18} />
            </button>
            <div class="portal-modal-icon portal-modal-icon-accent">
              <RefreshCw size={28} />
            </div>
            <div class="portal-modal-title">{t("portal.renewTitle")}</div>
            <div class="portal-modal-desc">
              {t("portal.renewConfirmDesc", {
                name: data()!.subscriber!.subscription.name,
                amount: formatPrice(
                  data()!.subscriber!.subscription.amount,
                  data()!.subscriber!.subscription.currency,
                ),
              })}
            </div>
            <Show when={actionError()}>
              <div class="error-msg">{actionError()}</div>
            </Show>
            <div class="portal-modal-actions">
              <button
                class="portal-btn portal-btn-ghost"
                onClick={() => setShowRenewModal(false)}
                disabled={actionLoading()}
              >
                {t("common.cancel")}
              </button>
              <button
                class="portal-btn portal-btn-primary"
                onClick={renewSubscription}
                disabled={actionLoading()}
              >
                {actionLoading()
                  ? t("common.processing")
                  : t("portal.continueToPaymentBtn")}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
}
