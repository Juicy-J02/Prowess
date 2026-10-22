import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/server/database";
import { loadScryfallPrices } from "@/lib/server/scryfallPrices";
import {
    SESSION_COOKIE,
    getSessionUser,
} from "@/lib/server/session";

interface CardRow extends RowDataPacket {
    scryfall_id: string;
    finish: string;
    quantity: number | string;
    card_name: string | null;
    set_code: string | null;
    collector_number: string | null;
}

interface HistoryRow extends RowDataPacket {
    day: string;
    cents: number | string;
}

function reply(body: object, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            "Cache-Control": "no-store",
        },
    });
}

export async function GET(request: NextRequest) {
    try {
        const user = await getSessionUser(
            request.cookies.get(SESSION_COOKIE)?.value
        );

        if (!user) {
            return reply(
                { error: "Not signed in." },
                401
            );
        }

        const collectionId =
            request.nextUrl.searchParams.get("collectionId") ?? "";

        const cardId =
            request.nextUrl.searchParams.get("cardId") ?? "";

        if (
            ![collectionId, cardId].every((id) =>
                /^[1-9]\d{0,19}$/.test(id)
            )
        ) {
            return reply(
                { error: "Invalid card or collection." },
                400
            );
        }

        const [cards] = await db.execute<CardRow[]>(
            `SELECT
                cc.scryfall_id,
                cc.finish,
                cc.quantity,
                cc.card_name,
                cc.set_code,
                cc.collector_number
             FROM collection_cards cc
             JOIN collections c ON c.id = cc.collection_id
             WHERE cc.id = ?
               AND c.id = ?
               AND c.user_id = ?
               AND cc.quantity > 0`,
            [cardId, collectionId, user.id]
        );

        const card = cards[0];

        if (!card) {
            return reply(
                { error: "Card not found in your collection." },
                404
            );
        }

        const prices = await loadScryfallPrices([card]);
        const pricing = prices.get(card.scryfall_id);

        const raw =
            card.finish === "foil"
                ? pricing?.prices.usd_foil
                : card.finish === "etched"
                    ? pricing?.prices.usd_etched
                    : card.finish === "nonfoil"
                        ? pricing?.prices.usd
                        : null;

        const amount =
            raw === null || raw === undefined || raw === ""
                ? NaN
                : Number(raw);

        const currentCents =
            Number.isFinite(amount) && amount >= 0
                ? Math.round(amount * 100)
                : null;

        // Use the last observation on each UTC day.
        // Missing dates are not filled with estimated prices.
        const [rows] = await db.execute<HistoryRow[]>(
            `SELECT
                DATE_FORMAT(recorded_at, '%Y-%m-%d') AS day,
                price * 100 AS cents
             FROM card_price_snapshots
             WHERE scryfall_id = ?
               AND finish = ?
               AND currency = 'USD'
               AND recorded_at >= UTC_DATE() - INTERVAL 90 DAY
               AND recorded_at <= UTC_TIMESTAMP()
             ORDER BY recorded_at, id`,
            [card.scryfall_id, card.finish]
        );

        const daily = new Map<string, number>();

        for (const row of rows) {
            daily.set(
                row.day,
                Math.round(Number(row.cents))
            );
        }

        return reply({
            currentCents,
            quantity: Number(card.quantity),
            name: pricing?.name ?? card.card_name,
            setCode: card.set_code,
            collectorNumber: card.collector_number,
            checkedAt: new Date().toISOString(),
            history: [...daily].map(([day, cents]) => ({
                day,
                cents,
            })),
        });
    } catch (error) {
        console.error("Card history lookup failed:", error);

        return reply(
            {
                error: "Could not load card prices. Please retry.",
            },
            500
        );
    }
}