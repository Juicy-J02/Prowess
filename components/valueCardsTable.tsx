"use client";

import { useState } from "react";

interface ValueCard {
    id: string;
    name: string;
    finish: string;
    quantity: number;
    cents: number | null;
}

interface Props {
    cards: ValueCard[];
    title: string;
}

const PAGE_SIZE = 10;

const usd = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

function money(cents: number) {
    return usd.format(cents / 100);
}

export default function ValueCardsTable({ cards, title }: Props) {
    const [page, setPage] = useState(1);

    const totalPages = Math.max(
        1,
        Math.ceil(cards.length / PAGE_SIZE)
    );

    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * PAGE_SIZE;
    const visibleCards = cards.slice(offset, offset + PAGE_SIZE);

    const buttonClass =
        "rounded-lg border px-4 py-2 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-900";

    return (
        <section className="space-y-3">
            <h2 className="text-xl font-semibold">
                {title}
            </h2>

            {cards.length === 0 ? (
                <p>No cards to value.</p>
            ) : (
                <>
                    <p role="status" className="text-sm text-zinc-500">
                        Showing {offset + 1}–
                        {Math.min(offset + PAGE_SIZE, cards.length)} of{" "}
                        {cards.length} printing/finish variants
                    </p>

                    <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr>
                                    <th scope="col" className="p-3">Card</th>
                                    <th scope="col" className="p-3">Finish</th>
                                    <th scope="col" className="p-3">Quantity</th>
                                    <th scope="col" className="p-3">Unit price</th>
                                    <th scope="col" className="p-3">Total</th>
                                </tr>
                            </thead>

                            <tbody>
                                {visibleCards.map((card) => (
                                    <tr
                                        key={`${card.id}:${card.finish}`}
                                        className="border-t"
                                    >
                                        <td className="p-3">{card.name}</td>
                                        <td className="p-3">{card.finish}</td>
                                        <td className="p-3">{card.quantity}</td>
                                        <td className="p-3">
                                            {card.cents === null
                                                ? "Unavailable"
                                                : money(card.cents)}
                                        </td>
                                        <td className="p-3">
                                            {card.cents === null
                                                ? "—"
                                                : money(
                                                      card.cents * card.quantity
                                                  )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <nav
                            aria-label="Value card pages"
                            className="flex items-center justify-between gap-3"
                        >
                            <button
                                type="button"
                                disabled={currentPage === 1}
                                onClick={() => setPage(currentPage - 1)}
                                className={buttonClass}
                            >
                                Previous
                            </button>

                            <span className="text-sm">
                                Page {currentPage} of {totalPages}
                            </span>

                            <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() => setPage(currentPage + 1)}
                                className={buttonClass}
                            >
                                Next
                            </button>
                        </nav>
                    )}
                </>
            )}
        </section>
    );
}