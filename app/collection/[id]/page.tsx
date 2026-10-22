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

const actionClass =
    "inline-flex items-center justify-center rounded-xl border border-accent/50 bg-surface px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:border-accent hover:bg-surface-hover";

export default function CollectionDetailPage({ params }: Props) {
    return (
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 text-foreground sm:px-6">
            <Suspense
                fallback={
                    <div role="status" className="panel text-muted">
                        Loading collection…
                    </div>
                }
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
            language,
            card_name,
            set_code,
            collector_number
         FROM collection_cards
         WHERE collection_id = ? AND quantity > 0
         ORDER BY id`,
        [collection.id]
    );

    // Use saved card details without additional external requests.
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

    const totalCopies = collectionCards.reduce(
        (total, card) => total + card.quantity,
        0
    );

    const printingCount = new Set(
        collectionCards.map((card) => card.scryfallId)
    ).size;

    const foilCopies = collectionCards.reduce(
        (total, card) =>
            total +
            (card.finish === "foil" || card.finish === "etched"
                ? card.quantity
                : 0),
        0
    );

    const stats = [
        {
            label: "Cards owned",
            value: totalCopies,
        },
        {
            label: "Unique printings",
            value: printingCount,
        },
        {
            label: "Foil & etched copies",
            value: foilCopies,
        },
    ];

    return (
        <div className="space-y-8">
            <Link
                href="/collection"
                className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-accent"
            >
                <span aria-hidden="true">←</span>
                Back to collections
            </Link>

            <header className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                    <span className="badge">
                        Your collection
                    </span>

                    <h1 className="mt-3 break-words text-3xl font-semibold sm:text-4xl">
                        {collection.name}
                    </h1>

                    <p className="mt-3 text-sm text-muted">
                        Browse your cards, manage quantities, and
                        import new additions.
                    </p>
                </div>

                <Link
                    href={`/value?collection=${collection.id}`}
                    className={actionClass}
                >
                    View Collection Value →
                </Link>
            </header>

            <section
                aria-label="Collection overview"
                className="grid gap-3 sm:grid-cols-3"
            >
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        className="rounded-xl border border-border bg-surface p-5"
                    >
                        <h2 className="text-sm font-medium text-muted">
                            {stat.label}
                        </h2>

                        <p className="mt-2 text-3xl font-semibold tabular-nums text-accent">
                            {stat.value.toLocaleString("en-US")}
                        </p>
                    </div>
                ))}
            </section>

            <details className="group rounded-2xl border border-border bg-surface">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-2xl p-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal [&::-webkit-details-marker]:hidden">
                    <div>
                        <span className="block font-semibold text-foreground">
                            Import cards
                        </span>

                        <span className="mt-1 block text-sm text-muted">
                            Add cards from a ManaBox CSV.
                        </span>
                    </div>

                    <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-xl text-accent transition-transform group-open:rotate-45 motion-reduce:transition-none"
                    >
                        +
                    </span>
                </summary>

                <div className="border-t border-border p-5 sm:p-6">
                    <ImportCards
                        key={collection.id}
                        collectionId={collection.id}
                    />
                </div>
            </details>

            <section
                aria-labelledby="collection-cards-heading"
                className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-6"
            >
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2
                            id="collection-cards-heading"
                            className="text-xl font-semibold"
                        >
                            Collection cards
                        </h2>

                        <p className="mt-1 text-sm text-muted">
                            Your cards and their saved details.
                        </p>
                    </div>

                    <span className="badge">
                        {totalCopies.toLocaleString("en-US")}{" "}
                        {totalCopies === 1 ? "copy" : "copies"}
                    </span>
                </div>

                {collectionCards.length === 0 && (
                    <div className="mb-6 rounded-xl border border-dashed border-teal/30 bg-teal/5 p-6 text-center">
                        <h3 className="font-semibold">
                            Ready for your first cards
                        </h3>

                        <p className="mt-2 text-sm text-muted">
                            Open Import cards above to upload a
                            ManaBox CSV, or use the card controls below.
                        </p>
                    </div>
                )}

                <CollectionCards
                    cards={collectionCards}
                    collectionId={collection.id}
                />
            </section>
        </div>
    );
}