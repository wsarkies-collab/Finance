"use client";

import { useActionState } from "react";
import { signIn, signUp, type AuthActionState } from "./actions";

const initialState: AuthActionState = { error: null };

export function LoginForm() {
  const [signInState, signInAction, signInPending] = useActionState(signIn, initialState);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, initialState);

  return (
    <div style={{ maxWidth: 360 }}>
      <form action={signInAction} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" required minLength={6} />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" disabled={signInPending}>
            {signInPending ? "Logging in…" : "Log in"}
          </button>
          <button type="submit" formAction={signUpAction} disabled={signUpPending}>
            {signUpPending ? "Signing up…" : "Sign up"}
          </button>
        </div>
      </form>
      {signInState.error ? <p className="error-banner">{signInState.error}</p> : null}
      {signUpState.error ? <p className="error-banner">{signUpState.error}</p> : null}
    </div>
  );
}
