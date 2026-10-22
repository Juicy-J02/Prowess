import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import CreateCollection from "@/components/createCollection";
import DeleteCollectionButton from "@/components/deleteCollectionButton";

import { db } from "@/lib/server/database";
import {
    SESSION_COOKIE,
    getSessionUser,
} from "@/lib/server/session";

interface CollectionRow extends RowDataPacket {
    id: number;
    name: string;
    card_count: number | string;
}

interface CollectionOptionRow extends RowDataPacket {
    id: number;
    name: string;
}

interface CountRow extends RowDataPacket {
    total: number | string;
}

interface Props {
    searchParams: Promise<{
        page?: string | string[];
        search?: string | string[];
    }>;
}

const PAGE_SIZE = 5;

const buttonClass =
    "inline-flex items-center justify-center rounded-xl border border-accent/50 bg-surface px-5 py-3 font-semibold text-accent transition-colors hover:border-accent hover:bg-surface-hover";

const paginationClass =
    "inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-teal hover:bg-surface-hover hover:text-foreground";

export default function CollectionPage({ searchParams }: Props) {
    return (
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 text-foreground sm:px-6">
            <header>
                <p className="text-sm font-semibold text-accent">
                    Your card library
                </p>

                <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
                    Your Collections
                </h1>

                <p className="mt-3 max-w-2xl text-muted">
                    Keep your cards organized, explore your collections,
                    and make room for your next find.
                </p>
            </header>

            <Suspense
                fallback={
                    <div
                        role="status"
                        className="panel mt-8 text-muted"
                    >
                        Loading collections…
                    </div>
                }
            >
                <UserCollections searchParams={searchParams} />
            </Suspense>
        </main>
    );
}

async function UserCollections({ searchParams }: Props) {
    await connection();

    const cookieStore = await cookies();

    const user = await getSessionUser(
        cookieStore.get(SESSION_COOKIE)?.value
    );

    if (!user) {
        redirect("/signin");
    }

    const params = await searchParams;

    const search =
        typeof params.search === "string"
            ? params.search.trim().slice(0, 100)
            : "";

    const requestedPage =
        typeof params.page === "string" &&
        /^[1-9]\d*$/.test(params.page)
            ? Number(params.page)
            : 1;

    const [allCollections] =
        await db.execute<CollectionOptionRow[]>(
            `SELECT id, name
             FROM collections
             WHERE user_id = ?
             ORDER BY name, id`,
            [user.id]
        );

    // Treat search characters such as % and _ as literal text.
    const filter = search
        ? "user_id = ? AND LOCATE(LOWER(?), LOWER(name)) > 0"
        : "user_id = ?";

    const filterValues = search
        ? [user.id, search]
        : [user.id];

    const [countRows] = await db.execute<CountRow[]>(
        `SELECT COUNT(*) AS total
         FROM collections
         WHERE ${filter}`,
        filterValues
    );

    const matchingCollections = Number(countRows[0]?.total ?? 0);

    const totalPages = Math.max(
        1,
        Math.ceil(matchingCollections / PAGE_SIZE)
    );

    const currentPage = Number.isSafeInteger(requestedPage)
        ? Math.min(requestedPage, totalPages)
        : 1;

    const offset = (currentPage - 1) * PAGE_SIZE;

    // LIMIT and OFFSET use validated server-calculated integers.
    const [collections] = await db.execute<CollectionRow[]>(
        `SELECT
            id,
            name,
            (
                SELECT COALESCE(SUM(cc.quantity), 0)
                FROM collection_cards cc
                WHERE cc.collection_id = collections.id
            ) AS card_count
         FROM collections
         WHERE ${filter}
         ORDER BY name, id
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
        filterValues
    );

    function pageHref(page: number) {
        const query = new URLSearchParams();

        if (search) {
            query.set("search", search);
        }

        query.set("page", String(page));

        return `/collection?${query.toString()}`;
    }

    return (
        <div className="mt-8 space-y-8">
            <section
                aria-labelledby="create-collection-heading"
                className="panel"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2
                        id="create-collection-heading"
                        className="text-xl font-semibold"
                    >
                        Start a new collection
                    </h2>

                    <span className="badge">
                        {allCollections.length}{" "}
                        {allCollections.length === 1
                            ? "collection"
                            : "collections"}
                    </span>
                </div>

                <p className="mt-2 text-sm text-muted">
                    Give your collection a name, then open it to add
                    or import cards.
                </p>

                <div className="mt-5">
                    <CreateCollection />
                </div>
            </section>

            {allCollections.length === 0 ? (
                <section className="rounded-2xl border border-dashed border-accent/30 bg-surface p-8 text-center sm:p-12">
                    <span
                        aria-hidden="true"
                        className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-teal/30 bg-teal/10 text-teal"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className="h-7 w-7"
                        >
                            <rect
                                x="7"
                                y="4"
                                width="12"
                                height="16"
                                rx="2"
                            />
                            <path
                                d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h1"
                                strokeLinecap="round"
                            />
                            <path
                                d="M11 12h4m-2-2v4"
                                strokeLinecap="round"
                            />
                        </svg>
                    </span>

                    <h2 className="mt-5 text-xl font-semibold">
                        Your collection starts here
                    </h2>

                    <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
                        Create your first collection above, then add
                        your cards or import a ManaBox CSV.
                    </p>
                </section>
            ) : (
                <section
                    aria-labelledby="browse-collections-heading"
                    className="space-y-5"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2
                            id="browse-collections-heading"
                            className="text-2xl font-semibold"
                        >
                            Browse collections
                        </h2>

                        {search && (
                            <span className="badge">
                                {matchingCollections} matching
                            </span>
                        )}
                    </div>

                    <form
                        action="/collection"
                        method="GET"
                        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5"
                    >
                        <label className="flex min-w-0 basis-full flex-1 flex-col gap-2 sm:basis-auto">
                            <span className="text-sm font-medium text-muted">
                                Search collections
                            </span>

                            <input
                                key={search}
                                type="search"
                                name="search"
                                defaultValue={search}
                                placeholder="Enter a collection name"
                                maxLength={100}
                                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted focus:border-teal"
                            />
                        </label>

                        <button
                            type="submit"
                            className={buttonClass}
                        >
                            Search
                        </button>

                        {search && (
                            <Link
                                href="/collection"
                                className="px-2 py-3 text-sm text-muted underline hover:text-accent"
                            >
                                Clear
                            </Link>
                        )}
                    </form>

                    {matchingCollections === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
                            <h3 className="font-semibold">
                                No collections found
                            </h3>

                            <p className="mt-2 break-words text-sm text-muted">
                                No collections match “{search}”.
                                Try another name or clear the search.
                            </p>

                            <Link
                                href="/collection"
                                className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
                            >
                                Show all collections →
                            </Link>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-muted">
                                Showing {offset + 1}–
                                {Math.min(
                                    offset + PAGE_SIZE,
                                    matchingCollections
                                )}{" "}
                                of {matchingCollections} collections
                            </p>

                            <ul className="space-y-3">
                                {collections.map((collection) => {
                                    const cardCount = Number(
                                        collection.card_count
                                    );

                                    return (
                                        <li
                                            key={collection.id}
                                            className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-teal/50 sm:gap-5 sm:p-5"
                                        >
                                            <Link
                                                href={`/collection/${collection.id}`}
                                                className="group flex min-w-0 flex-1 items-center gap-4 rounded-lg py-1 text-foreground hover:text-foreground"
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent sm:flex"
                                                >
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="1.5"
                                                        className="h-6 w-6"
                                                    >
                                                        <rect
                                                            x="7"
                                                            y="4"
                                                            width="12"
                                                            height="16"
                                                            rx="2"
                                                        />
                                                        <path
                                                            d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h1"
                                                            strokeLinecap="round"
                                                        />
                                                    </svg>
                                                </span>

                                                <div className="min-w-0 flex-1">
                                                    <h3 className="break-words text-lg font-semibold transition-colors group-hover:text-accent">
                                                        {collection.name}
                                                    </h3>

                                                    <p className="mt-1 text-sm text-muted">
                                                        {cardCount.toLocaleString("en-US")}{" "}
                                                        {cardCount === 1
                                                            ? "card"
                                                            : "cards"}
                                                    </p>
                                                </div>

                                                <span
                                                    aria-hidden="true"
                                                    className="shrink-0 text-xl text-teal"
                                                >
                                                    →
                                                </span>
                                            </Link>

                                            <div className="shrink-0 border-l border-border pl-3 sm:pl-5">
                                                <DeleteCollectionButton
                                                    collectionId={collection.id}
                                                    collectionName={collection.name}
                                                />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>

                            {totalPages > 1 && (
                                <nav
                                    aria-label="Collection pages"
                                    className="flex flex-wrap items-center justify-between gap-3 pt-2"
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
            )}
        </div>
    );
}