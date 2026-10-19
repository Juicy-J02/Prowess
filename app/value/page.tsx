import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/server/database";
import {
    SESSION_COOKIE,
    getSessionUser,
} from "@/lib/server/session";

interface OwnedCard extends RowDataPacket {
    scryfall_id: string;
    finish: string;
    quantity: string | number;
}

interface TransactionTotals extends RowDataPacket {
    purchase_cents: string | number;
    sale_cents: string | number;
    transaction_count: string | number;
    other_currency_count: string | number;
}

interface ScryfallCard {
    name: string;
    prices: {
        usd: string | null;
        usd_foil: string | null;
        usd_etched: string | null;
    };
}

interface CardValue {
    id: string;
    name: string;
    finish: string;
    quantity: number;
    unitCents: number | null;
}

const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

function money(cents: number) {
    return currency.format(cents / 100);
}

function getUnitCents(
    prices: ScryfallCard["prices"],
    finish: string
): number | null {
    const raw =
        finish === "foil"
            ? prices.usd_foil
            : finish === "etched"
              ? prices.usd_etched
              : finish === "nonfoil"
                ? prices.usd
                : null;

    if (raw === null || raw === undefined || raw === "") {
        return null;
    }

    const price = Number(raw);

    return Number.isFinite(price) && price >= 0
        ? Math.round(price * 100)
        : null;
}

async function getPricing(
    scryfallId: string
): Promise<ScryfallCard | null> {
    const response = await fetch(
        `https://api.scryfall.com/cards/${encodeURIComponent(scryfallId)}`,
        {
            headers: {
                Accept: "application/json",
                "User-Agent": "Prowess/0.1",
            },
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
        }
    );

    if (!response.ok) return null;

    return response.json();
}

function SummaryCard({
    title,
    value,
}: {
    title: string;
    value: string;
}) {
    return (
        <section className="rounded-xl border p-5">
            <h2 className="text-sm text-zinc-500">{title}</h2>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
        </section>
    );
}

export default function ValuePage() {
    return (
        <main className="mx-auto w-full max-w-5xl px-6 py-8">
            <h1 className="text-3xl font-semibold">
                Value Tracker
            </h1>

            <Suspense fallback={<p className="mt-6">Loading value…</p>}>
                <UserValue />
            </Suspense>
        </main>
    );
}

async function UserValue() {
    await connection();

    const cookieStore = await cookies();

    const user = await getSessionUser(
        cookieStore.get(SESSION_COOKIE)?.value
    );

    if (!user) {
        redirect("/signIn");
    }

    const [cards] = await db.execute<OwnedCard[]>(
        `SELECT
            cc.scryfall_id,
            cc.finish,
            SUM(cc.quantity) AS quantity
         FROM collection_cards cc
         JOIN collections c ON c.id = cc.collection_id
         WHERE c.user_id = ? AND cc.quantity > 0
         GROUP BY cc.scryfall_id, cc.finish`,
        [user.id]
    );

    // Query transactions separately so card joins cannot multiply totals.
    const [totalsRows] = await db.execute<TransactionTotals[]>(
        `SELECT
            COALESCE(SUM(
                CASE
                    WHEN type = 'purchase' AND currency = 'USD'
                    THEN total_amount * 100
                    ELSE 0
                END
            ), 0) AS purchase_cents,
            COALESCE(SUM(
                CASE
                    WHEN type = 'sale' AND currency = 'USD'
                    THEN total_amount * 100
                    ELSE 0
                END
            ), 0) AS sale_cents,
            COUNT(CASE WHEN currency = 'USD' THEN 1 END)
                AS transaction_count,
            COUNT(CASE WHEN currency <> 'USD' THEN 1 END)
                AS other_currency_count
         FROM transactions
         WHERE user_id = ?`,
        [user.id]
    );

    const totals = totalsRows[0];
    const spentCents = Number(totals.purchase_cents);
    const receivedCents = Number(totals.sale_cents);
    const transactionCount = Number(totals.transaction_count);
    const otherCurrencyCount = Number(totals.other_currency_count);

    const pricingById = new Map<string, ScryfallCard | null>();

    for (const card of cards) {
        if (pricingById.has(card.scryfall_id)) continue;

        await new Promise((resolve) => setTimeout(resolve, 550));

        try {
            pricingById.set(
                card.scryfall_id,
                await getPricing(card.scryfall_id)
            );
        } catch (error) {
            console.error(
                `Price lookup failed for ${card.scryfall_id}:`,
                error
            );

            pricingById.set(card.scryfall_id, null);
        }
    }

    const values: CardValue[] = cards.map((card) => {
        const pricing = pricingById.get(card.scryfall_id);

        return {
            id: card.scryfall_id,
            name: pricing?.name ?? card.scryfall_id,
            finish: card.finish,
            quantity: Number(card.quantity),
            unitCents: pricing
                ? getUnitCents(pricing.prices, card.finish)
                : null,
        };
    });

    values.sort(
        (a, b) =>
            (b.unitCents ?? 0) * b.quantity -
            (a.unitCents ?? 0) * a.quantity
    );

    const collectionCents = values.reduce(
        (total, card) =>
            total + (card.unitCents ?? 0) * card.quantity,
        0
    );

    const totalQuantity = values.reduce(
        (total, card) => total + card.quantity,
        0
    );

    const unpricedQuantity = values.reduce(
        (total, card) =>
            total + (card.unitCents === null ? card.quantity : 0),
        0
    );

    const netSpentCents = spentCents - receivedCents;
    const balanceCents = collectionCents + receivedCents - spentCents;
    const checkedAt = new Date().toISOString();

    return (
        <div className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SummaryCard
                    title="Estimated value of priced cards"
                    value={money(collectionCents)}
                />
                <SummaryCard
                    title="Total purchases"
                    value={money(spentCents)}
                />
                <SummaryCard
                    title="Total sale proceeds"
                    value={money(receivedCents)}
                />
                <SummaryCard
                    title="Net cash spent"
                    value={money(netSpentCents)}
                />
                <SummaryCard
                    title="Owned copies"
                    value={String(totalQuantity)}
                />
                <SummaryCard
                    title="Copies without a price"
                    value={String(unpricedQuantity)}
                />
            </div>

            <section className="rounded-xl border p-5">
                <h2 className="font-semibold">
                    Cash-adjusted collection balance
                </h2>

                <p className="mt-2 text-3xl font-semibold">
                    {money(balanceCents)}
                </p>

                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                    Priced collection value + recorded sales − recorded purchases.
                    Based on {transactionCount} USD transactions.
                </p>

                <p className="mt-2 text-sm text-amber-600">
                    This represents estimated gain/loss only when all acquisition
                    costs and sales are recorded. Imported cards may have unknown
                    costs, and missing prices make the valuation incomplete.
                </p>
            </section>

            {otherCurrencyCount > 0 && (
                <p className="text-sm text-amber-600">
                    {otherCurrencyCount} non-USD transactions are excluded.
                    Currency conversion is not implemented.
                </p>
            )}

            <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <p>
                    Scryfall reference prices in USD, matched by printing
                    and finish. Condition and language adjustments are
                    not included. Sale fees are reflected only if you
                    included them in your recorded amounts.
                </p>
                <p>
                    Cards without prices are excluded from the total.
                    Estimated values are not guaranteed sale prices.
                </p>
                <p>
                    Price lookup completed:{" "}
                    <time dateTime={checkedAt}>{checkedAt}</time>
                </p>
            </div>

            {values.length === 0 ? (
                <p>
                    You currently have no collection cards. Recorded
                    purchase and sale totals still appear above.
                </p>
            ) : (
                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-100 dark:bg-zinc-900">
                            <tr>
                                <th className="p-3">Card</th>
                                <th className="p-3">Finish</th>
                                <th className="p-3 text-right">Quantity</th>
                                <th className="p-3 text-right">Unit price</th>
                                <th className="p-3 text-right">Total</th>
                            </tr>
                        </thead>

                        <tbody>
                            {values.map((card) => (
                                <tr
                                    key={`${card.id}-${card.finish}`}
                                    className="border-t"
                                >
                                    <td className="p-3">{card.name}</td>
                                    <td className="p-3">{card.finish}</td>
                                    <td className="p-3 text-right">
                                        {card.quantity}
                                    </td>
                                    <td className="p-3 text-right">
                                        {card.unitCents === null
                                            ? "Unavailable"
                                            : money(card.unitCents)}
                                    </td>
                                    <td className="p-3 text-right">
                                        {card.unitCents === null
                                            ? "—"
                                            : money(
                                                  card.unitCents * card.quantity
                                              )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <nav className="flex flex-wrap gap-6">
                <Link href="/transactions" className="underline">
                    Record transaction
                </Link>
                <Link href="/collection" className="underline">
                    View collections
                </Link>
            </nav>
        </div>
    );
}