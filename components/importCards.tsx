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
    const [fileName, setFileName] = useState("");

    const busy = reading || saving;

    async function handleFile(file: File | undefined) {
        if (!file || busy) return;

        setError("");
        setSuccess("");
        setCards([]);
        setFileName(file.name);
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
            setFileName("");
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
        setFileName("");
        setError("");
        setSuccess("");
    }

    return (
        <div
            aria-busy={busy}
            className="flex w-full min-w-0 flex-col gap-6 text-foreground"
        >
            <header>
                <h2 className="text-xl font-semibold">
                    Import Cards
                </h2>

                <p className="mt-2 text-sm leading-6 text-muted">
                    Upload your ManaBox export, review the cards,
                    then add them to this collection.
                </p>
            </header>

            <label className="flex min-w-0 flex-col gap-4 rounded-xl border border-dashed border-teal/35 bg-teal/5 p-5">
                <span className="flex items-center gap-3">
                    <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal/25 bg-teal/10 text-teal"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-5 w-5"
                        >
                            <path d="M12 16V4" />
                            <path d="m7 9 5-5 5 5" />
                            <path d="M4 16v4h16v-4" />
                        </svg>
                    </span>

                    <span>
                        <span className="block text-sm font-semibold">
                            Select a ManaBox CSV export
                        </span>

                        <span className="mt-1 block text-xs text-muted">
                            Choose a .csv file from your device.
                        </span>
                    </span>
                </span>

                <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={busy}
                    onChange={(event) => {
                        const file = event.target.files?.[0];

                        event.target.value = "";
                        void handleFile(file);
                    }}
                    className="block w-full min-w-0 rounded-lg text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-accent/40 file:bg-background file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-accent hover:file:border-accent hover:file:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                />

                <span className="text-xs leading-6 text-muted">
                    Name and Set code are required. Missing optional
                    values default to quantity 1, NM condition,
                    nonfoil, and English.
                </span>
            </label>

            {(reading || saving) && (
                <p
                    role="status"
                    className="rounded-xl border border-teal/20 bg-teal/5 px-4 py-3 text-sm text-teal"
                >
                    {reading ? "Reading CSV…" : "Importing cards…"}
                </p>
            )}

            {error && (
                <p
                    role="alert"
                    className="break-words rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm leading-6 text-red-300"
                >
                    {error}
                </p>
            )}

            {success && (
                <p
                    role="status"
                    className="rounded-xl border border-green-400/25 bg-green-400/10 px-4 py-3 text-sm leading-6 text-green-300"
                >
                    {success}
                </p>
            )}

            {cards.length > 0 && (
                <section
                    aria-label="Import preview"
                    className="flex min-w-0 flex-col gap-4"
                >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="text-base font-semibold">
                                Review your import
                            </h3>

                            {fileName && (
                                <p className="mt-1 break-words text-sm text-muted">
                                    {fileName}
                                </p>
                            )}
                        </div>

                        <span className="badge">
                            {cards.length.toLocaleString("en-US")}{" "}
                            {cards.length === 1 ? "row" : "rows"} ready
                        </span>
                    </div>

                    <ul className="max-h-96 overflow-auto rounded-xl border border-border bg-background text-sm">
                        {cards.map((card, index) => (
                            <li
                                key={index}
                                className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
                            >
                                <span className="shrink-0 rounded-lg border border-accent/25 bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
                                    {card.Quantity?.trim() || "1"}×
                                </span>

                                <div className="min-w-0">
                                    <p className="break-words font-medium">
                                        {card.Name}
                                    </p>

                                    <p className="mt-1 break-words text-xs leading-6 text-muted">
                                        {card["Set code"]}
                                        {" · "}
                                        {card.Condition?.trim() || "NM"}
                                        {" · "}
                                        {card.Foil?.trim() || "nonfoil"}
                                        {" · "}
                                        {card.Language?.trim() || "en"}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>

                    <p className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm leading-6 text-accent">
                        Importing adds these quantities to this
                        collection. Importing the same file again
                        adds them again.
                    </p>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void importCards()}
                            className="inline-flex items-center justify-center rounded-xl border border-[#efd079]/50 bg-[#0a2032] px-5 py-3 text-sm font-semibold text-[#efd079] transition-colors enabled:hover:border-[#efd079] enabled:hover:bg-[#103047] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {saving ? "Importing…" : "Import Cards"}
                        </button>

                        <button
                            type="button"
                            disabled={busy}
                            onClick={discardPreview}
                            className="inline-flex items-center justify-center rounded-xl border border-[#294557] bg-[#03101f] px-5 py-3 text-sm font-medium text-[#a8bdc8] transition-colors enabled:hover:border-[#44e0c5]/50 enabled:hover:bg-[#103047] enabled:hover:text-[#44e0c5] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Discard Preview
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
}