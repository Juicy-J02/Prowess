import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/server/database";

interface UserRow extends RowDataPacket {
    id: number;
    username: string;
    email: string;
    password_hash: string;
}

export async function POST(request: Request) {
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
        !("email" in body) ||
        typeof body.email !== "string" ||
        body.email.trim() === "" ||
        !("password" in body) ||
        typeof body.password !== "string" ||
        body.password === ""
    ) {
        return NextResponse.json(
            { error: "Email and password are required." },
            { status: 400 }
        );
    }

    try {
        const [users] = await db.execute<UserRow[]>(
            `SELECT id, username, email, password_hash
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [body.email.trim()]
        );

        const user = users[0];

        if (
            !user ||
            !(await bcrypt.compare(body.password, user.password_hash))
        ) {
            return NextResponse.json(
                { error: "Invalid email or password." },
                { status: 401 }
            );
        }

        return NextResponse.json({
            message: "Credentials verified.",
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
            },
        });
    } catch (error) {
        console.error("Sign-in failed:", error);

        return NextResponse.json(
            { error: "Could not sign in." },
            { status: 500 }
        );
    }
}