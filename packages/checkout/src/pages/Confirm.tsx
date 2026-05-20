/** Payment confirmation page — polls invoice status and shows success/error state. */
import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-solid";

const API = "/api/checkout";

export function Confirm() {
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
                    <div class="confirm-title">Verifying payment</div>
                    <div class="confirm-desc">Please wait while we confirm your payment...</div>
                </Show>

                <Show when={status() === "paid"}>
                    <div class="confirm-icon success">
                        <CheckCircle size={32} />
                    </div>
                    <div class="confirm-title">Payment confirmed!</div>
                    <Show when={redirectUrl()} fallback={
                        <div class="confirm-desc">Your payment has been processed successfully.</div>
                    }>
                        <div class="confirm-desc">Redirecting you back in a moment...</div>
                    </Show>
                </Show>

                <Show when={status() === "failed"}>
                    <div class="confirm-icon error">
                        <XCircle size={32} />
                    </div>
                    <div class="confirm-title">Payment failed</div>
                    <div class="confirm-desc">Something went wrong with your payment. Please try again.</div>
                </Show>

                <Show when={status() === "error"}>
                    <div class="confirm-icon warning">
                        <AlertTriangle size={32} />
                    </div>
                    <div class="confirm-title">Unable to verify</div>
                    <div class="confirm-desc">We couldn't check your payment status. Please contact support.</div>
                </Show>
            </div>
        </div>
    );
}
