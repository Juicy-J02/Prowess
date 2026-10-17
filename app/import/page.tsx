"use client";

import { useState } from "react";
import { importManaboxCSV } from "@/lib/importManaboxCSV";
import type { ManaboxRow } from "@/types/manabox";

export default function Import() {
    const [cards, setCards] = useState<ManaboxRow[]>([]);
    const [error, setError] = useState("");
    const [importing, setImporting] = useState(false);
    const [success, setSuccess] = useState("");
    const [transaction_name, setTransactionName] = useState("")

    async function handleFile(file: File | undefined) {
        if (!file) return;

        setError("");
        setSuccess("");
        setCards([]);
        setImporting(true);
        setTransactionName("");

        try {
            const csv = await file.text();
            const rows = importManaboxCSV(csv);

            setCards(rows);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not import CSV."
            );
        } finally {
            setImporting(false);
        }
    }

    function click() {
        console.log("Transaction name:", transaction_name);
        console.log("Cards:", cards);
    }

    return (
        <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
            <main className="flex flex-1 w-full max-w-3xl flex-col items-center gap-6 py-32 px-16 bg-white dark:bg-black sm:items-start">
                <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
                    Import Transaction
                </h1>

                <label className="flex flex-col gap-2">
                    Select a ManaBox CSV export
                    <input
                        type="file"
                        accept=".csv"
                        disabled={importing}
                        onChange={(event) => {
                            void handleFile(event.target.files?.[0]);
                            event.target.value = "";
                        }}
                    />
                </label>

                {importing && (
                    <p role="status">Importing transaction...</p>
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
                    <div className="w-full">
                        <p>{cards.length} rows parsed.</p>

                        <ul
                            className="mt-4 space-y-2 overflow-auto rounded bg-zinc-100 p-4 text-sm text-black">
                            {cards.map((card, index) => (
                                <li key={index}>
                                    {card.Name}
                                    {" — "}
                                    {card["Set code"]}
                                    {" "}
                                    {card.Condition}
                                    {" "}
                                    {card.Foil}
                                </li>
                            ))}
                        </ul>
                        <button
                            className="mt-4 space-y-2 overflow-auto rounded bg-zinc-100 p-4 text-sm text-black"
                            type="button"
                            onClick={click}>
                            Submit Transaction
                        </button>
                        <input
                            className="ml-4 mt-4 space-y-2 overflow-auto rounded bg-zinc-100 p-4 text-sm text-black"
                            type="text"
                            id="transaction_name"
                            name="transaction_name"
                            placeholder="Transaction Name"
                            aria-label="Transaction Name"
                            value={transaction_name}
                            onChange={(event) => setTransactionName(event.target.value)}
                        />
                    </div>
                )}
            </main>
        </div>
    );
}