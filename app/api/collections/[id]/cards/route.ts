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

        // Default to the ID if card details are unavailable.
        const ids = [...new Set(rows.map((card) => card.scryfall_id))];

        const names = new Map<string, string>(
            ids.map((id) => [id, id])
        );

        interface ScryfallCardDetails {
            id: string;
            name: string;
            set: string;
            collector_number: string;
        }

        interface ScryfallCollectionResponse {
            data: ScryfallCardDetails[];
        }

        const BATCH_SIZE = 75;

        for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
            const batch = ids.slice(offset, offset + BATCH_SIZE);

            // Space requests apart, rather than waiting for every card.
            if (offset > 0) {
                await new Promise((resolve) => setTimeout(resolve, 150));
            }

            try {
                const response = await fetch(
                    "https://api.scryfall.com/cards/collection",
                    {
                        method: "POST",
                        headers: {
                            Accept: "application/json",
                            "Content-Type": "application/json",
                            "User-Agent": "Prowess/0.1",
                        },
                        body: JSON.stringify({
                            identifiers: batch.map((id) => ({ id })),
                        }),
                        cache: "no-store",
                        signal: AbortSignal.timeout(10000),
                    }
                );

                if (!response.ok) {
                    console.error(
                        "Scryfall batch lookup failed:",
                        response.status
                    );

                    // Avoid sending more requests after rate limiting.
                    if (response.status === 429) break;

                    continue;
                }

                const data: ScryfallCollectionResponse =
                    await response.json();

                for (const card of data.data) {
                    names.set(
                        card.id,
                        `${card.name} — ${card.set.toUpperCase()} #${card.collector_number}`
                    );
                }
            } catch (error) {
                console.error("Scryfall batch lookup failed:", error);
                // Keep IDs as fallbacks for this batch.
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