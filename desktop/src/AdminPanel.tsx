import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  ArrowLeft,
  LayoutDashboard,
  Wifi,
  Palette,
  Package,
  RefreshCw,
  Power,
  Monitor,
  Cpu,
  HardDrive,
  Activity,
  Clock,
  ShieldCheck,
  ChevronRight,
  LockKeyhole,
  Images,
  KeyRound,
  TerminalSquare,
} from "lucide-react";

import AdminNetwork from "./admin/AdminNetwork";
import AdminGallery from "./admin/AdminGallery";
import AdminAppearance from "./admin/AdminAppearance";
import AdminApplications from "./admin/AdminApplications";
import AdminUpdates from "./admin/AdminUpdates";
import AdminPower from "./admin/AdminPower";
import AdminSecurity from "./admin/AdminSecurity";

// Chargé à la demande : xterm.js n'est utile que dans cette page.
const AdminTerminal = lazy(() => import("./admin/AdminTerminal"));

import "./AdminPanel.css";
import "./AdminPages.css";

interface SystemInfo {
  name: string;
  os: string;
  kernel: string;
  memory_total_mb: number;
  memory_used_mb: number;
  uptime_seconds: number;
  uptime: string;
}

interface VersionInfo {
  app_version: string;
  os_version: string | null;
  update_source: string | null;
}

type AdminPage =
  | "overview"
  | "network"
  | "gallery"
  | "appearance"
  | "applications"
  | "updates"
  | "security"
  | "terminal"
  | "power";

// Verrouillage automatique après 10 minutes sans activité.
const IDLE_LOCK_MS = 10 * 60 * 1000;

interface Props {
  onClose: () => void;
}

const menu = [
  { id: "overview", label: "Vue d'ensemble", icon: LayoutDashboard },
  { id: "network", label: "Réseau", icon: Wifi },
  { id: "gallery", label: "Galerie", icon: Images },
  { id: "appearance", label: "Personnalisation", icon: Palette },
  { id: "applications", label: "Applications", icon: Package },
  { id: "updates", label: "Mises à jour", icon: RefreshCw },
  { id: "security", label: "Sécurité", icon: KeyRound },
  { id: "terminal", label: "Terminal (CMD)", icon: TerminalSquare },
  { id: "power", label: "Alimentation", icon: Power },
] as const;

function AdminPanel({ onClose }: Props) {
  const [page, setPage] = useState<AdminPage>("overview");
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState<"checking" | "setup" | "login" | "open">("checking");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [token, setToken] = useState("");
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const tokenRef = useRef("");

  const lock = useCallback(() => {
    void invoke("admin_logout").catch(() => undefined);
    tokenRef.current = "";
    setToken("");
    setPassword("");
    setPasswordConfirm("");
    setAuthError("");
    setPage("overview");
    setAuthMode("login");
  }, []);

  // À la fermeture du panneau, la session est toujours terminée :
  // le mot de passe est redemandé à chaque ouverture.
  useEffect(() => {
    return () => {
      if (tokenRef.current) {
        void invoke("admin_logout").catch(() => undefined);
      }
    };
  }, []);

  // Verrouillage automatique en cas d'inactivité.
  useEffect(() => {
    if (authMode !== "open") return;

    let timer = window.setTimeout(lock, IDLE_LOCK_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, IDLE_LOCK_MS);
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"] as const;
    events.forEach((name) => window.addEventListener(name, reset));

    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [authMode, lock]);

  const loadSystem = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await invoke<SystemInfo>("get_system_info");
      setSystem(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void invoke<boolean>("is_admin_password_configured")
      .then((configured) => {
        if (active) setAuthMode(configured ? "login" : "setup");
      })
      .catch((err) => {
        if (active) {
          setAuthError(String(err));
          setAuthMode("setup");
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (authMode === "open") {
      void loadSystem();
      void invoke<VersionInfo>("get_version_info")
        .then(setVersion)
        .catch(() => undefined);
    }
  }, [authMode, loadSystem]);

  async function submitAuthentication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");

    if (password.length < 8) {
      setAuthError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (authMode === "setup" && password !== passwordConfirm) {
      setAuthError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setAuthBusy(true);
    try {
      const newToken =
        authMode === "setup"
          ? await invoke<string>("setup_admin_password", { password })
          : await invoke<string>("admin_login", { password });

      tokenRef.current = newToken;
      setToken(newToken);
      setAuthMode("open");
      setPassword("");
      setPasswordConfirm("");
    } catch (err) {
      setAuthError(String(err));
      setPassword("");
    } finally {
      setAuthBusy(false);
    }
  }

  if (authMode !== "open") {
    return (
      <main className="admin-auth-screen">
        <form className="admin-auth-card" onSubmit={submitAuthentication}>
          <div className="admin-auth-icon"><LockKeyhole size={34} /></div>
          <span className="admin-eyebrow">CLAIROS / ADMINISTRATION</span>
          <h1>
            {authMode === "checking" ? "Vérification…" :
              authMode === "setup" ? "Créer le mot de passe administrateur" :
              "Administration protégée"}
          </h1>
          <p>
            {authMode === "setup"
              ? "Choisissez un mot de passe pour protéger les réglages de ClairOS. Il sera conservé sous forme chiffrée (hachage Argon2id)."
              : "Saisissez le mot de passe administrateur pour continuer."}
          </p>
          {authMode !== "checking" && (
            <>
              <label htmlFor="admin-password">Mot de passe</label>
              <input
                id="admin-password"
                type="password"
                autoComplete={authMode === "setup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
                autoFocus
              />
              {authMode === "setup" && (
                <>
                  <label htmlFor="admin-password-confirm">Confirmer le mot de passe</label>
                  <input
                    id="admin-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    minLength={8}
                    required
                  />
                </>
              )}
              {authError && <div className="admin-auth-error">{authError}</div>}
              <button className="admin-auth-submit" type="submit" disabled={authBusy}>
                {authBusy ? "Veuillez patienter…" :
                  authMode === "setup" ? "Créer et ouvrir l'administration" : "Déverrouiller"}
              </button>
            </>
          )}
          <button className="admin-auth-back" type="button" onClick={onClose}>
            <ArrowLeft size={18} /> Retour au bureau
          </button>
        </form>
      </main>
    );
  }

  const memoryPercent = system?.memory_total_mb
    ? Math.min(
        100,
        (system.memory_used_mb / system.memory_total_mb) * 100
      )
    : 0;

  function formatMemory(value: number) {
    return `${(value / 1024).toFixed(1)} Go`;
  }

  function formatUptime(seconds: number) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return `${days} jours, ${hours} heures et ${minutes} minutes`;
  }

  function renderContent() {
    switch (page) {
      case "overview":
        return (
          <>
            <div className="admin-page-heading">
              <div>
                <span className="admin-eyebrow">CLAIROS / SYSTÈME</span>
                <h1>Vue d'ensemble</h1>
                <p>Bienvenue dans l'administration de ClairOS.</p>
              </div>

              <button
                className="admin-refresh"
                onClick={() => void loadSystem()}
                disabled={loading}
              >
                <RefreshCw size={17} />
                Actualiser
              </button>
            </div>

            {error && (
              <div className="admin-error">
                Impossible de récupérer les informations : {error}
              </div>
            )}

            <div className="admin-welcome-card">
              <div className="admin-welcome-icon">
                <ShieldCheck size={34} />
              </div>

              <div>
                <span>VOTRE SYSTÈME</span>
                <h2>ClairOS by Gab9SG</h2>
                <p>La technologie, simplement.</p>
              </div>

              <div className="admin-version">
                <span>Version actuelle</span>
                <strong>{version?.os_version ?? version?.app_version ?? "…"}</strong>
              </div>
            </div>

            <h2 className="admin-section-title">
              État de votre ordinateur
            </h2>

            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <div className="admin-stat-icon blue">
                  <Monitor size={23} />
                </div>
                <span>Système</span>
                <strong>
                  {system?.os || (loading ? "Chargement..." : "Inconnu")}
                </strong>
                <small>Distribution Linux</small>
              </div>

              <div className="admin-stat-card">
                <div className="admin-stat-icon purple">
                  <Cpu size={23} />
                </div>
                <span>Mémoire utilisée</span>
                <strong>
                  {system
                    ? formatMemory(system.memory_used_mb)
                    : "--"}
                </strong>
                <small>
                  Sur {system
                    ? formatMemory(system.memory_total_mb)
                    : "--"}
                </small>
              </div>

              <div className="admin-stat-card">
                <div className="admin-stat-icon green">
                  <Activity size={23} />
                </div>
                <span>Noyau Linux</span>
                <strong className="admin-kernel">
                  {system?.kernel || "--"}
                </strong>
                <small>Version du noyau</small>
              </div>

              <div className="admin-stat-card">
                <div className="admin-stat-icon orange">
                  <Clock size={23} />
                </div>
                <span>Temps de fonctionnement</span>
                <strong>
                  {system
                    ? formatUptime(system.uptime_seconds)
                    : "--"}
                </strong>
                <small>Depuis le démarrage</small>
              </div>
            </div>

            <div className="admin-memory-card">
              <div className="admin-memory-heading">
                <div>
                  <HardDrive size={21} />
                  <strong>Utilisation de la mémoire vive</strong>
                </div>

                <span>{memoryPercent.toFixed(0)} %</span>
              </div>

              <div className="admin-progress">
                <div
                  style={{ width: `${memoryPercent}%` }}
                />
              </div>

              <div className="admin-memory-labels">
                <span>
                  Utilisée : {system
                    ? formatMemory(system.memory_used_mb)
                    : "--"}
                </span>

                <span>
                  Total : {system
                    ? formatMemory(system.memory_total_mb)
                    : "--"}
                </span>
              </div>
            </div>
          </>
        );

      case "network":
        return <AdminNetwork token={token} />;

      case "gallery":
        return <AdminGallery token={token} />;

      case "appearance":
        return <AdminAppearance />;

      case "applications":
        return <AdminApplications />;

      case "updates":
        return <AdminUpdates token={token} />;

      case "security":
        return <AdminSecurity token={token} onLock={lock} />;

      case "terminal":
        return (
          <Suspense fallback={<p className="ap-muted">Chargement du terminal…</p>}>
            <AdminTerminal token={token} />
          </Suspense>
        );

      case "power":
        return <AdminPower token={token} />;
    }
  }

  return (
    <main className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <div className="admin-brand-logo">C</div>

          <div>
            <strong>ClairOS</strong>
            <span>Administration</span>
          </div>
        </div>

        <div className="admin-sidebar-label">
          PARAMÈTRES DU SYSTÈME
        </div>

        <nav className="admin-navigation">
          {menu.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                className={
                  page === item.id
                    ? "admin-nav-item active"
                    : "admin-nav-item"
                }
                onClick={() => setPage(item.id)}
              >
                <Icon size={20} />
                <span>{item.label}</span>
                <ChevronRight size={16} />
              </button>
            );
          })}
        </nav>

        <div className="admin-sidebar-bottom">
          <div className="admin-sidebar-status">
            <span />
            ClairOS
          </div>

          <button
            className="admin-back-button"
            onClick={onClose}
          >
            <ArrowLeft size={19} />
            Retour au bureau
          </button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <span>ClairOS</span>
            <ChevronRight size={15} />
            <strong>Administration</strong>
          </div>

          <button
            className="admin-close"
            onClick={onClose}
            aria-label="Retour au bureau"
          >
            <ArrowLeft size={19} />
            Quitter
          </button>
        </header>

        <div className="admin-content">
          {renderContent()}
        </div>

        <footer className="admin-footer">
          ClairOS by Gab9SG
          <span>La technologie, simplement.</span>
        </footer>
      </section>
    </main>
  );
}

export default AdminPanel;
