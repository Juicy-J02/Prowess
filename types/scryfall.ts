export interface Prices {
    usd: string | null;
    usd_foil: string | null;
    usd_etched: string | null;
    eur: string | null;
    eur_foil: string | null;
    tix: string | null;
}

export interface Card {
    id: string;
    name: string;
    uri: string;
    scryfall_uri: string;
    set: string;
    collector_number: string;
    prices: Prices;
}