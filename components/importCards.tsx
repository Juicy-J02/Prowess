"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importManaboxCSV } from "@/lib/importManaboxCSV";
import type { ManaboxRow } from "@/types/manabox";

interface Props {
    collectionId: number;
}

export default function ImportCards({ collectionId }: Props) {
    const router = useRouter();

    const [cards, setCards] = useState<ManaboxRow[]>([]);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [reading, setReading] = useState(false);
    const [saving, setSaving] = useState(false);

    const busy = reading || saving;

    async function handleFile(file: File | undefined) {
        if (!file || busy) return;

        setError("");
        setSuccess("");
        setCards([]);
        setReading(true);

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
            setReading(false);
        }
    }

    async function importCards() {
        if (busy) return;

        setError("");
        setSuccess("");

        if (cards.length === 0) {
            setError("Upload a CSV first.");
            return;
        }

        setSaving(true);

        try {
            const response = await fetch("/api/collections/import", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    collectionId,
                    rows: cards,
                }),
            });

            const contentType =
                response.headers.get("content-type") ?? "";

            if (!contentType.includes("application/json")) {
                throw new Error(
                    "The import API did not return JSON. Check /api/collections/import."
                );
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ?? "Could not import cards."
                );
            }

            setCards([]);
            setSuccess(
                data.message ?? "Cards imported successfully."
            );

            router.refresh();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not import cards."
            );
        } finally {
            setSaving(false);
        }
    }

    function discardPreview() {
        if (busy) return;

        setCards([]);
        setError("");
        setSuccess("");
    }

    return (
        <div className="flex w-full flex-col gap-6 text-black dark:text-white">
            <h2 className="text-2xl font-semibold">
                Import Cards
            </h2>

            <label className="flex flex-col gap-2">
                Select a ManaBox CSV export

                <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={busy}
                    onChange={(event) => {
                        const file = event.target.files?.[0];

                        event.target.value = "";
                        void handleFile(file);
                    }}
                />

                <span className="text-sm text-zinc-500">
                    Name and Set code are required. Missing optional
                    values default to quantity 1, NM condition,
                    nonfoil, and English.
                </span>
            </label>

            {reading && (
                <p role="status">Reading CSV…</p>
            )}

            {saving && (
                <p role="status">Importing cards…</p>
            )}

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
                                {card.Quantity?.trim() || "1"}×{" "}
                                {card.Name}
                                {" — "}
                                {card["Set code"]}
                                {" · "}
                                {card.Condition?.trim() || "NM"}
                                {" · "}
                                {card.Foil?.trim() || "nonfoil"}
                                {" · "}
                                {card.Language?.trim() || "en"}
                            </li>
                        ))}
                    </ul>

                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Importing adds these quantities to this
                        collection. Importing the same file again
                        adds them again.
                    </p>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void importCards()}
                            className="rounded-lg bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            {saving ? "Importing…" : "Import Cards"}
                        </button>

                        <button
                            type="button"
                            disabled={busy}
                            onClick={discardPreview}
                            className="rounded-lg border px-4 py-3 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-900"
                        >
                            Discard Preview
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
}