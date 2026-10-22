import "server-only";
import { unstable_cache } from "next/cache";

export interface Pricing {
    id: string;
    name: string;
    prices: {
        usd: string | null;
        usd_foil: string | null;
        usd_etched: string | null;
    };
}

interface CollectionResponse {
    data: Pricing[];
}

const loadPriceBatch = unstable_cache(
    async (ids: string[]): Promise<Pricing[]> => {
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
                    identifiers: ids.map((id) => ({ id })),
                }),
                cache: "no-store",
                signal: AbortSignal.timeout(10000),
            }
        );

        if (!response.ok) {
            throw new Error(
                `Scryfall price lookup failed: ${response.status}`
            );
        }

        const result: CollectionResponse =
            await response.json();

        return result.data;
    },
    ["scryfall-price-batch-v1"],
    { revalidate: 3600 }
);

export async function loadScryfallPrices(
    cards: readonly { scryfall_id: string }[]
): Promise<Map<string, Pricing | null>> {
    // Identical sorted batches share cache entries.
    const ids = [
        ...new Set(cards.map((card) => card.scryfall_id)),
    ].sort();

    const prices = new Map<string, Pricing | null>(
        ids.map((id) => [id, null])
    );

    const BATCH_SIZE = 75;

    for (
        let offset = 0;
        offset < ids.length;
        offset += BATCH_SIZE
    ) {
        if (offset > 0) {
            await new Promise((resolve) =>
                setTimeout(resolve, 150)
            );
        }

        try {
            const batch = await loadPriceBatch(
                ids.slice(offset, offset + BATCH_SIZE)
            );

            for (const card of batch) {
                prices.set(card.id, card);
            }
        } catch (error) {
            console.error(
                "Could not load price batch:",
                error
            );

            // Leave unavailable entries as null.
            // Stop rather than repeating timeouts or rate limits.
            break;
        }
    }

    return prices;
}