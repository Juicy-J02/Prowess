import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect, notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/server/database";
import {
    SESSION_COOKIE,
    getSessionUser,
} from "@/lib/server/session";

interface CollectionRow extends RowDataPacket {
    id: number;
    name: string;
}

interface CardRow extends RowDataPacket {
    id: number;
    scryfall_id: string;
    quantity: number;
    card_condition: string;
    finish: string;
    language: string;
}

interface CardDetails {
    name: string;
    imageUrl: string | null;
}

interface ScryfallCard {
    name: string;
    image_uris?: {
        normal?: string;
    };
    card_faces?: {
        image_uris?: {
            normal?: string;
        };
    }[];
}

interface Props {
    params: Promise<{ id: string }>;
}

async function getCardDetails(
    scryfallId: string
): Promise<CardDetails | null> {
    const response = await fetch(
        `https://api.scryfall.com/cards/${encodeURIComponent(scryfallId)}`,
        {
            headers: {
                Accept: "application/json",
                "User-Agent": "Prowess/0.1",
            },
            next: {
                revalidate: 86400,
            },
            signal: AbortSignal.timeout(10000),
        }
    );

    if (!response.ok) {
        return null;
    }

    const card: ScryfallCard = await response.json();

    return {
        name: card.name,
        imageUrl:
            card.image_uris?.normal ??
            card.card_faces?.[0]?.image_uris?.normal ??
            null,
    };
}

export default function CollectionDetailPage({ params }: Props) {
    return (
        <main className="mx-auto w-full max-w-6xl px-6 py-8">
            <Suspense fallback={<p>Loading collection and card images…</p>}>
                <CollectionDetails params={params} />
            </Suspense>
        </main>
    );
}

async function CollectionDetails({ params }: Props) {
    // Keep database work out of prerendering.
    await connection();

    const cookieStore = await cookies();

    const user = await getSessionUser(
        cookieStore.get(SESSION_COOKIE)?.value
    );

    if (!user) {
        redirect("/signIn");
    }

    const { id } = await params;

    if (!/^[1-9]\d*$/.test(id)) {
        notFound();
    }

    // Verify ownership before loading collection cards.
    const [collections] = await db.execute<CollectionRow[]>(
        `SELECT id, name
         FROM collections
         WHERE id = ? AND user_id = ?`,
        [id, user.id]
    );

    const collection = collections[0];

    if (!collection) {
        notFound();
    }

    const [cards] = await db.execute<CardRow[]>(
        `SELECT id, scryfall_id, quantity,
                card_condition, finish, language
         FROM collection_cards
         WHERE collection_id = ?
         ORDER BY id`,
        [collection.id]
    );

    const detailsById = new Map<string, CardDetails | null>();

    for (const card of cards) {
        // Different conditions or finishes may share a printing.
        if (detailsById.has(card.scryfall_id)) continue;

        // Space out external card lookups.
        await new Promise((resolve) => setTimeout(resolve, 550));

        try {
            detailsById.set(
                card.scryfall_id,
                await getCardDetails(card.scryfall_id)
            );
        } catch (error) {
            console.error(
                `Could not load card ${card.scryfall_id}:`,
                error
            );

            detailsById.set(card.scryfall_id, null);
        }
    }

    const totalCards = cards.reduce(
        (total, card) => total + Number(card.quantity),
        0
    );

    const missingDetails = [...detailsById.values()].some(
        (details) => details === null
    );

    return (
        <div className="space-y-6">
            <Link href="/collection" className="underline">
                Back to collections
            </Link>

            <div>
                <h1 className="text-3xl font-semibold">
                    {collection.name}
                </h1>

                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {totalCards} cards
                </p>
            </div>

            {missingDetails && (
                <p role="status" className="text-sm text-amber-600">
                    Some card details could not be loaded. Their IDs are
                    shown instead.
                </p>
            )}

            {cards.length === 0 ? (
                <p>This collection has no cards yet.</p>
            ) : (
                <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {cards.map((card) => {
                        const details = detailsById.get(card.scryfall_id);
                        const name = details?.name ?? card.scryfall_id;

                        return (
                            <li
                                key={card.id}
                                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                            >
                                {details?.imageUrl ? (
                                    <img
                                        src={details.imageUrl}
                                        alt={name}
                                        loading="lazy"
                                        width={488}
                                        height={680}
                                        className="mb-3 h-auto w-full rounded-lg"
                                    />
                                ) : (
                                    <div className="mb-3 flex aspect-[488/680] items-center justify-center rounded-lg bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-900">
                                        Image unavailable
                                    </div>
                                )}

                                <h2 className="break-words font-semibold">
                                    {card.quantity}× {name}
                                </h2>

                                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                                    {card.card_condition} · {card.finish}
                                    {" · "}
                                    {card.language} · {card.scryfall_id}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}

            <Link href="/import" className="inline-block underline">
                Import cards
            </Link>
        </div>
    );
}