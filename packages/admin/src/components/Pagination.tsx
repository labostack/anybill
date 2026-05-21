import { Component, For, Show } from "solid-js";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-solid";

const LIMIT_OPTIONS = [25, 50, 100];

interface PaginationProps {
    page: number;
    total: number;
    limit: number;
    onPageChange: (page: number) => void;
    onLimitChange?: (limit: number) => void;
}

export const Pagination: Component<PaginationProps> = (props) => {
    const totalPages = () => Math.max(1, Math.ceil(props.total / props.limit));
    const hasPrev = () => props.page > 1;
    const hasNext = () => props.page < totalPages();

    /** Build the page number window: always show first, last, current ±1, with ellipsis */
    const pages = (): Array<number | "..."> => {
        const tp = totalPages();
        if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1);

        const cur = props.page;
        if (cur <= 4) {
            return [1, 2, 3, 4, 5, "...", tp];
        }
        if (cur >= tp - 3) {
            return [1, "...", tp - 4, tp - 3, tp - 2, tp - 1, tp];
        }
        return [1, "...", cur - 1, cur, cur + 1, "...", tp];
    };

    const from = () => props.total === 0 ? 0 : Math.min((props.page - 1) * props.limit + 1, props.total);
    const to = () => Math.min(props.page * props.limit, props.total);

    return (
        <div class="pagination">
            {/* Left: results count */}
            <span class="pagination-info">
                {props.total === 0
                    ? "No results"
                    : `${from()}–${to()} of ${props.total}`}
            </span>

            {/* Center: page controls */}
            <div class="pagination-controls">
                <button
                    class="pagination-btn"
                    disabled={!hasPrev()}
                    onClick={() => props.onPageChange(1)}
                    title="First page"
                >
                    <ChevronsLeft size={15} />
                </button>

                <button
                    class="pagination-btn"
                    disabled={!hasPrev()}
                    onClick={() => props.onPageChange(props.page - 1)}
                    title="Previous page"
                >
                    <ChevronLeft size={15} />
                </button>

                <div class="pagination-pages">
                    <For each={pages()}>
                        {(p) => (
                            <Show
                                when={p !== "..."}
                                fallback={<span class="pagination-ellipsis">…</span>}
                            >
                                <button
                                    class={`pagination-page ${p === props.page ? "pagination-page-active" : ""}`}
                                    onClick={() => typeof p === "number" && props.onPageChange(p)}
                                >
                                    {p}
                                </button>
                            </Show>
                        )}
                    </For>
                </div>

                <button
                    class="pagination-btn"
                    disabled={!hasNext()}
                    onClick={() => props.onPageChange(props.page + 1)}
                    title="Next page"
                >
                    <ChevronRight size={15} />
                </button>

                <button
                    class="pagination-btn"
                    disabled={!hasNext()}
                    onClick={() => props.onPageChange(totalPages())}
                    title="Last page"
                >
                    <ChevronsRight size={15} />
                </button>
            </div>

            {/* Right: per-page selector */}
            <Show when={props.onLimitChange}>
                <div class="pagination-per-page">
                    <span class="pagination-per-page-label">Per page</span>
                    <select
                        class="pagination-per-page-select"
                        value={props.limit}
                        onChange={(e) => {
                            props.onLimitChange!(Number(e.target.value));
                            props.onPageChange(1);
                        }}
                    >
                        <For each={LIMIT_OPTIONS}>
                            {(n) => <option value={n}>{n}</option>}
                        </For>
                    </select>
                </div>
            </Show>
        </div>
    );
};
