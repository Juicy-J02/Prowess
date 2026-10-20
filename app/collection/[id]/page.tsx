import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect, notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import CollectionCards from "@/components/collectionCards";
import ImportCards from "@/components/importCards";
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
    setCode: string;
    collectorNumber: string;
    imageUrl: string | null;
}

interface ScryfallCard {
    name: string;
    set: string;
    collector_number: string;
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
        setCode: card.set,
        collectorNumber: card.collector_number,
        imageUrl:
            card.image_uris?.normal ??
            card.card_faces?.[0]?.image_uris?.normal ??
            null,
    };
}

export default function CollectionDetailPage({ params }: Props) {
    return (
        <main className="mx-auto w-full max-w-6xl px-6 py-8">
            <Suspense
                fallback={<p>Loading collection and card images…</p>}
            >
                <CollectionDetails params={params} />
            </Suspense>
        </main>
    );
}

async function CollectionDetails({ params }: Props) {
    await connection();

    const cookieStore = await cookies();

    const user = await getSessionUser(
        cookieStore.get(SESSION_COOKIE)?.value
    );

    if (!user) {
        redirect("/signin");
    }

    const { id } = await params;

    if (!/^[1-9]\d{0,19}$/.test(id)) {
        notFound();
    }

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
        `SELECT
            id,
            scryfall_id,
            quantity,
            card_condition,
            finish,
            language
         FROM collection_cards
         WHERE collection_id = ?
         ORDER BY id`,
        [collection.id]
    );

    const detailsById = new Map<string, CardDetails | null>();

    for (const card of cards) {
        if (detailsById.has(card.scryfall_id)) {
            continue;
        }

        // Space out requests for different printings.
        if (detailsById.size > 0) {
            await new Promise((resolve) => setTimeout(resolve, 550));
        }

        try {
            const details = await getCardDetails(card.scryfall_id);
            detailsById.set(card.scryfall_id, details);
        } catch (error) {
            console.error(
                `Could not load card ${card.scryfall_id}:`,
                error
            );

            detailsById.set(card.scryfall_id, null);
        }
    }

    const collectionCards = cards.map((card) => {
        const details = detailsById.get(card.scryfall_id);

        return {
            id: card.id,
            scryfallId: card.scryfall_id,
            name: details?.name ?? card.scryfall_id,
            setCode: details?.setCode ?? "",
            collectorNumber: details?.collectorNumber ?? "",
            imageUrl: details?.imageUrl ?? null,
            quantity: Number(card.quantity),
            condition: card.card_condition,
            finish: card.finish,
            language: card.language,
            detailsLoaded: details !== null && details !== undefined,
        };
    });

    return (
        <div className="space-y-6">
            <Link href="/collection" className="underline">
                Back to collections
            </Link>

            <h1 className="text-3xl font-semibold">
                {collection.name}
            </h1>

            <CollectionCards cards={collectionCards} />

            <section className="border-t pt-8">
                <ImportCards
                    key={collection.id}
                    collectionId={collection.id}
                />
            </section>
        </div>
    );
}