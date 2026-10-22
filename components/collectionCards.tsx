"use client";

import { useMemo, useState } from "react";

interface CollectionCard {
    id: number;
    scryfallId: string;
    name: string;
    setCode: string;
    collectorNumber: string;
    imageUrl: string | null;
    quantity: number;
    condition: string;
    finish: string;
    language: string;
    detailsLoaded: boolean;
}

interface Props {
    cards: CollectionCard[];
}

const PAGE_SIZE = 24;

const inputClass =
    "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-teal";

const labelClass =
    "flex min-w-0 flex-col gap-2 text-sm font-medium text-muted";

const buttonClass =
    "inline-flex items-center justify-center rounded-xl border border-accent/40 bg-surface px-4 py-2 text-sm font-semibold text-accent transition-colors enabled:hover:border-accent enabled:hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40";

export default function CollectionCards({ cards }: Props) {
    const [search, setSearch] = useState("");
    const [setCode, setSetCode] = useState("");
    const [condition, setCondition] = useState("");
    const [finish, setFinish] = useState("");
    const [language, setLanguage] = useState("");
    const [sort, setSort] = useState("name");
    const [page, setPage] = useState(1);

    const options = useMemo(
        () => ({
            sets: [
                ...new Set(
                    cards.map((card) => card.setCode).filter(Boolean)
                ),
            ].sort(),
            conditions: [
                ...new Set(cards.map((card) => card.condition)),
            ].sort(),
            finishes: [
                ...new Set(cards.map((card) => card.finish)),
            ].sort(),
            languages: [
                ...new Set(cards.map((card) => card.language)),
            ].sort(),
        }),
        [cards]
    );

    const filteredCards = useMemo(() => {
        const query = search.trim().toLowerCase();

        const result = cards.filter((card) => {
            const searchableText = [
                card.name,
                card.setCode,
                card.collectorNumber,
                card.scryfallId,
            ]
                .join(" ")
                .toLowerCase();

            return (
                (!query || searchableText.includes(query)) &&
                (!setCode || card.setCode === setCode) &&
                (!condition || card.condition === condition) &&
                (!finish || card.finish === finish) &&
                (!language || card.language === language)
            );
        });

        return result.sort((a, b) => {
            if (sort === "quantity") {
                return (
                    b.quantity - a.quantity ||
                    a.name.localeCompare(b.name) ||
                    a.id - b.id
                );
            }

            if (sort === "set") {
                return (
                    a.setCode.localeCompare(b.setCode) ||
                    a.name.localeCompare(b.name) ||
                    a.id - b.id
                );
            }

            if (sort === "name-desc") {
                return (
                    b.name.localeCompare(a.name) ||
                    a.id - b.id
                );
            }

            return (
                a.name.localeCompare(b.name) ||
                a.id - b.id
            );
        });
    }, [cards, search, setCode, condition, finish, language, sort]);

    const totalCopies = cards.reduce(
        (total, card) => total + card.quantity,
        0
    );

    const matchingCopies = filteredCards.reduce(
        (total, card) => total + card.quantity,
        0
    );

    const totalPages = Math.max(
        1,
        Math.ceil(filteredCards.length / PAGE_SIZE)
    );

    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * PAGE_SIZE;

    const visibleCards = filteredCards.slice(
        offset,
        offset + PAGE_SIZE
    );

    const missingDetails = cards.some(
        (card) => !card.detailsLoaded
    );

    const activeFilterCount = [
        search.trim(),
        setCode,
        condition,
        finish,
        language,
    ].filter(Boolean).length;

    function clearFilters() {
        setSearch("");
        setSetCode("");
        setCondition("");
        setFinish("");
        setLanguage("");
        setSort("name");
        setPage(1);
    }

    if (cards.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-teal/30 bg-teal/5 p-8 text-center">
                <h3 className="text-lg font-semibold text-foreground">
                    No cards yet
                </h3>

                <p className="mt-2 text-sm leading-6 text-muted">
                    Open the Import cards section to add cards
                    from a ManaBox CSV.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6 text-foreground">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                    <span className="font-semibold text-foreground">
                        {totalCopies.toLocaleString("en-US")}
                    </span>{" "}
                    copies across{" "}
                    <span className="font-semibold text-foreground">
                        {cards.length.toLocaleString("en-US")}
                    </span>{" "}
                    variants
                </p>

                <span className="badge">
                    {PAGE_SIZE} cards per page
                </span>
            </div>

            {missingDetails && (
                <p
                    role="status"
                    className="rounded-xl border border-accent/25 bg-accent/5 p-4 text-sm leading-6 text-accent"
                >
                    Some card details could not be loaded. Their IDs
                    are shown instead, and name or set searches may
                    be incomplete.
                </p>
            )}

            <section
                aria-label="Filter collection cards"
                className="rounded-xl border border-border bg-background/60 p-4 sm:p-5"
            >
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold">
                        Find your cards
                    </h3>

                    {activeFilterCount > 0 && (
                        <span className="badge">
                            {activeFilterCount} active{" "}
                            {activeFilterCount === 1 ? "filter" : "filters"}
                        </span>
                    )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className={labelClass}>
                        Search cards

                        <input
                            type="search"
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            placeholder="Name, set, collector number, or ID"
                            className={inputClass}
                        />
                    </label>

                    <label className={labelClass}>
                        Set

                        <select
                            value={setCode}
                            onChange={(event) => {
                                setSetCode(event.target.value);
                                setPage(1);
                            }}
                            className={inputClass}
                        >
                            <option value="">All sets</option>

                            {options.sets.map((value) => (
                                <option key={value} value={value}>
                                    {value.toUpperCase()}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className={labelClass}>
                        Condition

                        <select
                            value={condition}
                            onChange={(event) => {
                                setCondition(event.target.value);
                                setPage(1);
                            }}
                            className={inputClass}
                        >
                            <option value="">All conditions</option>

                            {options.conditions.map((value) => (
                                <option key={value} value={value}>
                                    {value}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className={labelClass}>
                        Finish

                        <select
                            value={finish}
                            onChange={(event) => {
                                setFinish(event.target.value);
                                setPage(1);
                            }}
                            className={inputClass}
                        >
                            <option value="">All finishes</option>

                            {options.finishes.map((value) => (
                                <option key={value} value={value}>
                                    {value}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className={labelClass}>
                        Language

                        <select
                            value={language}
                            onChange={(event) => {
                                setLanguage(event.target.value);
                                setPage(1);
                            }}
                            className={inputClass}
                        >
                            <option value="">All languages</option>

                            {options.languages.map((value) => (
                                <option key={value} value={value}>
                                    {value}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className={labelClass}>
                        Sort by

                        <select
                            value={sort}
                            onChange={(event) => {
                                setSort(event.target.value);
                                setPage(1);
                            }}
                            className={inputClass}
                        >
                            <option value="name">Name A–Z</option>
                            <option value="name-desc">Name Z–A</option>
                            <option value="quantity">Most copies</option>
                            <option value="set">Set</option>
                        </select>
                    </label>
                </div>

                <div className="mt-5 border-t border-border pt-4">
                    <button
                        type="button"
                        onClick={clearFilters}
                        className={buttonClass}
                    >
                        Reset filters
                    </button>
                </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p role="status" className="text-sm text-muted">
                    <span className="font-semibold text-teal">
                        {filteredCards.length.toLocaleString("en-US")}
                    </span>{" "}
                    matching variants ·{" "}
                    {matchingCopies.toLocaleString("en-US")} copies
                </p>

                {filteredCards.length > 0 && (
                    <p className="text-xs text-muted">
                        Showing {offset + 1}–
                        {Math.min(
                            offset + PAGE_SIZE,
                            filteredCards.length
                        )}
                    </p>
                )}
            </div>

            {filteredCards.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background/50 p-8 text-center">
                    <h3 className="text-lg font-semibold">
                        No matching cards
                    </h3>

                    <p className="mt-2 text-sm text-muted">
                        Try a different search or reset your filters.
                    </p>

                    <button
                        type="button"
                        onClick={clearFilters}
                        className={`${buttonClass} mt-5`}
                    >
                        Show all cards
                    </button>
                </div>
            ) : (
                <>
                    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {visibleCards.map((card) => {
                            const normalizedFinish = card.finish
                                .trim()
                                .toLowerCase();

                            const isEtched =
                                normalizedFinish.includes("etched");

                            const isFoil =
                                normalizedFinish === "foil";

                            return (
                                <li
                                    key={card.id}
                                    className="min-w-0 overflow-hidden rounded-2xl border border-border bg-background/70 p-3 shadow-lg shadow-black/10 transition-colors hover:border-accent/60"
                                >
                                    <div className="relative mb-4">
                                        {card.imageUrl ? (
                                            <div className="relative isolate overflow-hidden rounded-xl">
                                                <img
                                                    src={card.imageUrl}
                                                    alt={card.name}
                                                    loading="lazy"
                                                    decoding="async"
                                                    width={488}
                                                    height={680}
                                                    className="block h-auto w-full"
                                                />

                                                {isFoil && (
                                                    <div
                                                        aria-hidden="true"
                                                        className="pointer-events-none absolute inset-0 z-10"
                                                        style={{
                                                            background:
                                                                "linear-gradient(115deg, rgba(255,80,160,0.3), rgba(140,90,255,0.3), rgba(50,200,255,0.3), rgba(100,255,150,0.3), rgba(255,220,80,0.3))",
                                                            mixBlendMode:
                                                                "screen",
                                                        }}
                                                    />
                                                )}

                                                {isEtched && (
                                                    <div
                                                        aria-hidden="true"
                                                        className="pointer-events-none absolute inset-0 z-10"
                                                        style={{
                                                            background:
                                                                "repeating-linear-gradient(125deg, rgba(240,220,160,0.4) 0px, rgba(240,220,160,0.4) 1px, transparent 1px, transparent 4px)",
                                                            mixBlendMode:
                                                                "screen",
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex aspect-[488/680] items-center justify-center rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">
                                                Image unavailable
                                            </div>
                                        )}

                                        <span
                                            aria-label={`${card.quantity} copies`}
                                            className="absolute right-2 top-2 z-20 rounded-lg border border-accent/50 bg-background/95 px-2.5 py-1 text-sm font-bold tabular-nums text-accent shadow-lg"
                                        >
                                            {card.quantity}×
                                        </span>
                                    </div>

                                    <div className="px-1 pb-1">
                                        <h3 className="break-words text-base font-semibold leading-snug text-foreground">
                                            {card.name}
                                        </h3>

                                        {card.setCode && (
                                            <p className="mt-2 text-xs font-semibold tracking-wide text-accent">
                                                {card.setCode.toUpperCase()}
                                                {card.collectorNumber &&
                                                    ` #${card.collectorNumber}`}
                                            </p>
                                        )}

                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            <span className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted">
                                                {card.condition}
                                            </span>

                                            <span
                                                className={`rounded-md border px-2 py-1 text-xs ${
                                                    isFoil || isEtched
                                                        ? "border-teal/30 bg-teal/10 text-teal"
                                                        : "border-border bg-surface text-muted"
                                                }`}
                                            >
                                                {card.finish}
                                            </span>

                                            <span className="rounded-md border border-border bg-surface px-2 py-1 text-xs uppercase text-muted">
                                                {card.language}
                                            </span>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    {totalPages > 1 && (
                        <nav
                            aria-label="Card pages"
                            className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"
                        >
                            <button
                                type="button"
                                disabled={currentPage === 1}
                                onClick={() =>
                                    setPage(currentPage - 1)
                                }
                                className={buttonClass}
                            >
                                Previous
                            </button>

                            <span className="text-sm text-muted">
                                Page{" "}
                                <span className="font-semibold text-foreground">
                                    {currentPage}
                                </span>{" "}
                                of {totalPages}
                            </span>

                            <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() =>
                                    setPage(currentPage + 1)
                                }
                                className={buttonClass}
                            >
                                Next
                            </button>
                        </nav>
                    )}
                </>
            )}
        </div>
    );
}