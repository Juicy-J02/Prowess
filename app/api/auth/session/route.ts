import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions, getSessionUser, deleteSession } from "@/lib/server/session";

export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get(SESSION_COOKIE)?.value;
        const user = await getSessionUser(token);

        return NextResponse.json(
            user
                ? { user }
                : { user: null, error: "Not signed in." },
            {
                status: user ? 200 : 401,
                headers: { "Cache-Control": "no-store" },
            }
        );
    } catch (error) {
        console.error("Session lookup failed:", error);

        return NextResponse.json(
            { error: "Could not check session." },
            {
                status: 500,
                headers: { "Cache-Control": "no-store" },
            }
        );
    }
}

export async function DELETE(request: NextRequest) {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
        return NextResponse.json(
            { error: "Invalid request origin." },
            { status: 403 }
        );
    }

    try {
        const token = request.cookies.get(SESSION_COOKIE)?.value;

        await deleteSession(token);

        const response = NextResponse.json({
            message: "Signed out successfully.",
        });

        response.headers.set("Cache-Control", "no-store");

        response.cookies.set(SESSION_COOKIE, "", {
            ...sessionCookieOptions,
            maxAge: 0,
        });

        return response;
    } catch (error) {
        console.error("Sign-out failed:", error);

        return NextResponse.json(
            { error: "Could not sign out." },
            { status: 500 }
        );
    }
}