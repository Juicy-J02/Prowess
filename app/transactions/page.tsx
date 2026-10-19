import { Suspense } from "react";
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

export default function TransactionsPage() {
    return (
        <main className="mx-auto w-full max-w-4xl px-6 py-8">
            <h1 className="text-3xl font-semibold">
                Record Transaction
            </h1>

            <Suspense fallback={<p className="mt-6">Loading…</p>}>
                <ProtectedTransactionForm />
            </Suspense>
        </main>
    );
}

async function ProtectedTransactionForm() {
    await connection();

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
        <TransactionForm
            collections={collections.map(({ id, name }) => ({
                id,
                name,
            }))}
        />
    );
}