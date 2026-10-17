"use client";

import { useState, type FormEvent } from "react";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    // Connect your sign-in API here.
    setError("Sign-in is not connected yet.");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
        <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
          Sign In
        </h1>

        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          "Sign in to manage your collection."
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="email"
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="Enter your email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-black outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="username"
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Username
            </label>

            <input
              id="username"
              name="username"
              type="username"
              autoComplete="current-username"
              placeholder="Enter your username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-black outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="password"
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-black outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="mt-2 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            Sign In
          </button>
        </form>
      </main>
    </div>
  );
}