/** Embed — integration guide for the AnyBill checkout widget. */
import { createSignal } from "solid-js";
import { Code, Copy, Check, ExternalLink } from "lucide-solid";

function CopyButton(props: { text: string }) {
    const [copied, setCopied] = createSignal(false);

    const copy = async () => {
        await navigator.clipboard.writeText(props.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button class="copy-btn" onClick={copy} title="Copy to clipboard">
            {copied() ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied() ? "Copied!" : "Copy"}</span>
        </button>
    );
}

function CodeBlock(props: { code: string; lang?: string }) {
    return (
        <div class="code-block">
            <div class="code-block-header">
                <span class="code-block-lang">{props.lang || "html"}</span>
                <CopyButton text={props.code} />
            </div>
            <pre><code>{props.code}</code></pre>
        </div>
    );
}

const HTML_SNIPPET = `<script src="https://your-anybill-domain.com/embed.js"></script>

<button
  data-anybill-checkout
  data-base-url="https://your-anybill-domain.com"
  data-subscription-id="SUBSCRIPTION_UUID"
  data-uid="USER_ID">
  Subscribe
</button>`;

const JS_SNIPPET = `// Make sure embed.js is loaded first
AnybillEmbed.open({
  baseUrl: "https://your-anybill-domain.com",
  subscriptionId: "SUBSCRIPTION_UUID",
  uid: "USER_ID",
  theme: "dark",            // optional: "dark" | "auto"
  onSuccess: (invoiceId) => {
    console.log("Payment confirmed!", invoiceId);
  },
  onClose: () => {
    console.log("Checkout closed");
  },
});`;

const CLOSE_SNIPPET = `AnybillEmbed.close();`;

const POST_MESSAGE_SNIPPET = `window.addEventListener("message", (event) => {
  if (event.data?.type === "anybill:payment:confirmed") {
    console.log("Paid! Invoice:", event.data.invoiceId);
  }
  if (event.data?.type === "anybill:checkout:close") {
    console.log("Checkout was closed");
  }
});`;

export function Embed() {
    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Embed Widget</h1>
                    <p class="page-description">
                        Drop-in checkout integration for any website
                    </p>
                </div>
            </div>

            {/* Quick Start */}
            <div class="card">
                <div class="card-title">
                    <Code size={16} style={{ "vertical-align": "-3px", "margin-right": "8px", opacity: 0.6 }} />
                    Quick Start — HTML
                </div>
                <p class="embed-desc">
                    Add the script tag and a button with <code>data-anybill-checkout</code> attribute.
                    The widget will automatically bind click handlers and open a modal checkout overlay.
                </p>
                <CodeBlock code={HTML_SNIPPET} lang="html" />
            </div>

            {/* Programmatic API */}
            <div class="card">
                <div class="card-title">
                    <Code size={16} style={{ "vertical-align": "-3px", "margin-right": "8px", opacity: 0.6 }} />
                    Programmatic API — JavaScript
                </div>
                <p class="embed-desc">
                    For full control, use the <code>AnybillEmbed.open()</code> method directly.
                    This lets you pass callbacks and configure the widget at runtime.
                </p>
                <CodeBlock code={JS_SNIPPET} lang="javascript" />

                <p class="embed-desc" style={{ "margin-top": "16px" }}>
                    To close the modal programmatically:
                </p>
                <CodeBlock code={CLOSE_SNIPPET} lang="javascript" />
            </div>

            {/* Parameters */}
            <div class="card">
                <div class="card-title">Configuration</div>
                <div class="table-wrap" style={{ margin: 0 }}>
                    <table>
                        <thead>
                            <tr>
                                <th>Parameter</th>
                                <th>HTML Attribute</th>
                                <th>Required</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><code>baseUrl</code></td>
                                <td class="mono">data-base-url</td>
                                <td><span class="badge badge-active">Yes</span></td>
                                <td>Your AnyBill instance URL</td>
                            </tr>
                            <tr>
                                <td><code>subscriptionId</code></td>
                                <td class="mono">data-subscription-id</td>
                                <td><span class="badge badge-active">Yes</span></td>
                                <td>UUID of the subscription plan</td>
                            </tr>
                            <tr>
                                <td><code>uid</code></td>
                                <td class="mono">data-uid</td>
                                <td><span class="badge badge-active">Yes</span></td>
                                <td>Your app's user identifier</td>
                            </tr>
                            <tr>
                                <td><code>theme</code></td>
                                <td class="mono">data-theme</td>
                                <td><span class="badge badge-expired">No</span></td>
                                <td><code>"dark"</code> or <code>"auto"</code> (default: dark)</td>
                            </tr>
                            <tr>
                                <td><code>onSuccess</code></td>
                                <td class="mono">—</td>
                                <td><span class="badge badge-expired">No</span></td>
                                <td>Callback on successful payment. Receives <code>invoiceId</code>.</td>
                            </tr>
                            <tr>
                                <td><code>onClose</code></td>
                                <td class="mono">—</td>
                                <td><span class="badge badge-expired">No</span></td>
                                <td>Callback when modal is closed</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Events */}
            <div class="card">
                <div class="card-title">PostMessage Events</div>
                <p class="embed-desc">
                    If you can't use callbacks (e.g. the embed is on a different origin),
                    listen for <code>postMessage</code> events from the iframe:
                </p>
                <CodeBlock code={POST_MESSAGE_SNIPPET} lang="javascript" />

                <div class="table-wrap" style={{ "margin-top": "16px" }}>
                    <table>
                        <thead>
                            <tr>
                                <th>Event Type</th>
                                <th>Data</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="mono">anybill:payment:confirmed</td>
                                <td><code>{"{ invoiceId: string }"}</code></td>
                                <td>Payment was successfully confirmed</td>
                            </tr>
                            <tr>
                                <td class="mono">anybill:checkout:close</td>
                                <td>—</td>
                                <td>User closed the checkout modal</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* How it works */}
            <div class="card">
                <div class="card-title">How It Works</div>
                <div class="embed-steps">
                    <div class="embed-step">
                        <div class="embed-step-num">1</div>
                        <div>
                            <strong>Script loads</strong>
                            <p>The embed script auto-binds all <code>[data-anybill-checkout]</code> buttons on the page and watches for dynamically added ones.</p>
                        </div>
                    </div>
                    <div class="embed-step">
                        <div class="embed-step-num">2</div>
                        <div>
                            <strong>Modal opens</strong>
                            <p>On click, a fullscreen overlay with an iframe is injected. The iframe loads your checkout page.</p>
                        </div>
                    </div>
                    <div class="embed-step">
                        <div class="embed-step-num">3</div>
                        <div>
                            <strong>Payment completes</strong>
                            <p>After payment, the checkout page sends a <code>postMessage</code> to the parent. The widget fires <code>onSuccess</code> and auto-closes.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
