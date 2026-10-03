"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth-wrap">
      <h1>Bir sorun oluştu</h1>
      <p>Lütfen yeniden deneyin.</p>
      <button className="button primary" onClick={reset}>
        Yeniden dene
      </button>
    </main>
  );
}
