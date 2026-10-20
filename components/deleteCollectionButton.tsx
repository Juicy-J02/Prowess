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
                className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
            >
                {busy ? "Deleting…" : "Delete"}
            </button>

            {error && (
                <p
                    role="alert"
                    className="max-w-xs text-right text-sm text-red-500"
                >
                    {error}
                </p>
            )}
        </div>
    );
}