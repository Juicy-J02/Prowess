"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
    collectionId: number;
    collectionName: string;
}

export default function DeleteCollectionButton({
    collectionId,
    collectionName,
}: Props) {
    const router = useRouter();

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function deleteCollection() {
        if (busy) return;

        const confirmed = window.confirm(
            `Delete "${collectionName}" and all its cards? ` +
            "This cannot be undone."
        );

        if (!confirmed) return;

        setError("");
        setBusy(true);

        try {
            const response = await fetch(
                `/api/collections/${collectionId}`,
                { method: "DELETE" }
            );

            const contentType =
                response.headers.get("content-type") ?? "";

            if (!contentType.includes("application/json")) {
                throw new Error(
                    "Could not delete collection. Check the API route."
                );
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ?? "Could not delete collection."
                );
            }

            router.refresh();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not delete collection."
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-col items-end gap-2">
            <button
                type="button"
                onClick={() => void deleteCollection()}
                disabled={busy}
                aria-label={`Delete ${collectionName}`}
                aria-busy={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-background px-3 py-2 text-sm font-medium text-red-300 transition-colors enabled:hover:border-red-400/60 enabled:hover:bg-red-400/10 enabled:hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
                <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0"
                >
                    <path d="M3 6h18" />
                    <path d="M9 6V4h6v2" />
                    <path d="m5 6 1 14h12l1-14" />
                    <path d="M10 10v6M14 10v6" />
                </svg>

                {busy ? "Deleting…" : "Delete"}
            </button>

            {error && (
                <p
                    role="alert"
                    className="max-w-xs break-words rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-right text-sm leading-5 text-red-300"
                >
                    {error}
                </p>
            )}
        </div>
    );
}