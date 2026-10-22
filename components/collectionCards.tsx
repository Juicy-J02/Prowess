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
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white";

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
            <p className="rounded-lg border border-dashed p-6">
                This collection has no cards yet. Import cards from
                the collections page to get started.
            </p>
        );
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {totalCopies} copies across {cards.length} variants
            </p>

            {missingDetails && (
                <p role="status" className="text-sm text-amber-600">
                    Some card details could not be loaded. Their IDs
                    are shown instead, and name or set searches may
                    be incomplete.
                </p>
            )}

            <section
                aria-label="Filter collection cards"
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="flex flex-col gap-2">
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

                    <label className="flex flex-col gap-2">
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

                    <label className="flex flex-col gap-2">
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

                    <label className="flex flex-col gap-2">
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

                    <label className="flex flex-col gap-2">
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

                    <label className="flex flex-col gap-2">
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

                <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-4 text-sm underline"
                >
                    Clear filters
                </button>
            </section>

            <p
                role="status"
                className="text-sm text-zinc-600 dark:text-zinc-400"
            >
                {filteredCards.length} matching variants ·{" "}
                {matchingCopies} copies
            </p>

            {filteredCards.length === 0 ? (
                <p>No cards match your filters.</p>
            ) : (
                <>
                    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {visibleCards.map((card) => (
                            <li
                                key={card.id}
                                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                            >
                                {card.imageUrl ? (
                                    <img
                                        src={card.imageUrl}
                                        alt={card.name}
                                        loading="lazy"
                                        decoding="async"
                                        width={488}
                                        height={680}
                                        className="mb-3 h-auto w-full rounded-lg"
                                    />
                                ) : (
                                    <div className="mb-3 flex aspect-[488/680] items-center justify-center rounded-lg bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-900">
                                        Image unavailable
                                    </div>
                                )}

                                <h2 className="break-words font-semibold">
                                    {card.quantity}× {card.name}
                                </h2>

                                {card.setCode && (
                                    <p className="mt-2 text-sm">
                                        {card.setCode.toUpperCase()}
                                        {card.collectorNumber &&
                                            ` #${card.collectorNumber}`}
                                    </p>
                                )}

                                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                                    {card.condition} · {card.finish}
                                    {" · "}
                                    {card.language}
                                </p>
                            </li>
                        ))}
                    </ul>

                    {totalPages > 1 && (
                        <nav
                            aria-label="Card pages"
                            className="flex items-center justify-between gap-4"
                        >
                            <button
                                type="button"
                                disabled={currentPage === 1}
                                onClick={() =>
                                    setPage(currentPage - 1)
                                }
                                className="rounded-lg border px-4 py-2 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-900"
                            >
                                Previous
                            </button>

                            <span className="text-sm">
                                Page {currentPage} of {totalPages}
                            </span>

                            <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() =>
                                    setPage(currentPage + 1)
                                }
                                className="rounded-lg border px-4 py-2 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-900"
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