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

        if (!/^[1-9]\d*$/.test(id)) {
            return NextResponse.json(
                { error: "Invalid collection ID." },
                { status: 400 }
            );
        }

        const [collections] = await db.execute<RowDataPacket[]>(
            "SELECT id FROM collections WHERE id = ? AND user_id = ?",
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
                    card_condition, finish, language
             FROM collection_cards
             WHERE collection_id = ? AND quantity > 0
             ORDER BY id`,
            [id]
        );

        // Look up each printing once to provide readable names.
        const names = new Map<string, string>();

        for (const card of rows) {
            if (names.has(card.scryfall_id)) continue;

            names.set(card.scryfall_id, card.scryfall_id);

            await new Promise((resolve) => setTimeout(resolve, 550));

            try {
                const response = await fetch(
                    `https://api.scryfall.com/cards/${encodeURIComponent(
                        card.scryfall_id
                    )}`,
                    {
                        headers: {
                            Accept: "application/json",
                            "User-Agent": "Prowess/0.1",
                        },
                        next: { revalidate: 86400 },
                        signal: AbortSignal.timeout(10000),
                    }
                );

                if (response.ok) {
                    const data: {
                        name: string;
                        set: string;
                        collector_number: string;
                    } = await response.json();

                    names.set(
                        card.scryfall_id,
                        `${data.name} — ${data.set.toUpperCase()} #${data.collector_number}`
                    );
                }
            } catch {
                // Keep the ID as a fallback if details are unavailable.
            }
        }

        return NextResponse.json(
            {
                cards: rows.map((card) => ({
                    id: card.id,
                    scryfallId: card.scryfall_id,
                    name: names.get(card.scryfall_id),
                    quantity: Number(card.quantity),
                    condition: card.card_condition,
                    finish: card.finish,
                    language: card.language,
                })),
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