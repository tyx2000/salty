import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export function LoginPanel() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setMessage(result.error.message);
    } else if (mode === "signup") {
      setMessage("Account created. Check your email if confirmation is enabled.");
    }

    setBusy(false);
  }

  return (
    <section className="auth-layout">
      <form className="auth-panel" onSubmit={handleSubmit}>
        <h1>{mode === "login" ? "Login" : "Create account"}</h1>
        <p>
          Use Supabase Auth for identity. Chat content remains encrypted before
          it is written to the database.
        </p>

        <label>
          Email
          <input
            autoComplete="email"
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>

        <label>
          Password
          <input
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>

        {message ? <div className="notice">{message}</div> : null}

        <button disabled={busy} type="submit">
          {busy ? "Working..." : mode === "login" ? "Login" : "Sign up"}
        </button>

        <button
          className="link-button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          type="button"
        >
          {mode === "login" ? "Need an account?" : "Already have an account?"}
        </button>
      </form>
    </section>
  );
}
