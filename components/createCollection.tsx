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
        <div>
            <form
                onSubmit={handleSubmit}
                aria-busy={busy}
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
                <label className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="text-sm font-medium text-muted">
                        New collection name
                    </span>

                    <input
                        type="text"
                        name="collection_name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Main Collection"
                        maxLength={100}
                        required
                        disabled={busy}
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted focus:border-teal disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </label>

                <button
                    type="submit"
                    disabled={busy || !name.trim()}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-accent/50 bg-surface px-5 py-3 font-semibold text-accent transition-colors enabled:hover:border-accent enabled:hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {!busy && (
                        <span aria-hidden="true" className="text-lg leading-none">
                            +
                        </span>
                    )}

                    {busy ? "Creating…" : "Create Collection"}
                </button>
            </form>

            {error && (
                <p
                    role="alert"
                    className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm leading-6 text-red-300"
                >
                    {error}
                </p>
            )}
        </div>
    );
}