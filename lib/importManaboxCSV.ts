import Papa from "papaparse";
import type { ManaboxRow } from "@/types/manabox";

export function importManaboxCSV(csv: string): ManaboxRow[] {
    const result = Papa.parse<ManaboxRow>(csv, {
        header: true,
        skipEmptyLines: true,
    });


    if (result.errors.length > 0) {
        throw new Error(
            `Could not parse CSV: ${result.errors[0].message}`
        );
    }

    console.log(result.data);

    return result.data;
}

export async function CSVToDB(rows: ManaboxRow[], collectionId: number) {
    const response = await fetch("/api/collections/import", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ collectionId, rows }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error ?? "Could not save collection.");
    }

    return data;
}