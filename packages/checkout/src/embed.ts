/**
 * AnyBill Embed Widget — drop-in checkout integration.
 *
 * Add this script to any page and use `data-anybill-checkout` buttons
 * or the `AnybillEmbed.open()` API to launch a modal checkout overlay.
 *
 * Tokens must be generated server-side via the SDK or admin API before
 * being passed to the embed widget.
 *
 * @example HTML usage:
 * ```html
 * <script src="https://billing.example.com/embed.js"></script>
 * <button
 *   data-anybill-checkout
 *   data-base-url="https://billing.example.com"
 *   data-token="eyJ...">  <!-- token from SDK -->
 *   Subscribe
 * </button>
 * ```
 *
 * @example Programmatic usage:
 * ```js
 * // Token obtained server-side: POST /api/sdk/checkout-links
 * AnybillEmbed.open({
 *   baseUrl: "https://billing.example.com",
 *   token: "eyJ...signed-token",
 *   locale: "ru",              // optional — forces UI language ("en" | "ru")
 *   onSuccess: (invoiceId) => console.log("Paid!", invoiceId),
 *   onClose: () => console.log("Closed"),
 * });
 * ```
 */

(function () {
    "use strict";

    if ((window as any).__anybill_embed_loaded) return;
    (window as any).__anybill_embed_loaded = true;

    // ─── Types ──────────────────────────────────────────

    interface EmbedOptions {
        baseUrl: string;
        /** Signed checkout token (from SDK or admin API). */
        token: string;
        theme?: "dark" | "auto";
        /** Force a UI locale (e.g. "en" | "ru"). Falls back to browser language. */
        locale?: string;
        onSuccess?: (invoiceId: string) => void;
        onClose?: () => void;
    }

    // ─── Styles ─────────────────────────────────────────

    const OVERLAY_ID = "anybill-embed-overlay";
    const FRAME_ID = "anybill-embed-frame";

    const CSS = `
        #${OVERLAY_ID} {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            opacity: 0;
            transition: opacity 0.25s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        #${OVERLAY_ID}.visible {
            opacity: 1;
        }
        #${OVERLAY_ID} .anybill-modal {
            position: relative;
            width: 94vw;
            max-width: 960px;
            height: 85vh;
            max-height: 700px;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
            transform: translateY(20px) scale(0.97);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            background: #0f1118;
        }
        #${OVERLAY_ID}.visible .anybill-modal {
            transform: translateY(0) scale(1);
        }
        #${OVERLAY_ID} .anybill-close {
            position: absolute;
            top: 12px;
            right: 12px;
            z-index: 10;
            width: 32px;
            height: 32px;
            border: none;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.08);
            color: rgba(255, 255, 255, 0.6);
            font-size: 18px;
            line-height: 1;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }
        #${OVERLAY_ID} .anybill-close:hover {
            background: rgba(255, 255, 255, 0.15);
            color: #fff;
        }
        #${FRAME_ID} {
            width: 100%;
            height: 100%;
            border: none;
        }
        @media (max-width: 640px) {
            #${OVERLAY_ID} .anybill-modal {
                width: 100vw;
                height: 100vh;
                max-width: none;
                max-height: none;
                border-radius: 0;
            }
        }
    `;

    // ─── Inject stylesheet ──────────────────────────────

    function injectStyles(): void {
        if (document.getElementById("anybill-embed-styles")) return;
        const style = document.createElement("style");
        style.id = "anybill-embed-styles";
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    // ─── Core ───────────────────────────────────────────

    let currentOptions: EmbedOptions | null = null;

    function buildCheckoutUrl(opts: EmbedOptions): string {
        const base = opts.baseUrl.replace(/\/$/, "");
        const url = new URL(`${base}/pay/s/${opts.token}`);
        if (opts.locale) url.searchParams.set("locale", opts.locale);
        return url.toString();
    }

    function open(opts: EmbedOptions): void {
        if (!opts.baseUrl || !opts.token) {
            console.error("[AnybillEmbed] Missing required options: baseUrl, token");
            return;
        }

        close();

        currentOptions = opts;
        injectStyles();

        const overlay = document.createElement("div");
        overlay.id = OVERLAY_ID;

        const modal = document.createElement("div");
        modal.className = "anybill-modal";

        const closeBtn = document.createElement("button");
        closeBtn.className = "anybill-close";
        closeBtn.innerHTML = "&#x2715;";
        closeBtn.title = "Close";
        closeBtn.addEventListener("click", close);

        const iframe = document.createElement("iframe");
        iframe.id = FRAME_ID;
        iframe.src = buildCheckoutUrl(opts);
        iframe.allow = "payment";
        iframe.setAttribute("loading", "eager");

        modal.appendChild(closeBtn);
        modal.appendChild(iframe);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        document.body.style.overflow = "hidden";

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                overlay.classList.add("visible");
            });
        });

        window.addEventListener("message", handleMessage);
    }

    function close(): void {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) {
            overlay.classList.remove("visible");
            setTimeout(() => overlay.remove(), 300);
        }
        document.body.style.overflow = "";
        window.removeEventListener("message", handleMessage);

        if (currentOptions?.onClose) {
            currentOptions.onClose();
        }
        currentOptions = null;
    }

    function handleMessage(event: MessageEvent): void {
        if (!currentOptions) return;

        const base = currentOptions.baseUrl.replace(/\/$/, "");
        try {
            const expectedOrigin = new URL(base).origin;
            if (event.origin !== expectedOrigin) return;
        } catch {
            return;
        }

        const data = event.data;
        if (!data || typeof data !== "object") return;

        if (data.type === "anybill:payment:confirmed") {
            if (currentOptions.onSuccess) {
                currentOptions.onSuccess(data.invoiceId);
            }
            setTimeout(close, 1500);
        }

        if (data.type === "anybill:checkout:paying") {
            const closeBtn = document.querySelector(`#${OVERLAY_ID} .anybill-close`) as HTMLElement | null;
            if (closeBtn) closeBtn.style.display = "none";
        }

        if (data.type === "anybill:checkout:close") {
            close();
        }
    }

    // ─── Auto-bind data-attribute buttons ───────────────

    function bindButtons(): void {
        const buttons = document.querySelectorAll<HTMLElement>("[data-anybill-checkout]");
        buttons.forEach((btn) => {
            if (btn.dataset.anybillBound) return;
            btn.dataset.anybillBound = "true";

            btn.addEventListener("click", (e) => {
                e.preventDefault();
                const baseUrl = btn.dataset.baseUrl || btn.dataset.anybillBaseUrl || "";
                const token = btn.dataset.token || btn.dataset.anybillToken || "";

                if (!baseUrl || !token) {
                    console.error("[AnybillEmbed] data-base-url and data-token are required on the button element.");
                    return;
                }

                open({ baseUrl, token });
            });
        });
    }

    // ─── Initialize ─────────────────────────────────────

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindButtons);
    } else {
        bindButtons();
    }

    const observer = new MutationObserver(() => bindButtons());
    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
    });

    // ─── Public API ─────────────────────────────────────

    (window as any).AnybillEmbed = { open, close };
})();
