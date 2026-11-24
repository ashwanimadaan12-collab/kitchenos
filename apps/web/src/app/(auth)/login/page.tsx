"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Field, Icon, Input } from "@kitchenos/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Login nahi hua." }))) as {
          message?: string;
        };
        setError(body.message ?? "Login nahi hua. Email aur password dobara check karo.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-wrap items-stretch">
      {/* Left side carries the brand so the first screen isn't a lone grey box.
          It drops away under 900px — on a counter tablet the form is the whole job. */}
      <div className="hidden flex-1 flex-col justify-between bg-brand-deep p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand">
            <Icon name="logo" size={20} strokeWidth={2.3} />
          </span>
          <span className="font-display text-xl font-bold tracking-tight">KitchenOS</span>
        </div>

        <div>
          <p className="font-display text-[40px] font-bold leading-[1.1] tracking-tight text-balance">
            Order lo, kitchen chalao, stock dekho — ek hi jagah.
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-[15px] text-white/80">
            <li>Ek tap me order — koi popup nahi</li>
            <li>Zomato, Swiggy, dine-in, parcel — sab ek screen pe</li>
            <li>Net chala jaye to bhi bill banta rahega</li>
          </ul>
        </div>

        <p className="text-sm text-white/60">Noida · Delhi NCR ke restaurants ke liye banaya gaya</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-canvas px-4 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
              <Icon name="logo" size={18} strokeWidth={2.3} />
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-ink">KitchenOS</span>
          </div>

          <h1 className="mt-6 font-display text-[26px] font-bold tracking-tight text-ink lg:mt-0">
            Andar aao
          </h1>
          <p className="mt-1 text-sm text-ink-2">Apne restaurant ka account kholo</p>

          <div className="mt-7 flex flex-col gap-4">
            <Field htmlFor="email" label="Email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field htmlFor="password" label="Password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </div>

          {error ? (
            <p className="mt-4 rounded-control bg-bad-tint px-4 py-3 text-sm font-semibold text-bad" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" block isLoading={isLoading} className="mt-6">
            Andar aao
          </Button>

          <p className="mt-5 text-center text-sm text-ink-2">
            Naya restaurant hai?{" "}
            <Link href="/signup" className="font-bold text-brand hover:underline">
              2 minute me set up karo
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
