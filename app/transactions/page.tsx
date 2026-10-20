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
import TransactionForm from "@/components/transactionForm";

interface CollectionRow extends RowDataPacket {
    id: number;
    name: string;
}

interface TransactionRow extends RowDataPacket {
    id: number;
    name: string;
    type: "purchase" | "sale";
    amount_cents: number | string;
    occurred_at_sql: string;
    copy_count: number | string;
}

interface CountRow extends RowDataPacket {
    total: number | string;
}

interface Props {
    searchParams: Promise<{
        sort?: string | string[];
        type?: string | string[];
        page?: string | string[];
    }>;
}

const PAGE_SIZE = 25;

const orders = {
    newest: "occurred_at DESC, id DESC",
    oldest: "occurred_at ASC, id ASC",
    amount_high: "total_amount DESC, id DESC",
    amount_low: "total_amount ASC, id ASC",
    name: "name ASC, id ASC",
};

const selectClass =
    "rounded-lg border border-zinc-300 bg-white p-3 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white";

function money(cents: number) {
    return `$${(cents / 100).toFixed(2)}`;
}

export default function TransactionsPage({ searchParams }: Props) {
    return (
        <main className="mx-auto w-full max-w-5xl px-6 py-8">
            <h1 className="text-3xl font-semibold">
                Transactions
            </h1>

            <Suspense
                fallback={<p className="mt-6">Loading transactions…</p>}
            >
                <UserTransactions searchParams={searchParams} />
            </Suspense>
        </main>
    );
}

async function UserTransactions({ searchParams }: Props) {
    await connection();

    const cookieStore = await cookies();

    const user = await getSessionUser(
        cookieStore.get(SESSION_COOKIE)?.value
    );

    if (!user) {
        redirect("/signin");
    }

    const params = await searchParams;

    const rawSort =
        typeof params.sort === "string"
            ? params.sort
            : "newest";

    // Only predefined SQL sort expressions are allowed.
    const sort = Object.prototype.hasOwnProperty.call(
        orders,
        rawSort
    )
        ? (rawSort as keyof typeof orders)
        : "newest";

    const type =
        params.type === "purchase" || params.type === "sale"
            ? params.type
            : "all";

    const where =
        type === "all"
            ? "user_id = ? AND currency = 'USD'"
            : "user_id = ? AND currency = 'USD' AND type = ?";

    const values =
        type === "all"
            ? [user.id]
            : [user.id, type];

    const [collections] = await db.execute<CollectionRow[]>(
        `SELECT id, name
         FROM collections
         WHERE user_id = ?
         ORDER BY name, id`,
        [user.id]
    );

    const [countRows] = await db.execute<CountRow[]>(
        `SELECT COUNT(*) AS total
         FROM transactions
         WHERE ${where}`,
        values
    );

    const totalTransactions = Number(countRows[0]?.total ?? 0);

    const totalPages = Math.max(
        1,
        Math.ceil(totalTransactions / PAGE_SIZE)
    );

    const requestedPage =
        typeof params.page === "string" &&
        /^[1-9]\d*$/.test(params.page)
            ? Number(params.page)
            : 1;

    const currentPage = Number.isSafeInteger(requestedPage)
        ? Math.min(requestedPage, totalPages)
        : 1;

    const offset = (currentPage - 1) * PAGE_SIZE;

    const [transactions] = await db.execute<TransactionRow[]>(
        `SELECT
            id,
            name,
            type,
            total_amount * 100 AS amount_cents,
            DATE_FORMAT(
                occurred_at,
                '%Y-%m-%d %H:%i:%s'
            ) AS occurred_at_sql,
            (
                SELECT COALESCE(SUM(ti.quantity), 0)
                FROM transaction_items ti
                WHERE ti.transaction_id = transactions.id
            ) AS copy_count
         FROM transactions
         WHERE ${where}
         ORDER BY ${orders[sort]}
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
        values
    );

    function pageHref(page: number) {
        const query = new URLSearchParams({
            type,
            sort,
            page: String(page),
        });

        return `/transactions?${query.toString()}`;
    }

    return (
        <div className="mt-6 space-y-10">
            <section className="space-y-4">
                <h2 className="text-2xl font-semibold">
                    Record Transaction
                </h2>

                <TransactionForm
                    collections={collections.map(({ id, name }) => ({
                        id,
                        name,
                    }))}
                />
            </section>

            <section className="space-y-5 border-t pt-8">
                <div>
                    <h2 className="text-2xl font-semibold">
                        Transaction History
                    </h2>

                    <p className="mt-2 text-sm text-zinc-500">
                        USD purchases and sales. Select a transaction
                        to view its market value and price history.
                    </p>
                </div>

                <form
                    action="/transactions"
                    method="GET"
                    className="flex flex-wrap items-end gap-4"
                >
                    <label className="flex flex-col gap-2">
                        Type

                        <select
                            key={`type-${type}`}
                            name="type"
                            defaultValue={type}
                            className={selectClass}
                        >
                            <option value="all">All transactions</option>
                            <option value="purchase">Purchases</option>
                            <option value="sale">Sales</option>
                        </select>
                    </label>

                    <label className="flex flex-col gap-2">
                        Sort

                        <select
                            key={`sort-${sort}`}
                            name="sort"
                            defaultValue={sort}
                            className={selectClass}
                        >
                            <option value="newest">Newest first</option>
                            <option value="oldest">Oldest first</option>
                            <option value="amount_high">
                                Highest amount
                            </option>
                            <option value="amount_low">
                                Lowest amount
                            </option>
                            <option value="name">Name A–Z</option>
                        </select>
                    </label>

                    <button
                        type="submit"
                        className="rounded-lg bg-blue-600 px-4 py-3 text-white hover:bg-blue-700"
                    >
                        Apply
                    </button>

                    <Link
                        href="/transactions"
                        className="px-2 py-3 underline"
                    >
                        Reset
                    </Link>
                </form>

                {transactions.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-zinc-500">
                        No matching transactions.
                    </p>
                ) : (
                    <>
                        <p className="text-sm text-zinc-500">
                            Showing {offset + 1}–
                            {Math.min(
                                offset + PAGE_SIZE,
                                totalTransactions
                            )}{" "}
                            of {totalTransactions} transactions
                        </p>

                        <div className="overflow-x-auto rounded-xl border">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-zinc-100 dark:bg-zinc-900">
                                    <tr>
                                        <th scope="col" className="p-3">
                                            Date (UTC)
                                        </th>
                                        <th scope="col" className="p-3">
                                            Transaction
                                        </th>
                                        <th scope="col" className="p-3">
                                            Type
                                        </th>
                                        <th
                                            scope="col"
                                            className="p-3 text-right"
                                        >
                                            Copies
                                        </th>
                                        <th
                                            scope="col"
                                            className="p-3 text-right"
                                        >
                                            Amount (USD)
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {transactions.map((transaction) => (
                                        <tr
                                            key={transaction.id}
                                            className="border-t"
                                        >
                                            <td className="whitespace-nowrap p-3">
                                                {transaction.occurred_at_sql}
                                            </td>

                                            <td className="p-3">
                                                <Link
                                                    href={`/value?transaction=${transaction.id}`}
                                                    className="font-medium text-blue-600 hover:underline"
                                                >
                                                    {transaction.name}
                                                </Link>

                                                <span className="ml-2 text-zinc-500">
                                                    #{transaction.id}
                                                </span>
                                            </td>

                                            <td className="p-3">
                                                {transaction.type === "sale"
                                                    ? "Sale"
                                                    : "Purchase"}
                                            </td>

                                            <td className="p-3 text-right">
                                                {Number(
                                                    transaction.copy_count
                                                )}
                                            </td>

                                            <td className="whitespace-nowrap p-3 text-right">
                                                {transaction.type === "sale"
                                                    ? "+"
                                                    : "−"}
                                                {money(
                                                    Number(
                                                        transaction.amount_cents
                                                    )
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <nav
                                aria-label="Transaction pages"
                                className="flex items-center justify-between gap-4"
                            >
                                {currentPage > 1 ? (
                                    <Link
                                        href={pageHref(currentPage - 1)}
                                        className="rounded-lg border px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                                    >
                                        Previous
                                    </Link>
                                ) : (
                                    <span />
                                )}

                                <span className="text-sm">
                                    Page {currentPage} of {totalPages}
                                </span>

                                {currentPage < totalPages ? (
                                    <Link
                                        href={pageHref(currentPage + 1)}
                                        className="rounded-lg border px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                                    >
                                        Next
                                    </Link>
                                ) : (
                                    <span />
                                )}
                            </nav>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}