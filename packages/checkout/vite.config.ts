import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
    plugins: [solidPlugin()],
    server: {
        port: 3002,
        proxy: {
            "/api": "http://localhost:3000",
        },
    },
    build: {
        target: "esnext",
        outDir: "dist",
    },
});
