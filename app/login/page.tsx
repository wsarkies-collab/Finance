import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <>
      <h1>Log in</h1>
      <p className="muted">Save a personal watchlist of tickers to track, or save your Portfolio Calculator selections.</p>
      <LoginForm />
    </>
  );
}
