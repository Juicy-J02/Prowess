import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import CreateCollection from "@/components/createCollection";
import { db } from "@/lib/server/database";
import {
    SESSION_COOKIE,
    getSessionUser,
} from "@/lib/server/session";

interface CollectionRow extends RowDataPacket {
    id: number;
    name: string;
}

export default function CollectionPage() {
    return (
        <main className="mx-auto w-full max-w-3xl p-8">
            <h1 className="text-3xl font-semibold">
                Your Collections
            </h1>

            <Suspense fallback={<p>Loading collections…</p>}>
                <UserCollections />
            </Suspense>
        </main>
    );
}

async function UserCollections() {
    const cookieStore = await cookies();

    const user = await getSessionUser(
        cookieStore.get(SESSION_COOKIE)?.value
    );

    if (!user) {
        redirect("/signIn");
    }

    const [collections] = await db.execute<CollectionRow[]>(
        `SELECT id, name
         FROM collections
         WHERE user_id = ?
         ORDER BY name`,
        [user.id]
    );

    return (
        <div className="mt-6">

            <CreateCollection />

            {collections.length === 0 ? (
                <p className="mt-6">
                    You don’t have any collections yet.
                </p>
            ) : (
                <ul className="mt-6 space-y-3">
                    {collections.map((collection) => (
                        <li key={collection.id}>
                            <Link
                                href={`/collection/${collection.id}`}
                                className="text-blue-600 hover:underline"
                            >
                                {collection.name}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            {/* <Link
                href="/import"
                className="mt-6 inline-block underline"
            >
                Import cards
            </Link> */}
        </div>
    );
}