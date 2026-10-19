import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/server/database";

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
        !("username" in body) ||
        typeof body.username !== "string" ||
        !("password" in body) ||
        typeof body.password !== "string"
    ) {
        return NextResponse.json(
            { error: "Email, username, and password are required." },
            { status: 400 }
        );
    }

    const email = body.email.trim();
    const username = body.username.trim();
    const password = body.password;

    if (
        email.length > 255 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        username.length === 0 ||
        username.length > 50
    ) {
        return NextResponse.json(
            { error: "Provide a valid email and a username of 1–50 characters." },
            { status: 400 }
        );
    }

    if (
        password.length < 8 ||
        new TextEncoder().encode(password).length > 72
    ) {
        return NextResponse.json(
            { error: "Password must be at least 8 characters and at most 72 bytes." },
            { status: 400 }
        );
    }

    try {
        const passwordHash = await bcrypt.hash(password, 12);

        await db.execute(
            `INSERT INTO users (email, username, password)
             VALUES (?, ?, ?)`,
            [email, username, passwordHash]
        );

        return NextResponse.json(
            { message: "Account created. You can now sign in." },
            { status: 201 }
        );
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "ER_DUP_ENTRY"
        ) {
            return NextResponse.json(
                { error: "Email or username is already in use." },
                { status: 409 }
            );
        }

        console.error("Registration failed:", error);

        return NextResponse.json(
            { error: "Could not create account." },
            { status: 500 }
        );
    }
}