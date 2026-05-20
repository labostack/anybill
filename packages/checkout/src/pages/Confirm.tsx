/** Payment confirmation page — polls invoice status and shows success/error state. */
import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-solid";
import { useI18n } from "../locales/i18n";

const API = "/api/checkout";

export function Confirm() {
    const { t } = useI18n();
    const params = useParams();
    const [status, setStatus] = createSignal<string>("checking");
    const [redirectUrl, setRedirectUrl] = createSignal<string | null>(null);

    let interval: ReturnType<typeof setInterval>;

    onMount(() => {
        const check = async () => {
            try {
                const res = await fetch(`${API}/confirm/${params.invoiceId}`);
                if (!res.ok) {
                    setStatus("error");
                    return;
                }
                const data = await res.json();

                if (data.status === "paid") {
                    setStatus("paid");
                    setRedirectUrl(data.redirectUrl);
                    clearInterval(interval);

                    // Notify embed widget parent (if running inside iframe).
                    if (window.parent !== window) {
                        window.parent.postMessage(
                            { type: "anybill:payment:confirmed", invoiceId: params.invoiceId },
                            "*",
                        );
                    }

                    // Auto-redirect (only when not in iframe).
                    if (data.redirectUrl && window.parent === window) {
                        window.location.href = data.redirectUrl;
                    }
                } else if (data.status === "failed" || data.status === "cancelled") {
                    setStatus(data.status);
                    clearInterval(interval);
                }
                // else keep polling (pending)
            } catch {
                setStatus("error");
            }
        };

        check();
        interval = setInterval(check, 3000);
    });

    onCleanup(() => clearInterval(interval));

    return (
        <div class="confirm-container">
            <div class="confirm-card">
                <Show when={status() === "checking" || status() === "pending"}>
                    <div class="spinner" />
                    <div class="confirm-title">{t("confirm.verifying")}</div>
                    <div class="confirm-desc">{t("confirm.verifyingDesc")}</div>
                </Show>

                <Show when={status() === "paid"}>
                    <div class="confirm-icon success">
                        <CheckCircle size={32} />
                    </div>
                    <div class="confirm-title">{t("confirm.confirmed")}</div>
                    <Show when={redirectUrl()} fallback={
                        <div class="confirm-desc">{t("confirm.confirmedDesc")}</div>
                    }>
                        <div class="confirm-desc">{t("confirm.redirecting")}</div>
                    </Show>
                </Show>

                <Show when={status() === "failed"}>
                    <div class="confirm-icon error">
                        <XCircle size={32} />
                    </div>
                    <div class="confirm-title">{t("confirm.failed")}</div>
                    <div class="confirm-desc">{t("confirm.failedDesc")}</div>
                </Show>

                <Show when={status() === "error"}>
                    <div class="confirm-icon warning">
                        <AlertTriangle size={32} />
                    </div>
                    <div class="confirm-title">{t("confirm.unableVerify")}</div>
                    <div class="confirm-desc">{t("confirm.unableVerifyDesc")}</div>
                </Show>
            </div>
        </div>
    );
}

