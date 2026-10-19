"use client";

import { useState } from "react";
import Link from "next/link";
import { importManaboxCSV } from "@/lib/importManaboxCSV";
import type { ManaboxRow } from "@/types/manabox";

interface CollectionOption {
    id: number;
    name: string;
}

interface Props {
    collections: CollectionOption[];
}

export default function ImportTransaction({ collections }: Props) {
    const [collectionId, setCollectionId] = useState(
        collections[0] ? String(collections[0].id) : ""
    );
    const [cards, setCards] = useState<ManaboxRow[]>([]);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [busy, setBusy] = useState(false);

    async function handleFile(file: File | undefined) {
        if (!file || busy) return;

        setError("");
        setSuccess("");
        setCards([]);
        setBusy(true);

        try {
            const csv = await file.text();
            const rows = importManaboxCSV(csv);

            if (rows.length === 0) {
                throw new Error("The CSV has no cards.");
            }

            setCards(rows);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not read CSV."
            );
        } finally {
            setBusy(false);
        }
    }

    async function importCards() {
        if (busy) return;

        setError("");
        setSuccess("");

        if (!collectionId || cards.length === 0) {
            setError("Select a collection and upload a CSV first.");
            return;
        }

        setBusy(true);

        try {
            const response = await fetch("/api/collections/import", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    collectionId: Number(collectionId),
                    rows: cards,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error ?? "Could not import cards.");
            }

            setCards([]);
            setSuccess(data.message ?? "Cards imported successfully.");
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not import cards."
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-16 text-black dark:text-white">
            <h1 className="text-3xl font-semibold">
                Import Collection
            </h1>

            {collections.length === 0 ? (
                <p>
                    <Link href="/collection" className="underline">
                        Create a collection
                    </Link>{" "}
                    before importing cards.
                </p>
            ) : (
                <>
                    <label className="flex flex-col gap-2">
                        Destination collection

                        <select
                            value={collectionId}
                            onChange={(event) => {
                                setCollectionId(event.target.value);
                                setSuccess("");
                            }}
                            disabled={busy}
                            className="rounded-lg border border-zinc-300 bg-white p-3 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                        >
                            <option value="">Select a collection</option>

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
                        Select a ManaBox CSV export

                        <input
                            type="file"
                            accept=".csv"
                            disabled={busy}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                void handleFile(file);
                            }}
                        />
                    </label>
                </>
            )}

            {busy && <p role="status">Please wait…</p>}

            {error && (
                <p role="alert" className="text-red-500">
                    {error}
                </p>
            )}

            {success && (
                <p role="status" className="text-green-600">
                    {success}
                </p>
            )}

            {cards.length > 0 && (
                <section className="flex flex-col gap-4">
                    <p>{cards.length} rows ready to import.</p>

                    <ul className="max-h-96 space-y-2 overflow-auto rounded-lg bg-zinc-100 p-4 text-sm dark:bg-zinc-900">
                        {cards.map((card, index) => (
                            <li key={index}>
                                {card.Quantity?.trim() || "1"}× {card.Name}
                                {" — "}
                                {card["Set code"]}
                                {" · "}
                                {card.Condition?.trim() || "NM"}
                                {" · "}
                                {card.Foil?.trim() || "nonfoil"}
                            </li>
                        ))}
                    </ul>

                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Importing adds these quantities to your collection.
                        Importing the same file again adds them again.
                    </p>

                    <button
                        type="button"
                        disabled={busy || !collectionId}
                        onClick={() => void importCards()}
                        className="rounded-lg bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {busy ? "Please wait…" : "Import Cards"}
                    </button>
                </section>
            )}

            <Link href="/collection" className="underline">
                View collections
            </Link>
        </main>
    );
}