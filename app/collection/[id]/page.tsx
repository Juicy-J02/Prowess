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
    card_name: string | null;
    set_code: string | null;
    collector_number: string | null;
}

interface Props {
    params: Promise<{ id: string }>;
}

export default function CollectionDetailPage({ params }: Props) {
    return (
        <main className="mx-auto w-full max-w-6xl px-6 py-8">
            <Suspense fallback={<p>Loading collection…</p>}>
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
            language,
            card_name,
            set_code,
            collector_number
         FROM collection_cards
         WHERE collection_id = ? AND quantity > 0
         ORDER BY id`,
        [collection.id]
    );

    // No external fetches or per-card delays.
    const collectionCards = cards.map((card) => ({
        id: card.id,
        scryfallId: card.scryfall_id,
        name: card.card_name || card.scryfall_id,
        setCode: card.set_code ?? "",
        collectorNumber: card.collector_number ?? "",
        imageUrl:
            `https://api.scryfall.com/cards/` +
            `${encodeURIComponent(card.scryfall_id)}?format=image`,
        quantity: Number(card.quantity),
        condition: card.card_condition,
        finish: card.finish,
        language: card.language,
        detailsLoaded: Boolean(card.card_name),
    }));

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