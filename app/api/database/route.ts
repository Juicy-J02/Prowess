import { NextResponse } from "next/server";
import { db } from "@/lib/server/database";

export async function GET() {
    try {
        await db.query("SELECT 1");

        return NextResponse.json({
            message: "Database connected successfully.",
        });
    } catch (error) {
        console.error("Database connection failed:", error);

        return NextResponse.json(
            { error: "Could not connect to database." },
            { status: 500 }
        );
    }
}

export async function POST() {
    try {
        await db.getConnection

        return NextResponse.json({
            message: "Database connected successfully.",
        });
    } catch (error) {
        console.error("Database connection failed:", error);

        return NextResponse.json(
            { error: "Could not connect to database." },
            { status: 500 }
        );
    }
}