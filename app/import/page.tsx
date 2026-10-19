import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import ImportTransaction from "@/components/importTransaction";
import { db } from "@/lib/server/database";
import {
    SESSION_COOKIE,
    getSessionUser,
} from "@/lib/server/session";

interface CollectionRow extends RowDataPacket {
    id: number;
    name: string;
}

export default function ImportPage() {
    return (
        <Suspense fallback={<p className="p-8">Loading…</p>}>
            <ProtectedImport />
        </Suspense>
    );
}

async function ProtectedImport() {
    const cookieStore = await cookies();

    const user = await getSessionUser(
        cookieStore.get(SESSION_COOKIE)?.value
    );

    if (!user) {
        redirect("/signin");
    }

    const [collections] = await db.execute<CollectionRow[]>(
        `SELECT id, name
         FROM collections
         WHERE user_id = ?
         ORDER BY name`,
        [user.id]
    );

    return (
        <ImportTransaction
            collections={collections.map((collection) => ({
                id: collection.id,
                name: collection.name,
            }))}
        />
    );
}