/** Settings page — checkout configuration and password management. */
import { createSignal, onMount, Show } from "solid-js";
import { api } from "../api/client";

export function Settings() {
    const [settings, setSettings] = createSignal<any>(null);
    const [currentPw, setCurrentPw] = createSignal("");
    const [newPw, setNewPw] = createSignal("");
    const [confirmPw, setConfirmPw] = createSignal("");
    const [pwMsg, setPwMsg] = createSignal("");
    const [pwSuccess, setPwSuccess] = createSignal(false);
    const [redirectUrl, setRedirectUrl] = createSignal("");
    const [hidePoweredBy, setHidePoweredBy] = createSignal(false);
    const [saveMsg, setSaveMsg] = createSignal("");

    onMount(async () => {
        const data = await api.get("/settings");
        setSettings(data);
        setRedirectUrl(data.successRedirectUrl || "");
        setHidePoweredBy(data.checkoutConfig?.hidePoweredBy ?? false);
    });

    const changePassword = async (e: Event) => {
        e.preventDefault();
        setPwMsg("");
        setPwSuccess(false);
        try {
            await api.put("/settings/password", {
                currentPassword: currentPw(),
                newPassword: newPw(),
                confirmPassword: confirmPw(),
            });
            setPwMsg("Password changed successfully");
            setPwSuccess(true);
            setCurrentPw(""); setNewPw(""); setConfirmPw("");
        } catch (err: any) {
            setPwMsg(err.message);
            setPwSuccess(false);
        }
    };

    const saveCheckout = async () => {
        setSaveMsg("");
        try {
            await api.put("/settings/checkout", {
                successRedirectUrl: redirectUrl(),
                checkoutConfig: {
                    ...settings()?.checkoutConfig,
                    hidePoweredBy: hidePoweredBy(),
                },
            });
            setSaveMsg("Saved!");
        } catch (err: any) {
            setSaveMsg(err.message);
        }
    };

    return (
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Settings</h1>
                    <p class="page-description">Account and checkout configuration</p>
                </div>
            </div>

            <Show when={settings()}>
                <div class="card">
                    <div class="card-title">Checkout Settings</div>
                    <div class="form-group">
                        <label>Success Redirect URL</label>
                        <input
                            value={redirectUrl()}
                            onInput={(e) => setRedirectUrl(e.target.value)}
                            placeholder="https://myapp.com/success"
                        />
                        <div class="form-hint">Where to redirect users after successful payment</div>
                    </div>
                    <div class="form-group">
                        <label class="toggle-row">
                            <input
                                type="checkbox"
                                checked={hidePoweredBy()}
                                onChange={(e) => setHidePoweredBy(e.target.checked)}
                            />
                            <span>Hide "Powered by anybill" on checkout page</span>
                        </label>
                    </div>
                    <div class="flex items-center gap-3">
                        <button class="btn btn-primary" onClick={saveCheckout}>Save changes</button>
                        <Show when={saveMsg()}>
                            <span class="text-sm text-success">{saveMsg()}</span>
                        </Show>
                    </div>
                </div>

                <div class="card">
                    <div class="card-title">Change Password</div>
                    <form onSubmit={changePassword}>
                        <div class="form-group">
                            <label>Current Password</label>
                            <input type="password" value={currentPw()} onInput={(e) => setCurrentPw(e.target.value)} />
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>New Password</label>
                                <input type="password" value={newPw()} onInput={(e) => setNewPw(e.target.value)} minLength={8} />
                            </div>
                            <div class="form-group">
                                <label>Confirm Password</label>
                                <input type="password" value={confirmPw()} onInput={(e) => setConfirmPw(e.target.value)} />
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <button class="btn btn-primary" type="submit">Update password</button>
                            <Show when={pwMsg()}>
                                <span class={`text-sm ${pwSuccess() ? "text-success" : "text-danger"}`}>{pwMsg()}</span>
                            </Show>
                        </div>
                    </form>
                </div>
            </Show>
        </div>
    );
}
