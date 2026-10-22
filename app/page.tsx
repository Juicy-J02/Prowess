import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { loadScryfallPrices } from "@/lib/server/scryfallPrices";

import { db } from "@/lib/server/database";
import {
    SESSION_COOKIE,
    getSessionUser,
} from "@/lib/server/session";

interface CollectionStats extends RowDataPacket {
    collection_count: number | string;
    card_count: number | string;
}

interface TransactionStats extends RowDataPacket {
    transaction_count: number | string;
    purchase_cents: number | string;
    sale_cents: number | string;
}

interface TransactionRow extends RowDataPacket {
    id: number;
    name: string;
    type: "purchase" | "sale";
    currency: string;
    amount: number | string;
    date: string;
}

const primaryButton =
    "inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-3 font-medium text-white transition-colors hover:bg-blue-700";

const secondaryButton =
    "inline-flex items-center justify-center rounded-lg border border-zinc-300 px-5 py-3 font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";

function usd(cents: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
    }).format(cents / 100);
}

function transactionAmount(
    amount: number | string,
    currency: string
) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
    }).format(Number(amount));
}

function StatCard({
    label,
    value,
    href,
}: {
    label: string;
    value: string;
    href: string;
}) {
    return (
        <Link
            href={href}
            className="rounded-xl border border-zinc-200 p-5 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
            <h2 className="text-sm text-zinc-500">
                {label}
            </h2>

            <p className="mt-3 text-3xl font-semibold">
                {value}
            </p>
        </Link>
    );
}

interface AccountCard extends RowDataPacket {
    scryfall_id: string;
    finish: string;
    quantity: number | string;
}

async function AccountValue({ userId }: { userId: number }) {
    const [cards] = await db.execute<AccountCard[]>(
        `SELECT
            cc.scryfall_id,
            cc.finish,
            SUM(cc.quantity) AS quantity
         FROM collection_cards cc
         JOIN collections c ON c.id = cc.collection_id
         WHERE c.user_id = ?
           AND cc.quantity > 0
         GROUP BY cc.scryfall_id, cc.finish`,
        [userId]
    );

    const prices = await loadScryfallPrices(cards);

    let totalCents = 0;
    let unpricedCopies = 0;

    for (const card of cards) {
        const pricing = prices.get(card.scryfall_id);

        const raw =
            card.finish === "foil"
                ? pricing?.prices.usd_foil
                : card.finish === "etched"
                    ? pricing?.prices.usd_etched
                    : card.finish === "nonfoil"
                        ? pricing?.prices.usd
                        : null;

        const amount =
            raw === null || raw === undefined || raw === ""
                ? NaN
                : Number(raw);

        if (!Number.isFinite(amount) || amount < 0) {
            unpricedCopies += Number(card.quantity);
            continue;
        }

        totalCents +=
            Math.round(amount * 100) * Number(card.quantity);
    }

    return (
        <Link
            href="/value?collection=all"
            className={`block rounded-2xl border p-8 transition-colors ${totalCents > 0
                ? "border-green-300 bg-green-50 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/30 dark:hover:bg-green-950/50"
                : totalCents < 0
                    ? "border-red-300 bg-red-50 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:hover:bg-red-950/50"
                    : "border-zinc-300 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                }`}
        >
            <h2 className="text-lg font-medium text-zinc-600 dark:text-zinc-300">
                Total Account Value
            </h2>

            <p
                className={`mt-3 text-4xl font-bold tracking-tight sm:text-5xl ${totalCents > 0
                    ? "text-green-600 dark:text-green-400"
                    : totalCents < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-zinc-600 dark:text-zinc-400"
                    }`}
            >
                {usd(totalCents)}
            </p>

            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                Current USD reference value across all your collections.
                {unpricedCopies > 0 && (
                    <>
                        {" "}{unpricedCopies} card copies without prices
                        are excluded.
                    </>
                )}
            </p>

            <span
                className={`mt-5 inline-block text-sm font-medium ${totalCents > 0
                        ? "text-green-700 dark:text-green-400"
                        : totalCents < 0
                            ? "text-red-700 dark:text-red-400"
                            : "text-zinc-700 dark:text-zinc-400"
                    }`}
            >
                View value history →
            </span>
        </Link>
    );
}

export default function Home() {
    return (
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 text-black dark:text-white">
            <Suspense
                fallback={
                    <p role="status" className="text-zinc-500">
                        Loading…
                    </p>
                }
            >
                <HomeContent />
            </Suspense>
        </main>
    );
}

async function HomeContent() {
    await connection();

    const cookieStore = await cookies();

    const user = await getSessionUser(
        cookieStore.get(SESSION_COOKIE)?.value
    );

    if (!user) {
        return <Welcome />;
    }

    const [
        [collectionRows],
        [transactionRows],
        [recentTransactions],
    ] = await Promise.all([
        db.execute<CollectionStats[]>(
            `SELECT
                COUNT(*) AS collection_count,
                COALESCE(
                    SUM(
                        (
                            SELECT COALESCE(SUM(cc.quantity), 0)
                            FROM collection_cards cc
                            WHERE cc.collection_id = c.id
                        )
                    ),
                    0
                ) AS card_count
             FROM collections c
             WHERE c.user_id = ?`,
            [user.id]
        ),

        db.execute<TransactionStats[]>(
            `SELECT
                COUNT(*) AS transaction_count,
                COALESCE(
                    SUM(
                        CASE
                            WHEN type = 'purchase'
                            THEN total_amount * 100
                            ELSE 0
                        END
                    ),
                    0
                ) AS purchase_cents,
                COALESCE(
                    SUM(
                        CASE
                            WHEN type = 'sale'
                            THEN total_amount * 100
                            ELSE 0
                        END
                    ),
                    0
                ) AS sale_cents
             FROM transactions
             WHERE user_id = ?
               AND currency = 'USD'`,
            [user.id]
        ),

        db.execute<TransactionRow[]>(
            `SELECT
                id,
                name,
                type,
                currency,
                total_amount AS amount,
                DATE_FORMAT(
                    occurred_at,
                    '%Y-%m-%d'
                ) AS date
             FROM transactions
             WHERE user_id = ?
             ORDER BY occurred_at DESC, id DESC
             LIMIT 5`,
            [user.id]
        ),
    ]);

    const collectionStats = collectionRows[0];
    const transactionStats = transactionRows[0];

    const collectionCount = Number(
        collectionStats?.collection_count ?? 0
    );

    const cardCount = Number(
        collectionStats?.card_count ?? 0
    );

    const transactionCount = Number(
        transactionStats?.transaction_count ?? 0
    );

    const purchaseCents = Math.round(
        Number(transactionStats?.purchase_cents ?? 0)
    );

    const saleCents = Math.round(
        Number(transactionStats?.sale_cents ?? 0)
    );

    return (
        <div className="space-y-10">
            <header className="flex flex-wrap items-center justify-between gap-6">
                <div>
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        Your dashboard
                    </p>

                    <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
                        Welcome back, {user.username}.
                    </h1>

                    <p className="mt-3 text-zinc-600 dark:text-zinc-400">
                        Manage your cards, record transactions, and
                        follow market values.
                    </p>
                </div>
            </header>

            <section
                aria-label="Account overview"
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
                <StatCard
                    label="Collections"
                    value={String(collectionCount)}
                    href="/collection"
                />

                <StatCard
                    label="Cards owned"
                    value={String(cardCount)}
                    href="/collection"
                />

                <StatCard
                    label="Recorded purchases · USD"
                    value={usd(purchaseCents)}
                    href="/transactions?type=purchase"
                />

                <StatCard
                    label="Recorded sales · USD"
                    value={usd(saleCents)}
                    href="/transactions?type=sale"
                />
            </section>

            <Suspense
                fallback={
                    <div
                        role="status"
                        className="rounded-2xl border border-blue-200 bg-blue-50 p-8 dark:border-blue-900 dark:bg-blue-950/30"
                    >
                        <h2 className="text-lg font-medium">
                            Total Account Value
                        </h2>
                        <p className="mt-3 text-zinc-500">
                            Loading account value…
                        </p>
                    </div>
                }
            >
                <AccountValue userId={user.id} />
            </Suspense>

            <p className="text-sm text-zinc-500">
                Purchase and sale totals include {transactionCount}{" "}
                recorded USD transactions. These totals are cash
                activity, not profit. Imported cards may have
                unrecorded acquisition costs.
            </p>

            {collectionCount === 0 && (
                <section className="rounded-xl border border-dashed border-blue-300 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-950/30">
                    <h2 className="text-xl font-semibold">
                        Start your first collection
                    </h2>

                    <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                        Create a collection, open it, and import a
                        ManaBox CSV to add your cards.
                    </p>

                    <Link
                        href="/collection"
                        className={`${primaryButton} mt-5`}
                    >
                        Create Collection
                    </Link>
                </section>
            )}

            <section className="grid gap-5 md:grid-cols-3">
                <Shortcut
                    href="/transactions"
                    title="Transactions"
                    description="Record purchases and sales, then review your transaction history."
                />

                <Shortcut
                    href="/value"
                    title="Value Tracker"
                    description="Check reference market prices and track the recorded value of a transaction over time."
                />

                <Shortcut
                    href="/collection"
                    title="Your Collections"
                    description="Browse your cards, search printings, and import cards into a collection."
                />
            </section>

            <section className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-2xl font-semibold">
                        Recent Transactions
                    </h2>

                    <Link
                        href="/transactions"
                        className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                    >
                        View all transactions →
                    </Link>
                </div>

                {recentTransactions.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6">
                        <p className="font-medium">
                            No transactions recorded yet.
                        </p>

                        <p className="mt-2 text-sm text-zinc-500">
                            Record a purchase or sale to start
                            tracking your activity.
                        </p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {recentTransactions.map((transaction) => (
                            <li key={transaction.id}>
                                <Link
                                    href={`/value?transaction=${transaction.id}`}
                                    className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 p-5 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                                >
                                    <div className="min-w-0">
                                        <h3 className="break-words font-medium">
                                            {transaction.name}
                                        </h3>

                                        <p className="mt-1 text-sm text-zinc-500">
                                            {transaction.type === "sale"
                                                ? "Sale"
                                                : "Purchase"}
                                            {" · "}
                                            {transaction.date}
                                        </p>
                                    </div>

                                    <div className="shrink-0 text-right">
                                        <p className="font-semibold">
                                            {transaction.type === "sale"
                                                ? "+"
                                                : "−"}
                                            {transactionAmount(
                                                transaction.amount,
                                                transaction.currency
                                            )}
                                        </p>

                                        <p className="mt-1 text-xs text-zinc-500">
                                            View value →
                                        </p>
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

function Shortcut({
    href,
    title,
    description,
}: {
    href: string;
    title: string;
    description: string;
}) {
    return (
        <Link
            href={href}
            className="flex flex-col rounded-xl border border-zinc-200 p-6 transition-colors hover:border-blue-500 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-blue-500 dark:hover:bg-zinc-900"
        >
            <h2 className="text-xl font-semibold">
                {title}
            </h2>

            <p className="mt-3 flex-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {description}
            </p>

            <span className="mt-5 text-sm font-medium text-blue-600 dark:text-blue-400">
                Open →
            </span>
        </Link>
    );
}

function Welcome() {
    return (
        <div className="space-y-14 py-8">
            <section className="max-w-3xl">
                <p className="font-semibold text-blue-600 dark:text-blue-400">
                    Prowess
                </p>

                <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
                    Know your collection.
                    Track its value.
                </h1>

                <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
                    Organize your Magic cards, record purchases and
                    sales, and follow how their reference market
                    values change over time.
                </p>

                <div className="mt-8 flex flex-wrap gap-4">
                    <Link
                        href="/signin"
                        className={primaryButton}
                    >
                        Get Started
                    </Link>

                    <Link
                        href="/signin"
                        className={secondaryButton}
                    >
                        Sign In
                    </Link>
                </div>

                <p className="mt-3 text-sm text-zinc-500">
                    New here? Choose Register on the sign-in page.
                </p>
            </section>

            <section className="grid gap-6 md:grid-cols-3">
                <WelcomeFeature
                    title="Organize your cards"
                    description="Keep collections by printing, quantity, condition, finish, and language."
                />

                <WelcomeFeature
                    title="Record your trades"
                    description="Keep a history of purchases and sales with the cards and total price involved."
                />

                <WelcomeFeature
                    title="Follow market changes"
                    description="Compare reference prices and view price history as observations are recorded."
                />
            </section>
        </div>
    );
}

function WelcomeFeature({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            <h2 className="text-xl font-semibold">
                {title}
            </h2>

            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {description}
            </p>
        </section>
    );
}