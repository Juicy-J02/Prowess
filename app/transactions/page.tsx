import { Suspense } from "react";
import Link from "next/link";
import Form from "next/form";
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
    "w-full rounded-xl border border-border bg-background p-3 text-foreground";

const paginationClass =
    "inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-teal hover:bg-surface-hover hover:text-foreground";

function money(cents: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
    }).format(cents / 100);
}

export default function TransactionsPage({ searchParams }: Props) {
    return (
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 text-foreground sm:px-6">
            <header>
                <p className="text-sm font-semibold text-accent">
                    Your activity
                </p>

                <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
                    Transactions
                </h1>

                <p className="mt-3 max-w-2xl text-muted">
                    Record purchases and sales, manage your inventory,
                    and explore your transaction history.
                </p>
            </header>

            <Suspense
                fallback={
                    <div
                        role="status"
                        className="panel mt-8 text-muted"
                    >
                        Loading transactions…
                    </div>
                }
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
        <div className="mt-8 space-y-8">
            <section className="panel">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-2xl font-semibold">
                        Record Transaction
                    </h2>

                    <span className="badge">
                        Inventory updates automatically
                    </span>
                </div>

                <p className="mt-2 text-sm text-muted">
                    Add a purchase or record a sale from one of your
                    collections.
                </p>

                <TransactionForm
                    collections={collections.map(({ id, name }) => ({
                        id,
                        name,
                    }))}
                />
            </section>

            <section className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-2xl font-semibold">
                            Transaction History
                        </h2>

                        <p className="mt-2 text-sm text-muted">
                            USD purchases and sales. Select a transaction
                            to view its market value and price history.
                        </p>
                    </div>

                    <span className="badge">
                        {totalTransactions} matching
                    </span>
                </div>

                <Form
                    action="/transactions"
                    scroll={false}
                    className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5"
                >
                    <label className="flex min-w-0 flex-1 flex-col gap-2 sm:min-w-44">
                        <span className="text-sm font-medium text-muted">
                            Type
                        </span>

                        <select
                            key={`type-${type}`}
                            name="type"
                            defaultValue={type}
                            className={selectClass}
                        >
                            <option value="all">
                                All transactions
                            </option>
                            <option value="purchase">
                                Purchases
                            </option>
                            <option value="sale">
                                Sales
                            </option>
                        </select>
                    </label>

                    <label className="flex min-w-0 flex-1 flex-col gap-2 sm:min-w-44">
                        <span className="text-sm font-medium text-muted">
                            Sort
                        </span>

                        <select
                            key={`sort-${sort}`}
                            name="sort"
                            defaultValue={sort}
                            className={selectClass}
                        >
                            <option value="newest">
                                Newest first
                            </option>
                            <option value="oldest">
                                Oldest first
                            </option>
                            <option value="amount_high">
                                Highest amount
                            </option>
                            <option value="amount_low">
                                Lowest amount
                            </option>
                            <option value="name">
                                Name A–Z
                            </option>
                        </select>
                    </label>

                    <button
                        type="submit"
                        className="btn-primary px-5 py-3"
                    >
                        Apply
                    </button>

                    <Link
                        href="/transactions"
                        className="px-2 py-3 text-sm text-muted underline hover:text-accent"
                    >
                        Reset
                    </Link>
                </Form>

                {transactions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
                        <h3 className="font-semibold">
                            No matching transactions
                        </h3>

                        <p className="mt-2 text-sm text-muted">
                            Record a transaction above or adjust your
                            filters to see more activity.
                        </p>
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-muted">
                            Showing {offset + 1}–
                            {Math.min(
                                offset + PAGE_SIZE,
                                totalTransactions
                            )}{" "}
                            of {totalTransactions} transactions
                        </p>

                        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                            <table className="w-full text-left text-sm">
                                <thead>
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
                                            className="border-t border-border transition-colors hover:bg-teal/5"
                                        >
                                            <td className="whitespace-nowrap p-3 text-muted">
                                                {transaction.occurred_at_sql}
                                            </td>

                                            <td className="p-3">
                                                <Link
                                                    href={`/value?transaction=${transaction.id}`}
                                                    className="font-medium text-accent hover:underline"
                                                >
                                                    {transaction.name}
                                                </Link>

                                                <span className="ml-2 text-xs text-muted">
                                                    #{transaction.id}
                                                </span>
                                            </td>

                                            <td className="p-3">
                                                <span
                                                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${transaction.type === "sale"
                                                            ? "border-teal/30 bg-teal/10 text-teal"
                                                            : "border-accent/30 bg-accent/10 text-accent"
                                                        }`}
                                                >
                                                    {transaction.type === "sale"
                                                        ? "Sale"
                                                        : "Purchase"}
                                                </span>
                                            </td>

                                            <td className="p-3 text-right tabular-nums">
                                                {Number(
                                                    transaction.copy_count
                                                )}
                                            </td>

                                            <td
                                                className={`whitespace-nowrap p-3 text-right font-semibold tabular-nums ${transaction.type === "sale"
                                                        ? "text-green-400"
                                                        : "text-red-400"
                                                    }`}
                                            >
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
                                className="flex flex-wrap items-center justify-between gap-4"
                            >
                                {currentPage > 1 ? (
                                    <Link
                                        href={pageHref(currentPage - 1)}
                                        className={paginationClass}
                                    >
                                        Previous
                                    </Link>
                                ) : (
                                    <span
                                        aria-disabled="true"
                                        className="rounded-xl border border-border px-4 py-2 text-sm text-muted opacity-40"
                                    >
                                        Previous
                                    </span>
                                )}

                                <span className="text-sm text-muted">
                                    Page {currentPage} of {totalPages}
                                </span>

                                {currentPage < totalPages ? (
                                    <Link
                                        href={pageHref(currentPage + 1)}
                                        className={paginationClass}
                                    >
                                        Next
                                    </Link>
                                ) : (
                                    <span
                                        aria-disabled="true"
                                        className="rounded-xl border border-border px-4 py-2 text-sm text-muted opacity-40"
                                    >
                                        Next
                                    </span>
                                )}
                            </nav>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}