import Link from "next/link";
export default function NotFound() {
  return (
    <main className="auth-wrap">
      <h1>Sayfa bulunamadı</h1>
      <Link className="button primary" href="/">
        Ana sayfaya dön
      </Link>
    </main>
  );
}
