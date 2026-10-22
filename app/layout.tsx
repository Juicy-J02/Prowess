import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import {
  SESSION_COOKIE,
  getSessionUser,
} from "@/lib/server/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prowess",
  description: "Track your cards, transactions, and collection value.",
};

async function Timestamp() {
  "use cache";

  return <time>{new Date().getFullYear()}</time>;
}

async function AccountLink() {
  await connection();

  const cookieStore = await cookies();

  const user = await getSessionUser(
    cookieStore.get(SESSION_COOKIE)?.value
  );

  return (
    <Link
      href="/signin"
      className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
    >
      {user ? user.username : "Sign In"}
    </Link>
  );
}

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="border-b px-6 py-4">
          <nav className="mx-auto flex max-w-6xl items-center gap-6">
            <Link href="/" className="text-xl font-bold">
              Prowess
            </Link>

            <Link href="/transactions">Transactions</Link>
            <Link href="/value">Value</Link>
            <Link href="/collection">Collection</Link>

            <div className="ml-auto">
              <Suspense
                fallback={
                  <span className="text-sm text-zinc-500">
                    Loading…
                  </span>
                }
              >
                <AccountLink />
              </Suspense>
            </div>
          </nav>
        </header>

        <div className="flex flex-1 flex-col">
          {children}
        </div>

        <footer className="border-t px-6 py-4 text-center text-sm">
          © <Timestamp /> Prowess
        </footer>
      </body>
    </html>
  );
}