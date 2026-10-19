"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

interface CollectionOption {
    id: number;
    name: string;
}

interface OwnedCard {
    id: number;
    scryfallId: string;
    name: string;
    quantity: number;
    condition: string;
    finish: string;
    language: string;
}

interface PrintingOption {
    id: string;
    name: string;
    set: string;
    set_name: string;
    collector_number: string;
    finishes: string[];
    image_uris?: {
        small?: string;
    };
    card_faces?: {
        image_uris?: {
            small?: string;
        };
    }[];
}

interface CardInput {
    rowKey: number;
    ownedId: string;
    scryfallId: string;
    availableFinishes: string[];
    quantity: string;
    condition: string;
    finish: string;
    language: string;
}

interface Props {
    collections: CollectionOption[];
}

const inputClass =
    "w-full rounded-lg border border-zinc-300 bg-white p-3 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white";

const buttonClass =
    "rounded-lg border px-4 py-2 disabled:opacity-50";

function emptyCard(rowKey: number): CardInput {
    return {
        rowKey,
        ownedId: "",
        scryfallId: "",
        availableFinishes: [],
        quantity: "1",
        condition: "NM",
        finish: "nonfoil",
        language: "en",
    };
}

async function readJSON(response: Response) {
    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
        throw new Error(
            `Expected JSON but received another response ` +
            `(status ${response.status}). Check the API route.`
        );
    }

    return response.json();
}

// Space searches across purchase rows in this browser tab.
let searchQueue: Promise<void> = Promise.resolve();

async function searchPrintings(
    query: string,
    page: number,
    signal: AbortSignal
): Promise<{ data: PrintingOption[]; has_more: boolean }> {
    const previous = searchQueue;
    let release!: () => void;

    searchQueue = new Promise<void>((resolve) => {
        release = resolve;
    });

    await previous;

    try {
        signal.throwIfAborted();

        const params = new URLSearchParams({
            q: `!${JSON.stringify(query)} game:paper`,
            unique: "prints",
            include_variations: "true",
            order: "released",
            dir: "desc",
            page: String(page),
        });

        const response = await fetch(
            `https://api.scryfall.com/cards/search?${params}`,
            {
                headers: {
                    Accept: "application/json",
                },
                signal: AbortSignal.any([
                    signal,
                    AbortSignal.timeout(15000),
                ]),
            }
        );

        if (response.status === 404) {
            return {
                data: [],
                has_more: false,
            };
        }

        if (response.status === 429) {
            throw new Error(
                "Search is busy. Wait a moment and try again."
            );
        }

        if (!response.ok) {
            throw new Error(
                `Card search failed (${response.status}).`
            );
        }

        return response.json();
    } finally {
        await new Promise((resolve) => setTimeout(resolve, 550));
        release();
    }
}

function PurchaseCardSearch({
    selectedId,
    onSelect,
}: {
    selectedId: string;
    onSelect: (printing: PrintingOption | null) => void;
}) {
    const [query, setQuery] = useState("");
    const [searchedQuery, setSearchedQuery] = useState("");
    const [results, setResults] = useState<PrintingOption[]>([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [searched, setSearched] = useState(false);

    const pending = useRef<AbortController | null>(null);

    const selected = results.find(
        (printing) => printing.id === selectedId
    );

    useEffect(() => {
        return () => pending.current?.abort();
    }, []);

    async function search(more = false) {
        const term = more ? searchedQuery : query.trim();
        if (!term) return;

        pending.current?.abort();

        const controller = new AbortController();
        pending.current = controller;

        setLoading(true);
        setError("");

        const nextPage = more ? page + 1 : 1;

        if (!more) {
            setResults([]);
            setHasMore(false);
            setSearched(false);
            onSelect(null);
        }

        try {
            const result = await searchPrintings(
                term,
                nextPage,
                controller.signal
            );

            if (controller.signal.aborted) return;

            setResults((current) =>
                more
                    ? [...current, ...result.data]
                    : result.data
            );

            setPage(nextPage);
            setHasMore(result.has_more);
            setSearchedQuery(term);
            setSearched(true);
        } catch (error) {
            if (!controller.signal.aborted) {
                setError(
                    error instanceof Error
                        ? error.message
                        : "Could not search cards."
                );
            }
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }

    const image =
        selected?.image_uris?.small ??
        selected?.card_faces?.[0]?.image_uris?.small;

    return (
        <div className="space-y-3">
            <label className="flex flex-col gap-2">
                Card name

                <input
                    value={query}
                    placeholder="Sol Ring"
                    maxLength={255}
                    onChange={(event) => {
                        pending.current?.abort();
                        setLoading(false);
                        setQuery(event.target.value);
                        setResults([]);
                        setHasMore(false);
                        setSearched(false);
                        setError("");
                        onSelect(null);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();

                            if (!loading) {
                                void search();
                            }
                        }
                    }}
                    className={inputClass}
                />
            </label>

            <button
                type="button"
                disabled={loading || !query.trim()}
                onClick={() => void search()}
                className={buttonClass}
            >
                {loading ? "Searching…" : "Search Printings"}
            </button>

            <p className="text-sm text-zinc-500">
                Enter the full card name, then choose its set and
                collector number.
            </p>

            {error && (
                <p role="alert" className="text-red-500">
                    {error}
                </p>
            )}

            {searched && !loading && results.length === 0 && (
                <p>No printings found. Check the full card name.</p>
            )}

            {results.length > 0 && (
                <label className="flex flex-col gap-2">
                    Printing

                    <select
                        value={selectedId}
                        required
                        disabled={loading}
                        onChange={(event) =>
                            onSelect(
                                results.find(
                                    (card) =>
                                        card.id === event.target.value
                                ) ?? null
                            )
                        }
                        className={inputClass}
                    >
                        <option value="">Select a printing</option>

                        {results.map((card) => (
                            <option key={card.id} value={card.id}>
                                {card.name} — {card.set_name}
                                {" ("}
                                {card.set.toUpperCase()}
                                {") #"}
                                {card.collector_number}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            {hasMore && (
                <button
                    type="button"
                    disabled={loading}
                    onClick={() => void search(true)}
                    className="underline disabled:opacity-50"
                >
                    Load More Printings
                </button>
            )}

            {selected && (
                <div className="flex items-center gap-4 rounded-lg border p-3">
                    {image && (
                        <img
                            src={image}
                            alt={selected.name}
                            width={100}
                            height={140}
                            className="h-auto rounded"
                        />
                    )}

                    <p>
                        {selected.name}
                        <br />
                        {selected.set_name}
                        {" · #"}
                        {selected.collector_number}
                    </p>
                </div>
            )}
        </div>
    );
}

export default function TransactionForm({ collections }: Props) {
    const [collectionId, setCollectionId] = useState(
        collections[0] ? String(collections[0].id) : ""
    );

    const [name, setName] = useState("");
    const [type, setType] = useState<"purchase" | "sale">("sale");
    const [totalAmount, setTotalAmount] = useState("");
    const [notes, setNotes] = useState("");

    const [items, setItems] = useState<CardInput[]>([
        emptyCard(0),
    ]);

    const nextRowKey = useRef(1);

    const [ownedCards, setOwnedCards] = useState<OwnedCard[]>([]);
    const [loadingCards, setLoadingCards] = useState(false);
    const [cardsError, setCardsError] = useState("");
    const [reload, setReload] = useState(0);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        if (!collectionId || type !== "sale") {
            setOwnedCards([]);
            setLoadingCards(false);
            setCardsError("");
            return;
        }

        const controller = new AbortController();

        setOwnedCards([]);
        setCardsError("");
        setLoadingCards(true);

        async function loadCards() {
            try {
                const response = await fetch(
                    `/api/collections/${collectionId}/cards`,
                    {
                        cache: "no-store",
                        signal: controller.signal,
                    }
                );

                const data = await readJSON(response);

                if (!response.ok) {
                    throw new Error(
                        data.error ?? "Could not load collection cards."
                    );
                }

                if (!controller.signal.aborted) {
                    setOwnedCards(data.cards);
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    setCardsError(
                        error instanceof Error
                            ? error.message
                            : "Could not load collection cards."
                    );
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoadingCards(false);
                }
            }
        }

        void loadCards();

        return () => controller.abort();
    }, [collectionId, type, reload]);

    function resetSelection() {
        const fresh = emptyCard(nextRowKey.current++);
        setItems([fresh]);
        setError("");
        setSuccess("");
    }

    function updateItem(
        rowKey: number,
        field: "quantity" | "condition" | "finish" | "language",
        value: string
    ) {
        setItems((current) =>
            current.map((item) =>
                item.rowKey === rowKey
                    ? { ...item, [field]: value }
                    : item
            )
        );
    }

    function selectOwnedCard(rowKey: number, ownedId: string) {
        const card = ownedCards.find(
            (entry) => String(entry.id) === ownedId
        );

        setItems((current) =>
            current.map((item) => {
                if (item.rowKey !== rowKey) return item;

                if (!card) return emptyCard(rowKey);

                return {
                    ...item,
                    ownedId,
                    scryfallId: card.scryfallId,
                    quantity: "1",
                    condition: card.condition,
                    finish: card.finish,
                    language: card.language,
                };
            })
        );
    }

    function selectPrinting(
        rowKey: number,
        printing: PrintingOption | null
    ) {
        setItems((current) =>
            current.map((item) => {
                if (item.rowKey !== rowKey) return item;

                if (!printing) {
                    return {
                        ...item,
                        scryfallId: "",
                        availableFinishes: [],
                        finish: "",
                    };
                }

                const supported = printing.finishes.filter(
                    (finish) =>
                        ["nonfoil", "foil", "etched"].includes(finish)
                );

                return {
                    ...item,
                    scryfallId: printing.id,
                    availableFinishes: supported,
                    finish: supported.includes(item.finish)
                        ? item.finish
                        : supported[0] ?? "",
                };
            })
        );
    }

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();
        if (busy) return;

        setError("");
        setSuccess("");

        if (!collectionId || !name.trim()) {
            setError(
                "Select a collection and enter a transaction name."
            );
            return;
        }

        if (!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(totalAmount)) {
            setError("Enter a valid total, such as 25.50.");
            return;
        }

        if (
            type === "sale" &&
            (loadingCards || cardsError || !ownedCards.length)
        ) {
            setError("Load your collection cards before saving.");
            return;
        }

        const requested = new Map<string, number>();

        for (const [index, item] of items.entries()) {
            const quantity = Number(item.quantity);

            if (
                !/^[1-9]\d*$/.test(item.quantity) ||
                !Number.isSafeInteger(quantity) ||
                quantity > 4294967295
            ) {
                setError(
                    `Card ${index + 1}: enter a valid quantity.`
                );
                return;
            }

            if (
                type === "purchase" &&
                (
                    !item.scryfallId ||
                    !item.availableFinishes.includes(item.finish)
                )
            ) {
                setError(
                    `Card ${index + 1}: search by name and ` +
                    "select a printing and finish."
                );
                return;
            }

            if (type === "sale") {
                const owned = ownedCards.find(
                    (card) => String(card.id) === item.ownedId
                );

                if (!owned) {
                    setError(
                        `Card ${index + 1}: select an owned card.`
                    );
                    return;
                }

                const combined =
                    (requested.get(item.ownedId) ?? 0) + quantity;

                if (combined > owned.quantity) {
                    setError(
                        `You only own ${owned.quantity} copies ` +
                        `of ${owned.name}.`
                    );
                    return;
                }

                requested.set(item.ownedId, combined);
            }
        }

        setBusy(true);

        try {
            const response = await fetch("/api/transactions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    collectionId: Number(collectionId),
                    name: name.trim(),
                    type,
                    totalAmount,
                    currency: "USD",
                    notes: notes.trim(),
                    items: items.map((item) => ({
                        scryfallId: item.scryfallId,
                        quantity: Number(item.quantity),
                        condition: item.condition,
                        finish: item.finish,
                        language: item.language,
                    })),
                }),
            });

            const data = await readJSON(response);

            if (!response.ok) {
                throw new Error(
                    data.error ?? "Could not save transaction."
                );
            }

            setSuccess(
                `Transaction #${data.transactionId} saved successfully.`
            );

            setName("");
            setTotalAmount("");
            setNotes("");

            const fresh = emptyCard(nextRowKey.current++);
            setItems([fresh]);

            setOwnedCards([]);
            setLoadingCards(type === "sale");
            setReload((current) => current + 1);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not save transaction."
            );
        } finally {
            setBusy(false);
        }
    }

    const saleUnavailable =
        type === "sale" &&
        (loadingCards || !!cardsError || ownedCards.length === 0);

    if (collections.length === 0) {
        return (
            <p className="mt-6">
                <Link href="/collection" className="underline">
                    Create a collection
                </Link>{" "}
                before recording a transaction.
            </p>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="mt-6">
            {error && (
                <p role="alert" className="mb-4 text-red-500">
                    {error}
                </p>
            )}

            {success && (
                <p role="status" className="mb-4 text-green-600">
                    {success}
                </p>
            )}

            <fieldset disabled={busy} className="space-y-6">
                <label className="flex flex-col gap-2">
                    Collection

                    <select
                        value={collectionId}
                        onChange={(event) => {
                            setCollectionId(event.target.value);
                            setOwnedCards([]);
                            setLoadingCards(type === "sale");
                            resetSelection();
                        }}
                        required
                        className={inputClass}
                    >
                        {collections.map((collection) => (
                            <option
                                key={collection.id}
                                value={collection.id}
                            >
                                {collection.name}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="flex flex-col gap-2">
                    Transaction name

                    <input
                        value={name}
                        onChange={(event) =>
                            setName(event.target.value)
                        }
                        placeholder={
                            type === "sale"
                                ? "Sold my Sol Rings"
                                : "Card shop purchase"
                        }
                        maxLength={100}
                        required
                        className={inputClass}
                    />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-2">
                        Type

                        <select
                            value={type}
                            onChange={(event) => {
                                const nextType =
                                    event.target.value === "sale"
                                        ? "sale"
                                        : "purchase";

                                setType(nextType);
                                setOwnedCards([]);
                                setLoadingCards(nextType === "sale");
                                resetSelection();
                            }}
                            className={inputClass}
                        >
                            <option value="sale">Sale</option>
                            <option value="purchase">Purchase</option>
                        </select>
                    </label>

                    <label className="flex flex-col gap-2">
                        Total {type === "sale" ? "received" : "paid"} (USD)

                        <input
                            type="text"
                            inputMode="decimal"
                            value={totalAmount}
                            onChange={(event) =>
                                setTotalAmount(event.target.value)
                            }
                            placeholder="5.00"
                            required
                            className={inputClass}
                        />
                    </label>
                </div>

                <p className="text-sm text-zinc-500">
                    {type === "sale"
                        ? "Saving removes the sold quantities."
                        : "Saving adds the purchased quantities."}
                    {" "}The price is the total for the entire transaction.
                </p>

                {type === "sale" && (
                    <>
                        {loadingCards && (
                            <p role="status">
                                Loading your cards…
                            </p>
                        )}

                        {cardsError && (
                            <div>
                                <p
                                    role="alert"
                                    className="text-red-500"
                                >
                                    {cardsError}
                                </p>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setReload(
                                            (current) => current + 1
                                        )
                                    }
                                    className="mt-2 underline"
                                >
                                    Try Again
                                </button>
                            </div>
                        )}

                        {!loadingCards &&
                            !cardsError &&
                            ownedCards.length === 0 && (
                                <p>
                                    This collection has no cards to sell.
                                </p>
                            )}
                    </>
                )}

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold">
                        Cards
                    </h2>

                    {items.map((item, index) => {
                        const selected = ownedCards.find(
                            (card) =>
                                String(card.id) === item.ownedId
                        );

                        return (
                            <div
                                key={item.rowKey}
                                className="space-y-4 rounded-xl border p-4"
                            >
                                <div className="flex justify-between">
                                    <h3 className="font-medium">
                                        Card {index + 1}
                                    </h3>

                                    <button
                                        type="button"
                                        disabled={items.length === 1}
                                        onClick={() =>
                                            setItems((current) =>
                                                current.filter(
                                                    (entry) =>
                                                        entry.rowKey !==
                                                        item.rowKey
                                                )
                                            )
                                        }
                                        className="text-red-500 disabled:opacity-40"
                                    >
                                        Remove
                                    </button>
                                </div>

                                {type === "sale" ? (
                                    <>
                                        <label className="flex flex-col gap-2">
                                            Card from your collection

                                            <select
                                                value={item.ownedId}
                                                onChange={(event) =>
                                                    selectOwnedCard(
                                                        item.rowKey,
                                                        event.target.value
                                                    )
                                                }
                                                disabled={saleUnavailable}
                                                required
                                                className={inputClass}
                                            >
                                                <option value="">
                                                    Select a card
                                                </option>

                                                {ownedCards.map((card) => (
                                                    <option
                                                        key={card.id}
                                                        value={card.id}
                                                    >
                                                        {card.name}
                                                        {" · "}
                                                        {card.condition}
                                                        {" · "}
                                                        {card.finish}
                                                        {" · "}
                                                        {card.language}
                                                        {" · "}
                                                        {card.quantity} owned
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        {selected && (
                                            <p className="text-sm text-zinc-500">
                                                {selected.quantity} available.
                                                Printing, condition, finish,
                                                and language are filled
                                                automatically.
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <PurchaseCardSearch
                                            selectedId={item.scryfallId}
                                            onSelect={(printing) =>
                                                selectPrinting(
                                                    item.rowKey,
                                                    printing
                                                )
                                            }
                                        />

                                        <div className="grid gap-4 sm:grid-cols-3">
                                            <label className="flex flex-col gap-2">
                                                Condition

                                                <select
                                                    value={item.condition}
                                                    onChange={(event) =>
                                                        updateItem(
                                                            item.rowKey,
                                                            "condition",
                                                            event.target.value
                                                        )
                                                    }
                                                    className={inputClass}
                                                >
                                                    {[
                                                        "NM",
                                                        "LP",
                                                        "MP",
                                                        "HP",
                                                        "DMG",
                                                    ].map((condition) => (
                                                        <option
                                                            key={condition}
                                                            value={condition}
                                                        >
                                                            {condition}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>

                                            <label className="flex flex-col gap-2">
                                                Finish

                                                <select
                                                    value={
                                                        item.availableFinishes
                                                            .includes(item.finish)
                                                            ? item.finish
                                                            : ""
                                                    }
                                                    onChange={(event) =>
                                                        updateItem(
                                                            item.rowKey,
                                                            "finish",
                                                            event.target.value
                                                        )
                                                    }
                                                    required
                                                    className={inputClass}
                                                >
                                                    <option value="">
                                                        Select finish
                                                    </option>

                                                    {item.availableFinishes.map(
                                                        (finish) => (
                                                            <option
                                                                key={finish}
                                                                value={finish}
                                                            >
                                                                {finish}
                                                            </option>
                                                        )
                                                    )}
                                                </select>
                                            </label>

                                            <label className="flex flex-col gap-2">
                                                Language code

                                                <input
                                                    value={item.language}
                                                    onChange={(event) =>
                                                        updateItem(
                                                            item.rowKey,
                                                            "language",
                                                            event.target.value
                                                                .trim()
                                                                .toLowerCase()
                                                        )
                                                    }
                                                    placeholder="en"
                                                    required
                                                    maxLength={3}
                                                    className={inputClass}
                                                />
                                            </label>
                                        </div>
                                    </>
                                )}

                                <label className="flex flex-col gap-2">
                                    Quantity

                                    <input
                                        type="number"
                                        min="1"
                                        max={
                                            type === "sale"
                                                ? selected?.quantity ?? 1
                                                : 4294967295
                                        }
                                        step="1"
                                        value={item.quantity}
                                        onChange={(event) =>
                                            updateItem(
                                                item.rowKey,
                                                "quantity",
                                                event.target.value
                                            )
                                        }
                                        required
                                        className={inputClass}
                                    />
                                </label>
                            </div>
                        );
                    })}

                    <button
                        type="button"
                        disabled={
                            items.length >= 1000 || saleUnavailable
                        }
                        onClick={() => {
                            const fresh = emptyCard(
                                nextRowKey.current++
                            );

                            setItems((current) => [
                                ...current,
                                fresh,
                            ]);
                        }}
                        className={buttonClass}
                    >
                        Add Another Card
                    </button>
                </section>

                <label className="flex flex-col gap-2">
                    Notes (optional)

                    <textarea
                        value={notes}
                        onChange={(event) =>
                            setNotes(event.target.value)
                        }
                        maxLength={5000}
                        rows={3}
                        className={inputClass}
                    />
                </label>

                <button
                    type="submit"
                    disabled={busy || saleUnavailable}
                    className="rounded-lg bg-blue-600 px-4 py-3 text-white disabled:opacity-50"
                >
                    {busy ? "Saving…" : "Save Transaction"}
                </button>
            </fieldset>

            <Link
                href="/collection"
                className="mt-6 inline-block underline"
            >
                View collections
            </Link>
        </form>
    );
}