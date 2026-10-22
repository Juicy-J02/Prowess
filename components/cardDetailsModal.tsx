"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export interface DetailCard {
    id: number;
    scryfallId: string;
    name: string;
    setCode: string;
    collectorNumber: string;
    imageUrl: string | null;
    quantity: number;
    condition: string;
    finish: string;
    language: string;
}
interface Point { day: string; cents: number }
interface CardData {
    currentCents: number | null;
    quantity: number;
    name: string | null;
    setCode: string | null;
    collectorNumber: string | null;
    checkedAt: string;
    history: Point[];
}
const money = (cents: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
}).format(cents / 100);
const buttonClass = "rounded-xl border border-accent/40 bg-surface px-4 py-2 text-sm font-semibold text-accent enabled:hover:bg-surface-hover disabled:opacity-40";
const inputClass = "w-full rounded-xl border border-border bg-background p-3 text-foreground";

function PriceGraph({ points }: { points: Point[] }) {
    if (!points.length) return <p className="p-6 text-sm text-muted">No saved prices in this period yet.</p>;
    const width = 600, height = 240, left = 75, right = 20, top = 20, bottom = 40;
    const times = points.map((p) => Date.parse(`${p.day}T00:00:00Z`));
    const start = times[0], end = times[times.length - 1];
    const low = Math.min(...points.map((p) => p.cents));
    const high = Math.max(...points.map((p) => p.cents));
    const padding = Math.max((high - low) * 0.15, high * 0.02, 1);
    const minimum = Math.max(0, low - padding), maximum = high + padding;
    const x = (i: number) => start === end ? (left + width - right) / 2
        : left + (times[i] - start) / (end - start) * (width - left - right);
    const y = (cents: number) => top + (maximum - cents) / (maximum - minimum) * (height - top - bottom);
    const delta = points[points.length - 1].cents - points[0].cents;
    const color = delta > 0 ? "#4ade80" : delta < 0 ? "#f87171" : "#44e0c5";
    return <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recorded daily price per copy" className="h-auto w-full min-w-[360px] text-muted">
            <title>Recorded daily price per copy in USD</title>
            {Array.from({ length: 4 }, (_, i) => minimum + (maximum - minimum) * i / 3).map((tick, i) => <g key={i}>
                <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="currentColor" opacity="0.15" />
                <text x={left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="currentColor">{money(tick)}</text>
            </g>)}
            <polyline points={points.map((p, i) => `${x(i)},${y(p.cents)}`).join(" ")} fill="none" stroke={color} strokeWidth="3" />
            {points.map((p, i) => <circle key={p.day} cx={x(i)} cy={y(p.cents)} r="4" fill={color}>
                <title>{`${p.day}: ${money(p.cents)}`}</title>
            </circle>)}
            <text x={left} y={height - 12} fontSize="11" fill="currentColor">{points[0].day}</text>
            {start !== end && <text x={width - right} y={height - 12} textAnchor="end" fontSize="11" fill="currentColor">{points[points.length - 1].day}</text>}
        </svg>
    </div>;
}

export default function CardDetailsModal({ card, collectionId, onClose }: {
    card: DetailCard;
    collectionId: number;
    onClose: () => void;
}) {
    const router = useRouter();
    const dialog = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const [data, setData] = useState<CardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [reload, setReload] = useState(0);
    const [days, setDays] = useState(30);
    const [mode, setMode] = useState<"purchase" | "sale" | null>(null);
    const [quantity, setQuantity] = useState("1");
    const [total, setTotal] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        const element = dialog.current;
        if (element && !element.open) element.showModal();
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setLoadError("");
        async function load() {
            try {
                const query = new URLSearchParams({ collectionId: String(collectionId), cardId: String(card.id) });
                const response = await fetch(`/api/cards/history?${query}`, { cache: "no-store", signal: controller.signal });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error ?? "Could not load prices.");
                if (!controller.signal.aborted) setData(result);
            } catch (err) {
                if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : "Could not load prices.");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void load();
        return () => controller.abort();
    }, [card.id, collectionId, reload]);

    const owned = data?.quantity ?? card.quantity;
    const name = data?.name || card.name;
    const setCode = data?.setCode || card.setCode;
    const collectorNumber = data?.collectorNumber || card.collectorNumber;
    const metadataReady = Boolean(name && name !== card.scryfallId && setCode && collectorNumber);
    const today = Date.parse(`${(data?.checkedAt ?? new Date().toISOString()).slice(0, 10)}T00:00:00Z`);
    const points = (data?.history ?? []).filter((p) => Date.parse(`${p.day}T00:00:00Z`) >= today - (days - 1) * 86400000);
    const first = points[0], last = points[points.length - 1];
    const delta = points.length >= 2 ? last.cents - first.cents : null;
    const percent = delta !== null && first.cents > 0 ? delta / first.cents * 100 : null;

    function chooseMode(next: "purchase" | "sale") {
        setMode(next);
        setQuantity("1");
        setTotal("");
        setError("");
        setSuccess("");
    }
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || !mode) return;
        setError("");
        const count = Number(quantity);
        if (!/^[1-9]\d*$/.test(quantity) || !Number.isSafeInteger(count) || count > 4294967295) {
            setError("Enter a valid quantity."); return;
        }
        if (mode === "sale" && count > owned) { setError("You do not own that many copies."); return; }
        if (!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(total)) { setError("Enter the total paid or received, such as 12.50."); return; }
        if (mode === "purchase" && !metadataReady) { setError("This card is missing set details. Use the Transactions page to select its printing."); return; }
        setBusy(true);
        try {
            const response = await fetch("/api/transactions", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    collectionId, type: mode, name: `${mode === "sale" ? "Sale" : "Purchase"}: ${name}`.slice(0, 100),
                    totalAmount: total, currency: "USD", notes: "",
                    items: [{
                        scryfallId: card.scryfallId, quantity: count, condition: card.condition,
                        finish: card.finish, language: card.language, cardName: name, setCode, collectorNumber
                    }],
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? "Could not save transaction.");
            const nextOwned = owned + (mode === "purchase" ? count : -count);
            setData((previous) => previous ? { ...previous, quantity: nextOwned } : previous);
            setMode(null);
            setSuccess("Transaction saved. Your collection and transaction history have been updated.");
            router.refresh();
            if (nextOwned === 0) onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save transaction.");
        } finally { setBusy(false); }
    }

    return <dialog ref={dialog} aria-labelledby={titleId} onClose={onClose}
        onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-accent/30 bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/75">
        <div className="p-5 sm:p-7">
            <header className="flex items-start justify-between gap-4">
                <div><span className="badge">Card details</span><h2 id={titleId} className="mt-3 break-words text-2xl font-semibold">{name}</h2>
                    <p className="mt-2 text-sm text-muted">{setCode.toUpperCase()} {collectorNumber && `#${collectorNumber}`} · {card.finish} · {card.condition} · {card.language}</p>
                </div>
                <button type="button" autoFocus disabled={busy} onClick={onClose} className={buttonClass} aria-label="Close card details">✕</button>
            </header>
            <div className="mt-6 grid gap-6 sm:grid-cols-[150px_minmax(0,1fr)]">
                <div>{card.imageUrl && <img src={card.imageUrl} alt={name} width={488} height={680} className="mx-auto h-auto w-36 rounded-xl sm:w-full" />}<p className="mt-3 text-center text-sm text-muted">{owned} copies owned</p></div>
                <div className="min-w-0 space-y-4">
                    {loading && <p role="status" className="text-muted">Loading prices…</p>}
                    {loadError && <div role="alert" className="text-sm text-red-300">{loadError}<button type="button" className={`${buttonClass} ml-3`} onClick={() => setReload((v) => v + 1)}>Retry</button></div>}
                    {data && <>
                        <div className="rounded-xl border border-border bg-surface p-4"><p className="text-sm text-muted">Current reference price · per copy</p><p className="mt-2 text-3xl font-bold text-accent">{data.currentCents === null ? "Unavailable" : money(data.currentCents)}</p></div>
                        <div className="flex flex-wrap gap-2" aria-label="Price history range">{[7, 30, 90].map((range) => <button key={range} type="button" aria-pressed={days === range} onClick={() => setDays(range)} className={`${buttonClass} ${days === range ? "border-teal text-teal" : ""}`}>{range} days</button>)}</div>
                        <div className="rounded-xl border border-border bg-surface p-2"><PriceGraph points={points} /></div>
                        <p className={`text-sm font-semibold ${delta === null || delta === 0 ? "text-muted" : delta > 0 ? "text-green-400" : "text-red-400"}`}>
                            {delta === null ? "Not enough history yet. Two recorded dates are needed." : `${delta > 0 ? "↑ +" : delta < 0 ? "↓ " : ""}${money(delta)}${percent === null ? "" : ` (${percent > 0 ? "+" : ""}${percent.toFixed(2)}%)`} · ${first.day} to ${last.day}`}
                        </p>
                        <p className="text-xs leading-5 text-muted">USD reference prices for this printing and finish; condition and language are not adjusted. The chart uses saved observations, with no prices filled in for missing dates. Current prices may be cached for up to one hour.</p>
                    </>}
                </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" disabled={busy || loading || !data || !metadataReady} onClick={() => chooseMode("purchase")} className={buttonClass}>Buy More</button>
                <button type="button" disabled={busy || owned < 1} onClick={() => chooseMode("sale")} className={buttonClass}>Record Sale</button>
            </div>
            {data && !metadataReady && <p className="mt-3 text-sm text-accent">Set details are missing. To buy more, select the printing on the Transactions page.</p>}
            {mode && <form onSubmit={save} className="mt-5 rounded-xl border border-border bg-surface p-4">
                <h3 className="font-semibold">{mode === "purchase" ? "Record purchase" : "Record sale"}</h3>
                <p className="mt-2 text-sm text-muted">Records a transaction for this exact printing, finish, condition, and language.</p>
                <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm">Quantity<input required type="number" min="1" step="1" max={mode === "sale" ? owned : 4294967295} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} /></label>
                    <label className="space-y-2 text-sm">Total {mode === "purchase" ? "paid" : "received"} (USD)<input required inputMode="decimal" placeholder="0.00" value={total} onChange={(e) => setTotal(e.target.value)} className={inputClass} /></label>
                    <div className="flex flex-wrap gap-3 sm:col-span-2"><button type="submit" className="rounded-xl border border-accent bg-accent px-5 py-3 font-bold text-background">{busy ? "Saving…" : "Save Transaction"}</button><button type="button" onClick={() => setMode(null)} className={buttonClass}>Cancel</button></div>
                </fieldset>
            </form>}
            {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
            {success && <p role="status" className="mt-4 text-sm text-green-300">{success}</p>}
        </div>
    </dialog>;
}
