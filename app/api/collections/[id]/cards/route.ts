import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/server/database";
import {
    SESSION_COOKIE,
    getSessionUser,
} from "@/lib/server/session";

interface OwnedCard extends RowDataPacket {
    id: number;
    scryfall_id: string;
    quantity: number;
    card_condition: string;
    finish: string;
    language: string;
    card_name: string | null;
    set_code: string | null;
    collector_number: string | null;
}

interface Props {
    params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
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

        const [collections] = await db.execute<RowDataPacket[]>(
            `SELECT id
             FROM collections
             WHERE id = ? AND user_id = ?`,
            [id, user.id]
        );

        if (!collections.length) {
            return NextResponse.json(
                { error: "Collection not found." },
                { status: 404 }
            );
        }

        const [rows] = await db.execute<OwnedCard[]>(
            `SELECT id, scryfall_id, quantity,
                    card_condition, finish, language,
                    card_name, set_code, collector_number
             FROM collection_cards
             WHERE collection_id = ? AND quantity > 0
             ORDER BY id`,
            [id]
        );

        return NextResponse.json(
            {
                cards: rows.map((card) => {
                    const printing = [
                        card.set_code?.toUpperCase(),
                        card.collector_number
                            ? `#${card.collector_number}`
                            : null,
                    ].filter(Boolean).join(" ");

                    return {
                        id: card.id,
                        scryfallId: card.scryfall_id,
                        name: card.card_name
                            ? [card.card_name, printing]
                                .filter(Boolean)
                                .join(" — ")
                            : card.scryfall_id,
                        quantity: Number(card.quantity),
                        condition: card.card_condition,
                        finish: card.finish,
                        language: card.language,
                    };
                }),
            },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        console.error("Could not load collection cards:", error);

        return NextResponse.json(
            { error: "Could not load collection cards." },
            { status: 500 }
        );
    }
}