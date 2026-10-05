"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth-wrap">
      <h1>Bir sorun oluştu</h1>
      <p>Lütfen yeniden deneyin.</p>
      <button className="button primary" onClick={reset}>
        Yeniden dene
      </button>
      <Link className="button secondary" href="/">
        Ana sayfaya dön
      </Link>
    </main>
  );
}
