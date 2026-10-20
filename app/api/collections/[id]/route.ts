import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { db } from "@/lib/server/database";
import {
    SESSION_COOKIE,
    getSessionUser,
} from "@/lib/server/session";

interface Props {
    params: Promise<{ id: string }>;
}

export async function DELETE(
    request: NextRequest,
    { params }: Props
) {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
        return NextResponse.json(
            { error: "Invalid request origin." },
            { status: 403 }
        );
    }

    try {
        const user = await getSessionUser(
            request.cookies.get(SESSION_COOKIE)?.value
        );

        if (!user) {
            return NextResponse.json(
                { error: "Not signed in." },
                { status: 401 }
            );
        }

        const { id } = await params;

        if (!/^[1-9]\d{0,19}$/.test(id)) {
            return NextResponse.json(
                { error: "Invalid collection ID." },
                { status: 400 }
            );
        }

        // Ownership is checked directly in the DELETE query.
        const [result] = await db.execute<ResultSetHeader>(
            "DELETE FROM collections WHERE id = ? AND user_id = ?",
            [id, user.id]
        );

        if (result.affectedRows === 0) {
            return NextResponse.json(
                { error: "Collection not found." },
                { status: 404 }
            );
        }

        return NextResponse.json({
            message: "Collection deleted.",
        });
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "ER_ROW_IS_REFERENCED_2"
        ) {
            return NextResponse.json(
                {
                    error:
                        "This collection has linked records, such as " +
                        "transaction history, and cannot be deleted.",
                },
                { status: 409 }
            );
        }

        console.error("Collection deletion failed:", error);

        return NextResponse.json(
            { error: "Could not delete collection." },
            { status: 500 }
        );
    }
}