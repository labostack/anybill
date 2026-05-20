/** Admin login page — email/password authentication form. */
import { createSignal } from "solid-js";
import { api } from "../api/client";
import { Layers } from "lucide-solid";

export function Login() {
    const [email, setEmail] = createSignal("");
    const [password, setPassword] = createSignal("");
    const [error, setError] = createSignal("");
    const [loading, setLoading] = createSignal(false);

    const submit = async (e: Event) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await api.post("/auth/login", {
                email: email(),
                password: password(),
            });
            location.reload();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div class="auth-page">
            <form class="auth-card" onSubmit={submit}>
                <div class="auth-logo">
                    <Layers size={32} color="var(--accent)" />
                    <span>anybill</span>
                </div>
                <h1>Welcome back</h1>
                <p>Sign in to your billing dashboard</p>
                {error() && <div class="error-msg">{error()}</div>}
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" value={email()} onInput={(e) => setEmail(e.target.value)} placeholder="admin@example.com" required />
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" value={password()} onInput={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                </div>
                <button class="btn btn-primary w-full" disabled={loading()}>
                    {loading() ? "Signing in..." : "Sign in"}
                </button>
            </form>
        </div>
    );
}
