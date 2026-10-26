"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ParticleField } from "@/components/system/particles";
import { api } from "@/lib/client/api";
import { play } from "@/lib/client/sound";

type Mode = "intro" | "signup" | "login";

export default function Gate() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("intro");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    api<{ user: { id: string } | null; backend: string }>("/api/auth/me")
      .then((r) => {
        setBackend(r.backend);
        if (r.user) router.replace(new URLSearchParams(window.location.search).get("next") ?? "/status");
      })
      .catch(() => setBackend("unknown"));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        const r = await api<{ needsConfirmation: boolean }>("/api/auth/signup", { json: { email, password } });
        if (r.needsConfirmation) {
          setInfo("Check your email to confirm your account, then sign in.");
          setMode("login");
          return;
        }
        play("levelup");
        router.replace("/awakening");
      } else {
        await api("/api/auth/login", { json: { email, password } });
        play("notify");
        router.replace(new URLSearchParams(window.location.search).get("next") ?? "/status");
      }
    } catch (err) {
      setError((err as Error).message);
      play("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <ParticleField density={0.00009} />
      <div className="w-full max-w-md">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }} className="mb-6 text-center">
          <h1 className="sys-title text-3xl font-black text-fg text-glow sm:text-4xl">SYSTEM IRL</h1>
          <p className="mt-2 text-sm text-dim">Every action in the real world contributes to the evolution of the Player.</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {mode === "intro" ? (
            <motion.section key="intro" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.5 }} className="sys-panel sys-panel-glow scanlines relative overflow-hidden p-6 text-center">
              <div className="holo-sheen" />
              <p className="font-display text-[11px] tracking-[0.35em] text-accent text-glow">[NOTIFICATION]</p>
              <p className="mt-5 text-lg leading-relaxed text-fg">
                You have acquired the qualifications
                <br />
                to be a <span className="font-display text-accent-2 text-glow-violet">PLAYER</span>.
              </p>
              <p className="mt-3 text-base text-dim">Will you accept?</p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button size="lg" onClick={() => { play("notify"); setMode("signup"); }}>
                  Accept
                </Button>
                <Button size="lg" variant="outline" onClick={() => setMode("login")}>
                  I am already a Player
                </Button>
              </div>
            </motion.section>
          ) : (
            <motion.form key={mode} onSubmit={submit} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="sys-panel sys-panel-glow relative space-y-4 p-6" aria-label={mode === "signup" ? "Create account" : "Sign in"}>
              <p className="font-display text-[11px] tracking-[0.3em] text-accent text-glow">{mode === "signup" ? "[PLAYER REGISTRATION]" : "[PLAYER AUTHENTICATION]"}</p>
              {info ? <p className="rounded-lg border border-sky-400/40 bg-sky-500/10 p-2 text-sm text-sky-200 light:text-sky-800">{info}</p> : null}
              <Field label="Email" htmlFor="email">
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
                <Input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {error ? (
                <p role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 p-2 text-sm text-red-200 light:text-red-800">
                  {error}
                </p>
              ) : null}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {mode === "signup" ? "Awaken" : "Enter the System"}
              </Button>
              <button type="button" className="w-full cursor-pointer text-center text-sm text-dim underline-offset-4 hover:text-fg hover:underline" onClick={() => { setError(null); setMode(mode === "signup" ? "login" : "signup"); }}>
                {mode === "signup" ? "Already a Player? Sign in" : "New here? Create an account"}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <p className="mt-6 text-center text-xs text-faint">
          {backend === "local"
            ? "Local demo mode: accounts and data live in a PostgreSQL database (PGlite) on this server. Configure Supabase for hosted auth."
            : backend === "supabase"
              ? "Secured by Supabase authentication. Your profile is private by default."
              : " "}
        </p>
      </div>
    </main>
  );
}
