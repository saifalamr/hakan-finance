"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  CarFront,
  Home,
  LogOut,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  Wallet,
} from "lucide-react";
import { useData, errorMessage } from "./data-provider";
import {
  Dashboard,
  Transactions,
  Vehicles,
  Employees,
  Reports,
} from "./business-screens";
import { More } from "./screens";
import {
  EntityForm,
  TransactionForm,
  type EntityModal,
  type TransactionPrefill,
} from "./forms";
import { type Transaction } from "@/lib/finance";
import { demoAllowed, isConfigured, supabase } from "@/lib/supabase";
import { EmptyState } from "./ui";
const nav = [
  { href: "/", label: "Ana Sayfa", icon: Home },
  { href: "/islemler", label: "İşlemler", icon: Wallet },
  { href: "/araclar", label: "Araçlar", icon: CarFront },
  { href: "/personel", label: "Personel", icon: UsersRound },
  { href: "/daha-fazla", label: "Daha Fazla", icon: MoreHorizontal },
];
function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Finans ana sayfa">
      <span className="brand-mark">
        f<span>.</span>
      </span>
      <span>
        finans<span className="brand-sub">İşinizin finansı.</span>
      </span>
    </Link>
  );
}
function AuthScreen() {
  const { startDemo, loadError, demo, signOut } = useData();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { error } = await supabase!.auth.signInWithPassword({
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
      });
      if (error) {
        setError(
          error.code === "invalid_credentials"
            ? "E-posta veya şifre hatalı."
            : error.code === "email_not_confirmed"
              ? "E-posta adresinizi doğrulayın."
              : "Giriş yapılamadı. Bağlantınızı ve hesap bilgilerinizi kontrol edin.",
        );
      }
    } catch {
      setError("Bağlantı kurulamadı. Yeniden deneyin.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Brand />
        <div className="auth-intro">
          <p className="eyebrow">GELİR. GİDER. HEPSİ NET.</p>
          <h1>
            İşinizin finansı,
            <br />
            kontrolünüz altında.
          </h1>
          <p>
            {isConfigured
              ? "Hesabınıza giriş yaparak devam edin."
              : "Uygulama kurulumu henüz tamamlanmadı."}
          </p>
        </div>
        {isConfigured ? (
          <form onSubmit={login} className="auth-form">
            <label className="field">
              <span>E-posta</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
                placeholder="E-posta adresiniz"
              />
            </label>
            <label className="field">
              <span>Şifre</span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="Şifreniz"
              />
            </label>
            {(error || loadError) && (
              <p role="alert" className="form-error">
                {error || loadError}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? "Giriş yapılıyor…" : "Giriş Yap"}
              <ArrowRight size={18} />
            </button>
            {loadError && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  void signOut().catch((e) => setError(errorMessage(e)))
                }
              >
                Oturumu kapat
              </button>
            )}
          </form>
        ) : (
          <div className="setup-note">
            <ShieldCheck size={22} />
            <p>
              Yönetici bağlantı ayarlarını tamamladığında giriş ekranı
              açılacaktır.
            </p>
          </div>
        )}
        {demoAllowed && !demo && (
          <button
            className="button secondary full demo-start"
            onClick={startDemo}
          >
            Geliştirme demosunu aç
          </button>
        )}
        <div className="auth-footer">
          <ShieldCheck size={15} />
          Yalnızca yönetici erişimi
        </div>
      </div>
      <p className="auth-bottom">Daha az karmaşa. Daha net bir tablo.</p>
    </main>
  );
}
function Shell() {
  const store = useData();
  const pathname = usePathname();
  const router = useRouter();
  const [transactionModal, setTransactionModal] = useState<{
      transaction?: Transaction;
      prefill?: TransactionPrefill;
    } | null>(null),
    [entityModal, setEntityModal] = useState<EntityModal | null>(null);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  if (!store.ready)
    return (
      <main className="loading-screen">
        <span className="brand-mark">
          f<span>.</span>
        </span>
        <p>Yükleniyor…</p>
      </main>
    );
  if (!store.userId) return <AuthScreen />;
  const actions = {
    add: (prefill?: TransactionPrefill) => setTransactionModal({ prefill }),
    edit: (transaction: Transaction) => setTransactionModal({ transaction }),
    entity: setEntityModal,
  };
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[0] || "";
  const valid =
    !section ||
    ["islemler", "araclar", "personel", "raporlar", "daha-fazla"].includes(
      section,
    );
  const active = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname.startsWith(href) ||
        (href === "/daha-fazla" && section === "raporlar");
  async function logout() {
    try {
      await store.signOut();
      setTransactionModal(null);
      setEntityModal(null);
      router.replace("/");
    } catch (e) {
      store.notify(errorMessage(e));
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <p className="sidebar-caption">ÇALIŞMA ALANINIZ</p>
        <nav aria-label="Ana menü">
          {nav.slice(0, 4).map(({ href, label, icon: Icon }) => (
            <Link
              href={href}
              key={href}
              aria-current={active(href) ? "page" : undefined}
              className={active(href) ? "nav-link active" : "nav-link"}
            >
              <Icon size={20} strokeWidth={1.7} />
              {label}
            </Link>
          ))}
          <Link
            href="/raporlar"
            aria-current={section === "raporlar" ? "page" : undefined}
            className={section === "raporlar" ? "nav-link active" : "nav-link"}
          >
            <BarChart3 size={20} strokeWidth={1.7} />
            Raporlar
          </Link>
          <Link
            href="/daha-fazla"
            className={
              section === "daha-fazla" ? "nav-link active" : "nav-link"
            }
          >
            <MoreHorizontal size={20} />
            Daha Fazla
          </Link>
        </nav>
        <div className="sidebar-footer">
          <div className="admin-profile">
            <span className="admin-avatar">Y</span>
            <div>
              <strong>Yönetici</strong>
              <small>Tek hesap · TRY</small>
            </div>
          </div>
          <button className="text-button" onClick={logout}>
            <LogOut size={16} />
            Çıkış Yap
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <span className="desktop-topbar-label">Finansal çalışma alanı</span>
          <div className="topbar-actions">
            <span className="currency-badge">₺ TRY</span>
            <button
              className="icon-button"
              aria-label="Yenile"
              disabled={store.loading}
              onClick={() => void store.refresh()}
            >
              <RefreshCw size={17} className={store.loading ? "spin" : ""} />
            </button>
            <button
              className="icon-button mobile-logout"
              aria-label="Çıkış Yap"
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        {store.demo && (
          <div className="demo-banner">
            Geliştirme demosu · Gerçek finansal veri değildir
          </div>
        )}
        <main className="main-content" id="main-content">
          {store.loaded && store.loadError && (
            <div role="alert" className="panel">
              <p>{store.loadError}</p>
              <p className="small muted">Son yüklenen kayıtlar gösteriliyor.</p>
              <button
                className="button secondary"
                disabled={store.loading}
                onClick={() => void store.refresh()}
              >
                Yeniden dene
              </button>
            </div>
          )}
          {store.loading && !store.loaded ? (
            <div className="loading-content">
              <div className="skeleton heading-skeleton" />
              <div className="summary-grid">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton metric" />
                ))}
              </div>
              <div className="skeleton panel chart-frame" />
              <p className="muted">Kayıtlar yükleniyor…</p>
            </div>
          ) : store.loadError && !store.loaded ? (
            <section className="panel">
              <EmptyState
                title="Kayıtlar yüklenemedi"
                text={store.loadError}
                action={
                  <button
                    className="button primary"
                    onClick={() => void store.refresh()}
                  >
                    Yeniden dene
                  </button>
                }
              />
            </section>
          ) : !valid ||
            parts.length >
              (["araclar", "personel"].includes(section) ? 2 : 1) ? (
            <EmptyState
              title="Sayfa bulunamadı"
              action={
                <Link href="/" className="button primary">
                  Ana sayfaya dön
                </Link>
              }
            />
          ) : section === "islemler" ? (
            <Transactions actions={actions} />
          ) : section === "araclar" ? (
            <Vehicles actions={actions} id={parts[1]} />
          ) : section === "personel" ? (
            <Employees actions={actions} id={parts[1]} />
          ) : section === "raporlar" ? (
            <Reports />
          ) : section === "daha-fazla" ? (
            <More actions={actions} />
          ) : (
            <Dashboard actions={actions} />
          )}
        </main>
      </div>
      <button
        className="quick-add"
        onClick={() => actions.add()}
        aria-label="İşlem Ekle"
      >
        <Plus size={21} />
        <span>İşlem Ekle</span>
      </button>
      <nav className="bottom-nav" aria-label="Mobil menü">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={active(href) ? "active" : ""}
          >
            <Icon size={21} strokeWidth={1.7} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      {transactionModal && (
        <TransactionForm
          key={
            transactionModal.transaction
              ? `edit:${transactionModal.transaction.id}`
              : transactionModal.prefill?.template
                ? `copy:${transactionModal.prefill.template.id}`
                : "new"
          }
          onDuplicate={(transaction) =>
            setTransactionModal({
              prefill: { template: transaction, date: undefined },
            })
          }
          transaction={transactionModal.transaction}
          prefill={transactionModal.prefill}
          onClose={() => setTransactionModal(null)}
        />
      )}
      {entityModal && (
        <EntityForm modal={entityModal} onClose={() => setEntityModal(null)} />
      )}
      {store.toast && (
        <div className="toast" role="status">
          {store.toast}
          {store.lastDeleted && (
            <button
              className="text-button"
              onClick={() =>
                void store
                  .restore(store.lastDeleted)
                  .catch((e) => store.notify(errorMessage(e)))
              }
            >
              Geri al
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export function FinanceApp() {
  return <Shell />;
}
