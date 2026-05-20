import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig(({ mode }) => ({
    plugins: [solidPlugin()],
    base: mode === "production" ? "/admin/" : "/",
    server: {
        port: 3001,
        proxy: {
            "/api": "http://localhost:3000",
        },
    },
    build: {
        target: "esnext",
        outDir: "dist",
    },
}));
