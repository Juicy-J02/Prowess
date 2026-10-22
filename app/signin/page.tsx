"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

interface SessionUser {
  id: number;
  username: string;
  email: string;
}

export default function SignIn() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState("");

  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 401) {
          setUser(null);
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Could not check session.");
        }

        setUser(data.user);
      } catch (error) {
        if (!controller.signal.aborted) {
          setSessionError(
            error instanceof Error
              ? error.message
              : "Could not check session."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setCheckingSession(false);
        }
      }
    }

    void checkSession();

    return () => controller.abort();
  }, []);

  function toggleMode() {
    setRegistering((current) => !current);
    setError("");
    setSuccess("");
    setPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const endpoint = registering
        ? "/api/auth/register"
        : "/api/auth/signin";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          registering
            ? {
                email: email.trim(),
                username: username.trim(),
                password,
              }
            : {
                email: email.trim(),
                password,
              }
        ),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Request failed.");
      }

      setPassword("");

      if (registering) {
        setRegistering(false);
        setSuccess("Account created. You can now sign in.");
      } else {
        window.location.href = "/";
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not submit form."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    if (submitting) return;

    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/session", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Could not sign out.");
      }

      window.location.href = "/signin";
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not sign out."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-black outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white";

  const labelClass =
    "text-sm font-medium text-zinc-900 dark:text-zinc-100";

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
        {checkingSession ? (
          <p role="status" className="text-zinc-600 dark:text-zinc-400">
            Checking session…
          </p>
        ) : sessionError ? (
          <div className="space-y-4">
            <p role="alert" className="text-red-500">
              {sessionError}
            </p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-blue-600 px-4 py-3 text-white"
            >
              Try Again
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
              {user
                ? `Welcome, ${user.username}`
                : registering
                  ? "Create Account"
                  : "Sign In"}
            </h1>

            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {user
                ? "You are signed in."
                : registering
                  ? "Create an account to start tracking your collection."
                  : "Sign in to manage your collection."}
            </p>

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-500">
                {error}
              </p>
            )}

            {success && (
              <p role="status" className="mt-4 text-sm text-green-600">
                {success}
              </p>
            )}

            {user ? (
              <div className="mt-8 flex flex-col gap-4">
                <Link
                  href="/"
                  className="rounded-lg bg-blue-600 px-4 py-3 text-center font-medium text-white hover:bg-blue-700"
                >
                  Your Dashboard
                </Link>

                <button
                  type="button"
                  onClick={() => void signOut()}
                  disabled={submitting}
                  className="rounded-lg bg-zinc-200 px-4 py-3 text-black disabled:opacity-50"
                >
                  {submitting ? "Signing out…" : "Sign Out"}
                </button>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="mt-8">
                  <fieldset
                    disabled={submitting}
                    className="flex flex-col gap-5"
                  >
                    <div className="flex flex-col gap-2">
                      <label htmlFor="email" className={labelClass}>
                        Email
                      </label>

                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete={registering ? "email" : "username"}
                        placeholder="Enter your email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className={inputClass}
                      />
                    </div>

                    {registering && (
                      <div className="flex flex-col gap-2">
                        <label htmlFor="username" className={labelClass}>
                          Username
                        </label>

                        <input
                          id="username"
                          name="username"
                          type="text"
                          autoComplete="username"
                          placeholder="Choose a username"
                          required
                          maxLength={50}
                          value={username}
                          onChange={(event) =>
                            setUsername(event.target.value)
                          }
                          className={inputClass}
                        />
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <label htmlFor="password" className={labelClass}>
                        Password
                      </label>

                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete={
                          registering ? "new-password" : "current-password"
                        }
                        placeholder={
                          registering
                            ? "Choose a password"
                            : "Enter your password"
                        }
                        required
                        minLength={registering ? 8 : undefined}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className={inputClass}
                      />
                    </div>

                    <button
                      type="submit"
                      className="mt-2 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submitting
                        ? "Please wait…"
                        : registering
                          ? "Register"
                          : "Sign In"}
                    </button>
                  </fieldset>
                </form>

                <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
                  {registering
                    ? "Already have an account?"
                    : "Don't have an account?"}{" "}
                  <button
                    type="button"
                    onClick={toggleMode}
                    disabled={submitting}
                    className="font-medium text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {registering ? "Sign In" : "Register"}
                  </button>
                </p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}