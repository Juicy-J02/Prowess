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

export default function CollectionPage({ searchParams }: Props) {
    return (
        <main className="mx-auto w-full max-w-3xl px-6 py-8">
            <h1 className="text-3xl font-semibold">
                Your Collections
            </h1>

            <Suspense fallback={<p className="mt-6">Loading collections…</p>}>
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

    // Load every collection for the import destination selector.
    const [allCollections] =
        await db.execute<CollectionOptionRow[]>(
            `SELECT id, name
             FROM collections
             WHERE user_id = ?
             ORDER BY name, id`,
            [user.id]
        );

    // LOCATE treats the search as literal text, including % and _.
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

    // LIMIT and OFFSET come from validated server-calculated integers.
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
        <div className="mt-6 space-y-8">
            <section className="space-y-6">
                <CreateCollection />

                {allCollections.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-zinc-300 p-6 dark:border-zinc-700">
                        <p className="font-medium">
                            You don’t have any collections yet.
                        </p>

                        <p className="mt-2 text-sm text-zinc-500">
                            Create your first collection above, then
                            import your cards.
                        </p>
                    </div>
                ) : (
                    <>
                        <form
                            action="/collection"
                            method="GET"
                            className="flex flex-wrap items-end gap-3"
                        >
                            <label className="flex min-w-0 flex-1 flex-col gap-2">
                                Search collections

                                <input
                                    key={search}
                                    type="search"
                                    name="search"
                                    defaultValue={search}
                                    placeholder="Enter a collection name"
                                    maxLength={100}
                                    className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                                />
                            </label>

                            <button
                                type="submit"
                                className="rounded-lg bg-blue-600 px-4 py-3 text-white hover:bg-blue-700"
                            >
                                Search
                            </button>

                            {search && (
                                <Link
                                    href="/collection"
                                    className="px-2 py-3 underline"
                                >
                                    Clear
                                </Link>
                            )}
                        </form>

                        {matchingCollections === 0 ? (
                            <p className="text-zinc-500">
                                No collections match “{search}”.
                            </p>
                        ) : (
                            <>
                                <p className="text-sm text-zinc-500">
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
                                                className="flex items-center gap-4 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700"
                                            >
                                                <Link
                                                    href={`/collection/${collection.id}`}
                                                    className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded px-1 py-2 hover:text-blue-600"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="break-words font-medium">
                                                            {collection.name}
                                                        </p>

                                                        <p className="mt-1 text-sm text-zinc-500">
                                                            {cardCount}{" "}
                                                            {cardCount === 1
                                                                ? "card"
                                                                : "cards"}
                                                        </p>
                                                    </div>

                                                    <span
                                                        aria-hidden="true"
                                                        className="text-zinc-500"
                                                    >
                                                        →
                                                    </span>
                                                </Link>

                                                <DeleteCollectionButton
                                                    collectionId={
                                                        collection.id
                                                    }
                                                    collectionName={
                                                        collection.name
                                                    }
                                                />
                                            </li>
                                        );
                                    })}
                                </ul>

                                {totalPages > 1 && (
                                    <nav
                                        aria-label="Collection pages"
                                        className="flex items-center justify-between gap-4"
                                    >
                                        {currentPage > 1 ? (
                                            <Link
                                                href={pageHref(
                                                    currentPage - 1
                                                )}
                                                className="rounded-lg border px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                                            >
                                                Previous
                                            </Link>
                                        ) : (
                                            <span />
                                        )}

                                        <span className="text-sm">
                                            Page {currentPage} of{" "}
                                            {totalPages}
                                        </span>

                                        {currentPage < totalPages ? (
                                            <Link
                                                href={pageHref(
                                                    currentPage + 1
                                                )}
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
                    </>
                )}
            </section>
        </div>
    );
}