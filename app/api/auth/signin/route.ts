import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/server/database";
import { createSession, SESSION_COOKIE, SESSION_SECONDS, sessionCookieOptions } from "@/lib/server/session";

interface UserRow extends RowDataPacket {
    id: number;
    username: string;
    email: string;
    password: string;
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
            `SELECT id, username, email, password
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [body.email.trim()]
        );

        const user = users[0];

        if (
            !user ||
            !(await bcrypt.compare(body.password, user.password))
        ) {
            return NextResponse.json(
                { error: "Invalid email or password." },
                { status: 401 }
            );
        }

        const token = await createSession(user.id);

        const response = NextResponse.json({
            message: "Signed in successfully.",
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
            },
        });

        response.headers.set("Cache-Control", "no-store");

        response.cookies.set(SESSION_COOKIE, token, {
            ...sessionCookieOptions,
            maxAge: SESSION_SECONDS,
        });

        return response;
    } catch (error) {
        console.error("Sign-in failed:", error);

        return NextResponse.json(
            { error: "Could not sign in." },
            { status: 500 }
        );
    }
}