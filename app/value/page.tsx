import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import AutoRecordSnapshot from "@/components/AutoRecordSnapshot";
import { db } from "@/lib/server/database";
import {
    loadScryfallPrices,
    type Pricing,
} from "@/lib/server/scryfallPrices";
import {
    SESSION_COOKIE,
    getSessionUser,
} from "@/lib/server/session";

type Params = Record<string, string | string[] | undefined>;

interface Props {
    searchParams: Promise<Params>;
}

interface BasketCard extends RowDataPacket {
    scryfall_id: string;
    finish: string;
    quantity: string | number;
}

interface TransactionRow extends RowDataPacket {
    id: number;
    name: string;
    type: "purchase" | "sale";
    currency: string;
    amount_cents: number | string;
    occurred_at_sql: string;
}

interface CollectionRow extends RowDataPacket {
    id: number;
    name: string;
}

interface SnapshotRow extends RowDataPacket {
    scryfall_id: string;
    finish: string;
    day: string;
    price_cents: string | number;
}

interface CollectionSnapshotRow extends RowDataPacket {
    day: string;
    cents: string | number | null;
    covered: string | number;
    variant_count: string | number;
}

interface HistoryPoint {
    day: string;
    cents: number | null;
    covered: number;
    variantCount?: number;
}

const usd = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const money = (cents: number) => usd.format(cents / 100);

const variantKey = (id: string, finish: string) =>
    `${id}:${finish}`;

const selectClass =
    "rounded-lg border bg-white p-3 text-black dark:bg-zinc-900 dark:text-white";

function selection(value: unknown): string {
    if (
        value === undefined ||
        value === null ||
        value === "all"
    ) {
        return "all";
    }

    if (
        typeof value !== "string" ||
        !/^[1-9]\d{0,19}$/.test(value)
    ) {
        notFound();
    }

    return value;
}

async function requireUser() {
    const store = await cookies();

    const user = await getSessionUser(
        store.get(SESSION_COOKIE)?.value
    );

    if (!user) {
        redirect("/signin");
    }

    return user;
}

async function loadBasket(
    userId: number,
    selectedId: string
) {
    if (selectedId === "all") {
        const [cards] = await db.execute<BasketCard[]>(
            `SELECT
                cc.scryfall_id,
                cc.finish,
                SUM(cc.quantity) AS quantity
             FROM collection_cards cc
             JOIN collections c ON c.id = cc.collection_id
             WHERE c.user_id = ?
               AND cc.quantity > 0
             GROUP BY cc.scryfall_id, cc.finish`,
            [userId]
        );

        return {
            cards,
            transaction: null as TransactionRow | null,
        };
    }

    const [transactions] = await db.execute<TransactionRow[]>(
        `SELECT
            id,
            name,
            type,
            currency,
            total_amount * 100 AS amount_cents,
            DATE_FORMAT(
                occurred_at,
                '%Y-%m-%d %H:%i:%s'
            ) AS occurred_at_sql
         FROM transactions
         WHERE id = ?
           AND user_id = ?`,
        [selectedId, userId]
    );

    if (
        !transactions.length ||
        transactions[0].currency !== "USD"
    ) {
        notFound();
    }

    const [cards] = await db.execute<BasketCard[]>(
        `SELECT
            ti.scryfall_id,
            ti.finish,
            SUM(ti.quantity) AS quantity
         FROM transaction_items ti
         JOIN transactions t ON t.id = ti.transaction_id
         WHERE t.id = ?
           AND t.user_id = ?
         GROUP BY ti.scryfall_id, ti.finish`,
        [selectedId, userId]
    );

    return {
        cards,
        transaction: transactions[0],
    };
}

async function loadCollectionBasket(
    userId: number,
    collectionId: string
) {
    if (collectionId === "all") {
        return loadBasket(userId, "all");
    }

    const [owned] = await db.execute<CollectionRow[]>(
        `SELECT id, name
         FROM collections
         WHERE id = ?
           AND user_id = ?`,
        [collectionId, userId]
    );

    if (!owned.length) {
        notFound();
    }

    const [cards] = await db.execute<BasketCard[]>(
        `SELECT
            cc.scryfall_id,
            cc.finish,
            SUM(cc.quantity) AS quantity
         FROM collection_cards cc
         JOIN collections c ON c.id = cc.collection_id
         WHERE c.id = ?
           AND c.user_id = ?
           AND cc.quantity > 0
         GROUP BY cc.scryfall_id, cc.finish`,
        [collectionId, userId]
    );

    return {
        cards,
        transaction: null as TransactionRow | null,
    };
}

function unitCents(
    pricing: Pricing | null | undefined,
    finish: string
): number | null {
    const raw =
        finish === "foil"
            ? pricing?.prices.usd_foil
            : finish === "etched"
              ? pricing?.prices.usd_etched
              : finish === "nonfoil"
                ? pricing?.prices.usd
                : null;

    if (
        raw === null ||
        raw === undefined ||
        raw === ""
    ) {
        return null;
    }

    const amount = Number(raw);

    return Number.isFinite(amount) && amount >= 0
        ? Math.round(amount * 100)
        : null;
}

async function recordCollectionSnapshot(
    userId: number,
    collectionId: string,
    cards: BasketCard[],
    prices: Map<string, Pricing | null>
) {
    let cents = 0;
    let covered = 0;

    for (const card of cards) {
        const price = unitCents(
            prices.get(card.scryfall_id),
            card.finish
        );

        if (price !== null) {
            covered++;
            cents += price * Number(card.quantity);
        }
    }

    // Scope 0 represents all collections combined.
    // Incomplete observations have a null total.
    await db.execute(
        `INSERT INTO collection_value_snapshots (
            user_id,
            scope_id,
            snapshot_day,
            value_cents,
            variant_count,
            covered
         )
         VALUES (?, ?, UTC_DATE(), ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            value_cents = VALUES(value_cents),
            variant_count = VALUES(variant_count),
            covered = VALUES(covered)`,
        [
            userId,
            collectionId === "all" ? "0" : collectionId,
            covered === cards.length ? cents : null,
            cards.length,
            covered,
        ]
    );
}

async function loadCollectionHistory(
    userId: number,
    collectionId: string
): Promise<HistoryPoint[]> {
    const [rows] = await db.execute<CollectionSnapshotRow[]>(
        `SELECT
            DATE_FORMAT(
                snapshot_day,
                '%Y-%m-%d'
            ) AS day,
            value_cents AS cents,
            covered,
            variant_count
         FROM collection_value_snapshots
         WHERE user_id = ?
           AND scope_id = ?
           AND snapshot_day >=
               UTC_DATE() - INTERVAL 90 DAY
           AND snapshot_day <= UTC_DATE()
         ORDER BY snapshot_day`,
        [
            userId,
            collectionId === "all" ? "0" : collectionId,
        ]
    );

    return rows.map((row) => ({
        day: row.day,
        cents: row.cents === null ? null : Number(row.cents),
        covered: Number(row.covered),
        variantCount: Number(row.variant_count),
    }));
}

function buildHistory(
    cards: BasketCard[],
    rows: SnapshotRow[]
): HistoryPoint[] {
    const days = new Map<string, Map<string, number>>();

    for (const row of rows) {
        const prices =
            days.get(row.day) ?? new Map<string, number>();

        prices.set(
            variantKey(row.scryfall_id, row.finish),
            Number(row.price_cents)
        );

        days.set(row.day, prices);
    }

    return [...days.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, prices]) => {
            let cents = 0;
            let covered = 0;

            for (const card of cards) {
                const price = prices.get(
                    variantKey(card.scryfall_id, card.finish)
                );

                if (price !== undefined) {
                    covered++;
                    cents += price * Number(card.quantity);
                }
            }

            return {
                day,
                covered,
                cents: covered === cards.length ? cents : null,
            };
        });
}

async function loadHistory(
    cards: BasketCard[],
    since: string
): Promise<HistoryPoint[]> {
    if (!cards.length) {
        return [];
    }

    const conditions = cards
        .map(() => "(s.scryfall_id = ? AND s.finish = ?)")
        .join(" OR ");

    const variants = cards.flatMap((card) => [
        card.scryfall_id,
        card.finish,
    ]);

    const [rows] = await db.execute<SnapshotRow[]>(
        `SELECT
            s.scryfall_id,
            s.finish,
            DATE_FORMAT(
                s.recorded_at,
                '%Y-%m-%d'
            ) AS day,
            s.price * 100 AS price_cents
         FROM card_price_snapshots s
         WHERE s.currency = 'USD'
           AND s.recorded_at >= DATE(?)
           AND s.recorded_at >=
               UTC_DATE() - INTERVAL 90 DAY
           AND s.recorded_at <= UTC_TIMESTAMP()
           AND (${conditions})
         ORDER BY s.recorded_at ASC, s.id ASC`,
        [since, ...variants]
    );

    return buildHistory(cards, rows);
}

function changeClass(change: number | null) {
    if (change === null || change === 0) {
        return "text-zinc-600 dark:text-zinc-400";
    }

    return change > 0
        ? "text-green-600 dark:text-green-400"
        : "text-red-600 dark:text-red-400";
}

function signedMoney(cents: number) {
    return `${cents > 0 ? "+" : ""}${money(cents)}`;
}

function signedPercent(change: number, baseline: number) {
    if (baseline <= 0) {
        return "—";
    }

    const percent = (change / baseline) * 100;

    return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

function Metric({
    title,
    value,
    change = null,
}: {
    title: string;
    value: string;
    change?: number | null;
}) {
    return (
        <section className="rounded-xl border p-5">
            <h2 className="text-sm text-zinc-500">
                {title}
            </h2>

            <p
                className={`mt-2 text-2xl font-semibold ${changeClass(
                    change
                )}`}
            >
                {value}
            </p>
        </section>
    );
}

function chartGeometry(
    history: HistoryPoint[],
    baseline: number | null
) {
    const points = history.filter(
        (
            point
        ): point is HistoryPoint & { cents: number } =>
            point.cents !== null
    );

    if (!points.length) {
        return null;
    }

    const width = 760;
    const height = 300;
    const left = 84;
    const right = 24;
    const top = 24;
    const bottom = 50;

    const times = history.map((point) =>
        Date.parse(`${point.day}T00:00:00Z`)
    );

    const start = Math.min(...times);
    const end = Math.max(...times);

    const low = Math.min(
        ...(baseline === null ? [] : [baseline]),
        ...points.map((point) => point.cents)
    );

    const high = Math.max(
        ...(baseline === null ? [] : [baseline]),
        ...points.map((point) => point.cents)
    );

    const padding = Math.max(
        (high - low) * 0.12,
        high * 0.02,
        100
    );

    const minimum = Math.max(0, low - padding);
    const maximum = high + padding;

    const x = (day: string) =>
        end === start
            ? (left + width - right) / 2
            : left +
              ((Date.parse(`${day}T00:00:00Z`) - start) /
                  (end - start)) *
                  (width - left - right);

    const y = (cents: number) =>
        top +
        ((maximum - cents) / (maximum - minimum)) *
            (height - top - bottom);

    const segments: string[] = [];
    let active: string[] = [];

    for (const point of history) {
        if (point.cents === null) {
            if (active.length) {
                segments.push(active.join(" "));
            }

            active = [];
        } else {
            active.push(`${x(point.day)},${y(point.cents)}`);
        }
    }

    if (active.length) {
        segments.push(active.join(" "));
    }

    return {
        width,
        height,
        left,
        right,
        start,
        end,
        minimum,
        maximum,
        x,
        y,
        points,
        segments,
    };
}

function HistoryGraph({
    history,
    baseline,
    type,
}: {
    history: HistoryPoint[];
    baseline: number | null;
    type: "purchase" | "sale" | "collection";
}) {
    const chart = chartGeometry(history, baseline);

    if (!chart) {
        return (
            <p>
                No complete daily snapshots to graph yet.
                {type === "collection"
                    ? " Collection snapshots are recorded automatically when you view this page."
                    : " Available transaction prices are recorded automatically."}
                {" "}Every card needs a price for a complete point.
            </p>
        );
    }

    const first = chart.points[0];
    const last = chart.points[chart.points.length - 1];
    const change = last.cents - first.cents;
    const enoughHistory = chart.points.length >= 2;

    const comparison =
        baseline === null
            ? change
            : type === "purchase"
              ? last.cents - baseline
              : baseline - last.cents;

    const stroke =
        comparison > 0
            ? "#16a34a"
            : comparison < 0
              ? "#dc2626"
              : "#64748b";

    const ticks = Array.from(
        { length: 5 },
        (_, index) =>
            chart.minimum +
            ((chart.maximum - chart.minimum) * index) / 4
    );

    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
                <Metric
                    title="Latest recorded reference value"
                    value={money(last.cents)}
                />

                <Metric
                    title={
                        type === "collection"
                            ? "Collection value change over shown history"
                            : "Market value change over shown history"
                    }
                    value={
                        enoughHistory
                            ? `${signedMoney(change)} (${signedPercent(
                                  change,
                                  first.cents
                              )})`
                            : "Need a second snapshot date"
                    }
                    change={enoughHistory ? change : null}
                />
            </div>

            <div className="overflow-x-auto rounded-lg border bg-white p-2 dark:bg-zinc-950">
                <svg
                    viewBox={`0 0 ${chart.width} ${chart.height}`}
                    className="h-auto min-w-[540px] w-full"
                    role="img"
                    aria-label={`Recorded ${
                        type === "collection"
                            ? "collection"
                            : "transaction"
                    } value from ${first.day} to ${last.day}`}
                >
                    <title>
                        {type === "collection"
                            ? "Collection"
                            : "Transaction"}{" "}
                        reference value over time
                    </title>

                    <desc>
                        Dots show complete recorded daily values.
                        A dashed line, when present, shows the
                        transaction total. Incomplete dates break
                        the line.
                    </desc>

                    {ticks.map((tick, index) => (
                        <g key={index}>
                            <line
                                x1={chart.left}
                                x2={chart.width - chart.right}
                                y1={chart.y(tick)}
                                y2={chart.y(tick)}
                                stroke="currentColor"
                                opacity="0.12"
                            />

                            <text
                                x={chart.left - 10}
                                y={chart.y(tick) + 4}
                                textAnchor="end"
                                fill="currentColor"
                                fontSize="11"
                            >
                                {money(tick)}
                            </text>
                        </g>
                    ))}

                    {baseline !== null && (
                        <line
                            x1={chart.left}
                            x2={chart.width - chart.right}
                            y1={chart.y(baseline)}
                            y2={chart.y(baseline)}
                            stroke="#64748b"
                            strokeDasharray="6 5"
                        />
                    )}

                    {chart.segments.map((segment, index) => (
                        <polyline
                            key={index}
                            points={segment}
                            fill="none"
                            stroke={stroke}
                            strokeWidth="3"
                            strokeLinejoin="round"
                        />
                    ))}

                    {chart.points.map((point) => (
                        <circle
                            key={point.day}
                            cx={chart.x(point.day)}
                            cy={chart.y(point.cents)}
                            r="4"
                            fill={stroke}
                        >
                            <title>
                                {`${point.day}: ${money(point.cents)}`}
                            </title>
                        </circle>
                    ))}

                    <text
                        x={chart.left}
                        y={chart.height - 16}
                        fill="currentColor"
                        fontSize="12"
                    >
                        {history[0].day}
                    </text>

                    {chart.start !== chart.end && (
                        <text
                            x={chart.width - chart.right}
                            y={chart.height - 16}
                            textAnchor="end"
                            fill="currentColor"
                            fontSize="12"
                        >
                            {history[history.length - 1].day}
                        </text>
                    )}

                    <text
                        x={chart.width / 2}
                        y={chart.height - 2}
                        textAnchor="middle"
                        fill="currentColor"
                        fontSize="11"
                    >
                        Date (UTC)
                    </text>
                </svg>
            </div>

            <p className="text-sm text-zinc-500">
                Solid line: recorded value.{" "}
                {baseline !== null && (
                    <>
                        Dashed line:{" "}
                        {type === "purchase"
                            ? "purchase cost"
                            : "sale proceeds"}{" "}
                        ({money(baseline)}).{" "}
                    </>
                )}
                Hover over a point for its date and value.
                The change compares {first.day} with{" "}
                {last.day}; it is not realized profit.
            </p>

            {!enoughHistory && (
                <p className="text-sm text-zinc-500">
                    You have one complete snapshot date.
                    Visit again on a different day to show a trend.
                </p>
            )}
        </div>
    );
}

async function selectValueView(formData: FormData) {
    "use server";

    const view = formData.get("view");

    if (typeof view !== "string") {
        notFound();
    }

    const match =
        /^(collection|transaction):(all|[1-9]\d{0,19})$/.exec(
            view
        );

    if (!match) {
        notFound();
    }

    redirect(
        `/value?${match[1]}=${encodeURIComponent(match[2])}`
    );
}

export default function ValuePage({ searchParams }: Props) {
    return (
        <main className="mx-auto w-full max-w-5xl px-6 py-8">
            <h1 className="text-3xl font-semibold">
                Value Tracker
            </h1>

            <Suspense
                fallback={
                    <p className="mt-6">
                        Loading value…
                    </p>
                }
            >
                <UserValue searchParams={searchParams} />
            </Suspense>
        </main>
    );
}

async function UserValue({ searchParams }: Props) {
    await connection();

    const user = await requireUser();
    const params = await searchParams;

    if (
        params.collection !== undefined &&
        params.transaction !== undefined
    ) {
        notFound();
    }

    const collectionMode =
        params.collection !== undefined ||
        params.transaction === undefined;

    const selectedCollection = selection(params.collection);
    const selectedId = selection(params.transaction);

    const selectedValue = collectionMode
        ? `collection:${selectedCollection}`
        : `transaction:${selectedId}`;

    const [collections] = await db.execute<CollectionRow[]>(
        `SELECT id, name
         FROM collections
         WHERE user_id = ?
         ORDER BY name, id`,
        [user.id]
    );

    const collectionName =
        selectedCollection === "all"
            ? "All collections"
            : collections.find(
                  (collection) =>
                      String(collection.id) === selectedCollection
              )?.name;

    if (collectionMode && collectionName === undefined) {
        notFound();
    }

    const [options] = await db.execute<TransactionRow[]>(
        `SELECT
            id,
            name,
            type,
            currency,
            total_amount * 100 AS amount_cents,
            DATE_FORMAT(
                occurred_at,
                '%Y-%m-%d %H:%i:%s'
            ) AS occurred_at_sql
         FROM transactions
         WHERE user_id = ?
           AND currency = 'USD'
         ORDER BY occurred_at DESC, id DESC`,
        [user.id]
    );

    const { cards, transaction } = collectionMode
        ? await loadCollectionBasket(user.id, selectedCollection)
        : await loadBasket(user.id, selectedId);

    // Shared batch lookup replaces per-card requests.
    const prices = await loadScryfallPrices(cards);

    const values = cards.map((card) => ({
        id: card.scryfall_id,
        finish: card.finish,
        quantity: Number(card.quantity),
        name:
            prices.get(card.scryfall_id)?.name ??
            card.scryfall_id,
        cents: unitCents(
            prices.get(card.scryfall_id),
            card.finish
        ),
    }));

    values.sort(
        (a, b) =>
            (b.cents ?? 0) * b.quantity -
            (a.cents ?? 0) * a.quantity
    );

    const currentCents = values.reduce(
        (sum, card) =>
            sum + (card.cents ?? 0) * card.quantity,
        0
    );

    const missing = values.reduce(
        (sum, card) =>
            sum + (card.cents === null ? card.quantity : 0),
        0
    );

    const quantity = values.reduce(
        (sum, card) => sum + card.quantity,
        0
    );

    const complete = cards.length > 0 && missing === 0;

    const paid = options
        .filter((transaction) => transaction.type === "purchase")
        .reduce(
            (sum, transaction) =>
                sum + Number(transaction.amount_cents),
            0
        );

    const received = options
        .filter((transaction) => transaction.type === "sale")
        .reduce(
            (sum, transaction) =>
                sum + Number(transaction.amount_cents),
            0
        );

    const baseline = transaction
        ? Number(transaction.amount_cents)
        : 0;

    const difference =
        transaction?.type === "sale"
            ? baseline - currentCents
            : currentCents - baseline;

    let snapshotError = false;

    if (collectionMode) {
        try {
            await recordCollectionSnapshot(
                user.id,
                selectedCollection,
                cards,
                prices
            );
        } catch (error) {
            console.error(
                "Automatic collection snapshot failed:",
                error
            );

            snapshotError = true;
        }
    }

    const history: HistoryPoint[] = transaction
        ? await loadHistory(cards, transaction.occurred_at_sql)
        : collectionMode
          ? await loadCollectionHistory(
                user.id,
                selectedCollection
            )
          : [];

    const firstCompleteValue =
        history.find((point) => point.cents !== null)?.cents ??
        null;

    const checkedAt = new Date().toISOString();

    return (
        <div className="mt-6 space-y-6">
            <form
                action={selectValueView}
                className="flex flex-wrap items-end gap-4"
            >
                <label className="flex flex-1 flex-col gap-2">
                    View value for

                    <select
                        name="view"
                        defaultValue={selectedValue}
                        key={selectedValue}
                        className={selectClass}
                    >
                        <optgroup label="Collections">
                            <option value="collection:all">
                                All collections
                            </option>

                            {collections.map((collection) => (
                                <option
                                    key={collection.id}
                                    value={`collection:${collection.id}`}
                                >
                                    {collection.name}
                                </option>
                            ))}
                        </optgroup>

                        <optgroup label="Transactions">
                            <option value="transaction:all">
                                Account overview
                            </option>

                            {options.map((transaction) => (
                                <option
                                    key={transaction.id}
                                    value={`transaction:${transaction.id}`}
                                >
                                    {transaction.name}
                                    {" — "}
                                    {transaction.type}
                                    {" — "}
                                    {transaction.occurred_at_sql.slice(0, 10)}
                                    {" — "}
                                    {money(Number(transaction.amount_cents))}
                                </option>
                            ))}
                        </optgroup>
                    </select>
                </label>

                <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-4 py-3 text-white"
                >
                    View
                </button>
            </form>

            {transaction ? (
                <>
                    <h2 className="text-xl font-semibold">
                        {transaction.name}
                    </h2>

                    <p className="text-sm text-zinc-500">
                        Original transaction quantities are tracked
                        even if cards were later sold or moved.
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <Metric
                            title={
                                transaction.type === "purchase"
                                    ? "Total paid"
                                    : "Sale proceeds"
                            }
                            value={money(baseline)}
                        />

                        <Metric
                            title={
                                complete
                                    ? "Current reference value"
                                    : "Priced portion (incomplete)"
                            }
                            value={money(currentCents)}
                        />

                        <Metric
                            title={
                                transaction.type === "purchase"
                                    ? "Market value minus purchase cost"
                                    : "Sale proceeds minus current reference value"
                            }
                            value={
                                complete
                                    ? signedMoney(difference)
                                    : "Unavailable"
                            }
                            change={complete ? difference : null}
                        />

                        <Metric
                            title="Percentage difference"
                            value={
                                complete
                                    ? signedPercent(difference, baseline)
                                    : "—"
                            }
                            change={
                                complete && baseline > 0
                                    ? difference
                                    : null
                            }
                        />

                        <Metric
                            title="Copies in transaction"
                            value={String(quantity)}
                        />

                        <Metric
                            title="Copies without a price"
                            value={String(missing)}
                        />
                    </div>

                    <p className="text-sm text-amber-600">
                        {transaction.type === "purchase"
                            ? "This compares the original purchased basket with today's market. It is not realized profit or remaining inventory value."
                            : "This compares sale proceeds with today's reference value of the sold basket. It is not sale profit, which requires acquisition costs."}
                    </p>
                </>
            ) : collectionMode ? (
                <>
                    <h2 className="text-xl font-semibold">
                        {collectionName}
                    </h2>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <Metric
                            title={
                                missing > 0
                                    ? "Priced portion (incomplete)"
                                    : "Current collection value"
                            }
                            value={money(currentCents)}
                        />

                        <Metric
                            title="Owned copies"
                            value={String(quantity)}
                        />

                        <Metric
                            title="Copies without a price"
                            value={String(missing)}
                        />
                    </div>

                    <p
                        role={snapshotError ? "status" : undefined}
                        className={
                            snapshotError
                                ? "text-sm text-amber-600"
                                : "text-sm text-zinc-500"
                        }
                    >
                        {snapshotError
                            ? "Today's collection snapshot could not be saved. Reload the page to try again."
                            : "Today's collection snapshot was saved automatically. Repeat visits update today's snapshot (UTC)."}
                    </p>
                </>
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <Metric
                            title="Priced current collection value"
                            value={money(currentCents)}
                        />

                        <Metric
                            title="Total purchases (USD)"
                            value={money(paid)}
                        />

                        <Metric
                            title="Total sale proceeds (USD)"
                            value={money(received)}
                        />

                        <Metric
                            title="Net cash spent"
                            value={money(paid - received)}
                        />

                        <Metric
                            title="Owned copies"
                            value={String(quantity)}
                        />

                        <Metric
                            title="Copies without a price"
                            value={String(missing)}
                        />
                    </div>

                    <Metric
                        title="Cash-adjusted collection balance"
                        value={signedMoney(
                            currentCents + received - paid
                        )}
                        change={
                            missing === 0
                                ? currentCents + received - paid
                                : null
                        }
                    />

                    <p className="text-sm text-amber-600">
                        Collection value + sales − purchases.
                        This is not confirmed profit: imported
                        inventory may have unknown acquisition
                        costs, and unpriced cards are excluded.
                        Only USD transactions are included.
                    </p>
                </>
            )}

            <p className="text-sm text-zinc-500">
                USD reference prices match printing and finish;
                condition and language are not adjusted.
                Prices are cached for up to one hour.
                {" "}Lookup completed:{" "}
                <time dateTime={checkedAt}>
                    {checkedAt}
                </time>
                .
            </p>

            {transaction && (
                <AutoRecordSnapshot
                    key={String(transaction.id)}
                    transactionId={String(transaction.id)}
                />
            )}

            {(transaction || collectionMode) && (
                <section className="space-y-3 rounded-xl border p-5">
                    <h2 className="text-xl font-semibold">
                        {transaction ? "Transaction" : "Collection"}{" "}
                        value over time
                    </h2>

                    <p className="text-sm text-zinc-500">
                        {transaction
                            ? "Last 90 days of recorded prices on or after the transaction date (UTC). These are daily observations, not exact purchase-time quotes."
                            : "Last 90 days of saved collection totals (UTC). Each snapshot uses the quantities held when recorded. Changes include additions, removals, and market movement; they are not investment returns."}
                        {" "}Missing prices are not treated as zero.
                    </p>

                    <HistoryGraph
                        history={history}
                        baseline={transaction ? baseline : null}
                        type={transaction?.type ?? "collection"}
                    />

                    {!history.length ? (
                        <p>
                            {transaction
                                ? "No snapshots yet. Available prices are recorded automatically on this visit."
                                : "No saved snapshots yet. Collection snapshots are recorded automatically when you view this page."}
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr>
                                        <th className="p-3">
                                            Date (UTC)
                                        </th>
                                        <th className="p-3">
                                            Reference value
                                        </th>
                                        <th className="p-3">
                                            {transaction
                                                ? "Comparison"
                                                : "Change since first complete snapshot"}
                                        </th>
                                        <th className="p-3">
                                            Coverage
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {history.map((point) => {
                                        let comparison: number | null =
                                            null;

                                        if (point.cents !== null) {
                                            if (transaction) {
                                                comparison =
                                                    transaction.type === "sale"
                                                        ? baseline - point.cents
                                                        : point.cents - baseline;
                                            } else if (
                                                firstCompleteValue !== null
                                            ) {
                                                comparison =
                                                    point.cents -
                                                    firstCompleteValue;
                                            }
                                        }

                                        return (
                                            <tr
                                                key={point.day}
                                                className="border-t"
                                            >
                                                <td className="p-3">
                                                    {point.day}
                                                </td>

                                                <td className="p-3">
                                                    {point.cents === null
                                                        ? "Incomplete"
                                                        : money(point.cents)}
                                                </td>

                                                <td
                                                    className={`p-3 font-medium ${changeClass(
                                                        comparison
                                                    )}`}
                                                >
                                                    {comparison === null
                                                        ? "—"
                                                        : signedMoney(comparison)}
                                                </td>

                                                <td className="p-3">
                                                    {point.covered}/
                                                    {point.variantCount ??
                                                        cards.length}
                                                    {" "}
                                                    printing/finish variants
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            {!transaction && !collectionMode && (
                <p className="text-sm text-zinc-500">
                    Select a transaction for its fixed-basket
                    history, or select a collection to track
                    its total value automatically over time.
                </p>
            )}

            <section className="space-y-3">
                <h2 className="text-xl font-semibold">
                    {transaction
                        ? "Cards in transaction"
                        : "Current collection cards"}
                </h2>

                {!values.length ? (
                    <p>No cards to value.</p>
                ) : (
                    <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr>
                                    <th className="p-3">Card</th>
                                    <th className="p-3">Finish</th>
                                    <th className="p-3">Quantity</th>
                                    <th className="p-3">Unit price</th>
                                    <th className="p-3">Total</th>
                                </tr>
                            </thead>

                            <tbody>
                                {values.map((card) => (
                                    <tr
                                        key={variantKey(
                                            card.id,
                                            card.finish
                                        )}
                                        className="border-t"
                                    >
                                        <td className="p-3">
                                            {card.name}
                                        </td>
                                        <td className="p-3">
                                            {card.finish}
                                        </td>
                                        <td className="p-3">
                                            {card.quantity}
                                        </td>
                                        <td className="p-3">
                                            {card.cents === null
                                                ? "Unavailable"
                                                : money(card.cents)}
                                        </td>
                                        <td className="p-3">
                                            {card.cents === null
                                                ? "—"
                                                : money(
                                                      card.cents *
                                                          card.quantity
                                                  )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}