import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/server/database";
import {
    SESSION_COOKIE,
    getSessionUser,
} from "@/lib/server/session";

interface CollectionRow extends RowDataPacket {
    id: number;
    name: string;
}

export async function GET(request: NextRequest) {
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

        const [collections] = await db.execute<CollectionRow[]>(
            `SELECT id, name
             FROM collections
             WHERE user_id = ?
             ORDER BY name`,
            [user.id]
        );

        return NextResponse.json(
            { collections },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        console.error("Could not load collections:", error);

        return NextResponse.json(
            { error: "Could not load collections." },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
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

        let body: unknown;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON." },
                { status: 400 }
            );
        }

        if (
            typeof body !== "object" ||
            body === null ||
            !("name" in body) ||
            typeof body.name !== "string" ||
            body.name.trim().length === 0 ||
            body.name.trim().length > 100
        ) {
            return NextResponse.json(
                { error: "Provide a collection name of 1–100 characters." },
                { status: 400 }
            );
        }

        const name = body.name.trim();

        const [result] = await db.execute<ResultSetHeader>(
            "INSERT INTO collections (user_id, name) VALUES (?, ?)",
            [user.id, name]
        );

        return NextResponse.json(
            {
                collection: {
                    id: result.insertId,
                    name,
                },
            },
            {
                status: 201,
                headers: { "Cache-Control": "no-store" },
            }
        );
    } catch (error) {
        console.error("Could not create collection:", error);

        return NextResponse.json(
            { error: "Could not create collection." },
            { status: 500 }
        );
    }
}