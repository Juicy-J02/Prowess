import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/server/database";
import {
    SESSION_COOKIE,
    getSessionUser,
} from "@/lib/server/session";

interface TransactionItem {
    scryfallId: string;
    quantity: number;
    condition: string;
    finish: string;
    language: string;
    cardName: string | null;
    setCode: string | null;
    collectorNumber: string | null;
}

interface OwnedCard extends RowDataPacket {
    id: number;
    quantity: number;
}

class ValidationError extends Error {}

const MAX_QUANTITY = 4294967295;
const MAX_CONDITION_LENGTH = 100;
const MAX_LANGUAGE_LENGTH = 100;

const finishes = new Set(["nonfoil", "foil", "etched"]);

const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseItem(
    value: unknown,
    index: number,
    type: "purchase" | "sale"
): TransactionItem {
    function invalid(message: string): never {
        throw new ValidationError(`Item ${index + 1}: ${message}`);
    }

    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        invalid("invalid card.");
    }

    const item = value as Record<string, unknown>;

    if (
        typeof item.scryfallId !== "string" ||
        !uuidPattern.test(item.scryfallId.trim())
    ) {
        invalid("provide a valid Scryfall ID.");
    }

    if (
        typeof item.quantity !== "number" ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > MAX_QUANTITY
    ) {
        invalid("quantity must be a positive integer.");
    }

    if (
        typeof item.condition !== "string" ||
        item.condition.trim().length === 0 ||
        item.condition.trim().length > MAX_CONDITION_LENGTH
    ) {
        invalid(
            `condition must contain 1–${MAX_CONDITION_LENGTH} characters.`
        );
    }

    if (
        typeof item.finish !== "string" ||
        !finishes.has(item.finish)
    ) {
        invalid("invalid finish.");
    }

    if (
        typeof item.language !== "string" ||
        item.language.trim().length === 0 ||
        item.language.trim().length > MAX_LANGUAGE_LENGTH
    ) {
        invalid(
            `language must contain 1–${MAX_LANGUAGE_LENGTH} characters.`
        );
    }

    let cardName: string | null = null;
    let setCode: string | null = null;
    let collectorNumber: string | null = null;

    // Purchases must include the selected printing's display details.
    // Sales use the card already stored in the collection.
    if (type === "purchase") {
        if (
            typeof item.cardName !== "string" ||
            item.cardName.trim().length === 0 ||
            item.cardName.trim().length > 255
        ) {
            invalid(
                "select a printing with a valid card name."
            );
        }

        if (
            typeof item.setCode !== "string" ||
            !/^[a-z0-9]{1,20}$/i.test(item.setCode.trim())
        ) {
            invalid("provide a valid set code.");
        }

        if (
            typeof item.collectorNumber !== "string" ||
            item.collectorNumber.trim().length === 0 ||
            item.collectorNumber.trim().length > 100
        ) {
            invalid("provide a valid collector number.");
        }

        cardName = item.cardName.trim();
        setCode = item.setCode.trim().toLowerCase();
        collectorNumber = item.collectorNumber.trim();
    }

    return {
        scryfallId: item.scryfallId.trim().toLowerCase(),
        quantity: item.quantity,
        condition: item.condition.trim(),
        finish: item.finish,
        language: item.language.trim(),
        cardName,
        setCode,
        collectorNumber,
    };
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
            Array.isArray(body)
        ) {
            throw new ValidationError("Invalid transaction.");
        }

        const input = body as Record<string, unknown>;

        if (
            typeof input.collectionId !== "number" ||
            !Number.isSafeInteger(input.collectionId) ||
            input.collectionId <= 0
        ) {
            throw new ValidationError("Select a valid collection.");
        }

        if (
            typeof input.name !== "string" ||
            input.name.trim().length === 0 ||
            input.name.trim().length > 100
        ) {
            throw new ValidationError(
                "Transaction name must contain 1–100 characters."
            );
        }

        if (input.type !== "purchase" && input.type !== "sale") {
            throw new ValidationError(
                "Transaction type must be purchase or sale."
            );
        }

        if (
            typeof input.totalAmount !== "string" ||
            !/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(
                input.totalAmount
            )
        ) {
            throw new ValidationError(
                'Provide totalAmount as a decimal string, such as "25.50".'
            );
        }

        if (
            input.currency !== undefined &&
            input.currency !== "USD"
        ) {
            throw new ValidationError(
                "Only USD is supported for now."
            );
        }

        if (
            !Array.isArray(input.items) ||
            input.items.length === 0 ||
            input.items.length > 1000
        ) {
            throw new ValidationError(
                "Provide 1–1000 card items."
            );
        }

        if (
            input.notes !== undefined &&
            (
                typeof input.notes !== "string" ||
                input.notes.length > 5000
            )
        ) {
            throw new ValidationError(
                "Notes must be at most 5000 characters."
            );
        }

        let occurredAt = new Date();

        if (input.occurredAt !== undefined) {
            if (
                typeof input.occurredAt !== "string" ||
                !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
                    input.occurredAt
                )
            ) {
                throw new ValidationError(
                    "Provide occurredAt as a UTC ISO timestamp."
                );
            }

            occurredAt = new Date(input.occurredAt);

            if (
                Number.isNaN(occurredAt.getTime()) ||
                occurredAt.toISOString().slice(0, 19) !==
                    input.occurredAt.slice(0, 19) ||
                occurredAt.getUTCFullYear() < 1000
            ) {
                throw new ValidationError(
                    "Invalid transaction date."
                );
            }
        }

        const collectionId = input.collectionId;
        const name = input.name.trim();
        const type = input.type;
        const totalAmount = input.totalAmount;

        const notes =
            typeof input.notes === "string"
                ? input.notes.trim()
                : null;

        const sqlDate = occurredAt
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");

        // Combine duplicate variants before changing inventory.
        const groupedItems = new Map<string, TransactionItem>();

        for (const [index, value] of input.items.entries()) {
            const item = parseItem(value, index, type);

            const key = JSON.stringify([
                item.scryfallId,
                item.condition,
                item.finish,
                item.language,
            ]);

            const existing = groupedItems.get(key);

            if (existing) {
                existing.quantity += item.quantity;

                if (existing.quantity > MAX_QUANTITY) {
                    throw new ValidationError(
                        "Combined quantity is too large."
                    );
                }
            } else {
                groupedItems.set(key, item);
            }
        }

        const connection = await db.getConnection();
        let transactionId: number;

        try {
            await connection.beginTransaction();

            // Verify ownership and lock the collection.
            const [collections] =
                await connection.execute<RowDataPacket[]>(
                    `SELECT id
                     FROM collections
                     WHERE id = ? AND user_id = ?
                     FOR UPDATE`,
                    [collectionId, user.id]
                );

            if (collections.length === 0) {
                await connection.rollback();

                return NextResponse.json(
                    { error: "Collection not found." },
                    { status: 404 }
                );
            }

            const [result] =
                await connection.execute<ResultSetHeader>(
                    `INSERT INTO transactions (
                        user_id,
                        name,
                        type,
                        total_amount,
                        currency,
                        occurred_at,
                        notes
                    )
                    VALUES (?, ?, ?, ?, 'USD', ?, ?)`,
                    [
                        user.id,
                        name,
                        type,
                        totalAmount,
                        sqlDate,
                        notes,
                    ]
                );

            transactionId = result.insertId;

            for (const item of groupedItems.values()) {
                const [ownedCards] =
                    await connection.execute<OwnedCard[]>(
                        `SELECT id, quantity
                         FROM collection_cards
                         WHERE collection_id = ?
                           AND scryfall_id = ?
                           AND card_condition = ?
                           AND finish = ?
                           AND language = ?
                         FOR UPDATE`,
                        [
                            collectionId,
                            item.scryfallId,
                            item.condition,
                            item.finish,
                            item.language,
                        ]
                    );

                const ownedCard = ownedCards[0];

                const currentQuantity = Number(
                    ownedCard?.quantity ?? 0
                );

                if (
                    type === "sale" &&
                    currentQuantity < item.quantity
                ) {
                    throw new ValidationError(
                        `Not enough copies of ${item.scryfallId} ` +
                        `(${item.condition}, ${item.finish}, ${item.language}).`
                    );
                }

                const newQuantity =
                    type === "purchase"
                        ? currentQuantity + item.quantity
                        : currentQuantity - item.quantity;

                if (newQuantity > MAX_QUANTITY) {
                    throw new ValidationError(
                        "Purchase would exceed the quantity limit."
                    );
                }

                if (ownedCard) {
                    if (newQuantity === 0) {
                        await connection.execute(
                            "DELETE FROM collection_cards WHERE id = ?",
                            [ownedCard.id]
                        );
                    } else if (type === "purchase") {
                        // Save display details when adding more copies.
                        await connection.execute(
                            `UPDATE collection_cards
                             SET quantity = ?,
                                 card_name = ?,
                                 set_code = ?,
                                 collector_number = ?
                             WHERE id = ?`,
                            [
                                newQuantity,
                                item.cardName,
                                item.setCode,
                                item.collectorNumber,
                                ownedCard.id,
                            ]
                        );
                    } else {
                        // Sales preserve existing display details.
                        await connection.execute(
                            `UPDATE collection_cards
                             SET quantity = ?
                             WHERE id = ?`,
                            [newQuantity, ownedCard.id]
                        );
                    }
                } else {
                    await connection.execute(
                        `INSERT INTO collection_cards (
                            collection_id,
                            scryfall_id,
                            quantity,
                            card_condition,
                            finish,
                            language,
                            card_name,
                            set_code,
                            collector_number
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            collectionId,
                            item.scryfallId,
                            item.quantity,
                            item.condition,
                            item.finish,
                            item.language,
                            item.cardName,
                            item.setCode,
                            item.collectorNumber,
                        ]
                    );
                }

                await connection.execute(
                    `INSERT INTO transaction_items (
                        transaction_id,
                        collection_id,
                        scryfall_id,
                        quantity,
                        card_condition,
                        finish,
                        language
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        transactionId,
                        collectionId,
                        item.scryfallId,
                        item.quantity,
                        item.condition,
                        item.finish,
                        item.language,
                    ]
                );
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        return NextResponse.json(
            {
                message: "Transaction saved successfully.",
                transactionId,
            },
            {
                status: 201,
                headers: {
                    "Cache-Control": "no-store",
                },
            }
        );
    } catch (error) {
        if (error instanceof ValidationError) {
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            );
        }

        console.error("Transaction save failed:", error);

        return NextResponse.json(
            { error: "Could not save transaction." },
            { status: 500 }
        );
    }
}