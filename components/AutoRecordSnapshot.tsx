"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Result {
    inserted: number;
    missing: number;
}

export default function AutoRecordSnapshot({
    transactionId,
}: {
    transactionId: string;
}) {
    const router = useRouter();

    const [status, setStatus] = useState(
        "Checking today's price history…"
    );
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);

    // Share the request during Strict Mode's effect replay.
    const pending = useRef<{
        key: string;
        promise: Promise<Result>;
    } | null>(null);

    useEffect(() => {
        let active = true;
        const key = `${transactionId}:${attempt}`;

        setError("");
        setStatus("Checking today's price history…");

        async function record(): Promise<Result> {
            const response = await fetch(
                "/api/value/snapshot",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ transactionId }),
                }
            );

            const contentType =
                response.headers.get("content-type") ?? "";

            if (!contentType.includes("application/json")) {
                throw new Error(
                    `Snapshot API returned status ${response.status} ` +
                    "instead of JSON. Check its route."
                );
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ?? "Could not record today's prices."
                );
            }

            return data;
        }

        if (pending.current?.key !== key) {
            pending.current = {
                key,
                promise: record(),
            };
        }

        void pending.current.promise
            .then((data) => {
                if (!active) return;

                setStatus(
                    data.missing > 0
                        ? `Available prices recorded. ${data.missing} ` +
                          "printing/finish variants still have no daily price."
                        : "Today's available prices are recorded."
                );

                // Refresh only when new history was saved.
                if (data.inserted > 0) {
                    router.refresh();
                }
            })
            .catch((error: unknown) => {
                if (!active) return;

                setStatus("");
                setError(
                    error instanceof Error
                        ? error.message
                        : "Could not record today's prices."
                );
            });

        return () => {
            active = false;
        };
    }, [transactionId, attempt, router]);

    return (
        <div className="space-y-2 text-sm">
            {status && (
                <p role="status" className="text-zinc-500">
                    {status}
                </p>
            )}

            {error && (
                <>
                    <p
                        role="status"
                        className="text-amber-600"
                    >
                        {error} Existing history is still shown.
                    </p>

                    <button
                        type="button"
                        onClick={() =>
                            setAttempt((value) => value + 1)
                        }
                        className="underline"
                    >
                        Retry price recording
                    </button>
                </>
            )}
        </div>
    );
}