"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function CreateCollection() {
    const router = useRouter();

    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (busy || !name.trim()) return;

        setError("");
        setBusy(true);

        try {
            const response = await fetch("/api/collections", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: name.trim(),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ?? "Could not create collection."
                );
            }

            setName("");
            router.refresh();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not create collection."
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="mt-6">
            <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
                <label className="flex flex-1 flex-col gap-2">
                    New collection name

                    <input
                        type="text"
                        name="collection_name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Main Collection"
                        maxLength={100}
                        required
                        disabled={busy}
                        className="rounded-lg border border-zinc-300 bg-white p-3 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    />
                </label>

                <button
                    type="submit"
                    disabled={busy || !name.trim()}
                    className="rounded-lg bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {busy ? "Creating…" : "Create Collection"}
                </button>
            </form>

            {error && (
                <p role="alert" className="mt-3 text-red-500">
                    {error}
                </p>
            )}
        </section>
    );
}