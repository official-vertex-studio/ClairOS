import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Command } from "@tauri-apps/plugin-shell";

import WeatherPanel from "./WeatherPanel";
import Cuisine from "./Cuisine";
import Galerie from "./Galerie";
import Actualites from "./Actualites";
import AdminPanel from "./AdminPanel";
import { loadSettings } from "./settings";

import {
  Newspaper,
  CloudSun,
  Utensils,
  Globe,
  Lock,
  CalendarDays,
  Clock,
  Sun,
  Power,
  ChevronRight,
  Heart,
  X,
  ShieldCheck,
  Monitor,
  Cpu,
  HardDrive,
  Activity,
  RefreshCw,
  Info,
  Images,
  RotateCw,
} from "lucide-react";

import "./index.css";

// ============================================================
// TYPES
// ============================================================

interface SystemInfo {
  name: string;
  os: string;
  kernel: string;
  memory_total_mb: number;
  memory_used_mb: number;
  uptime_seconds: number;
  uptime: string;
}

// ============================================================
// APPLICATION PRINCIPALE
// ============================================================

function App() {
  const [time, setTime] = useState(new Date());

  const [activeApp, setActiveApp] = useState<string | null>(null);

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [systemError, setSystemError] = useState("");
  const [loadingSystem, setLoadingSystem] = useState(false);

  const [powerBusy, setPowerBusy] = useState(false);
  const [powerError, setPowerError] = useState("");
  const [powerMessage, setPowerMessage] = useState("");

  // Relu à chaque affichage : les changements faits dans l'administration
  // sont pris en compte dès le retour au bureau.
  const settings = loadSettings();

  async function powerAction(action: "poweroff" | "reboot") {
    setPowerBusy(true);
    setPowerError("");
    setPowerMessage("");

    try {
      await invoke("system_power", { action });
      setPowerMessage(
        action === "poweroff"
          ? "L'ordinateur va s'éteindre…"
          : "L'ordinateur va redémarrer…"
      );
    } catch (error) {
      setPowerError(String(error));
    } finally {
      setPowerBusy(false);
    }
  }

  // ============================================================
  // HORLOGE
  // ============================================================

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // ============================================================
  // INFORMATIONS SYSTÈME LINUX
  // ============================================================

  async function loadSystemInfo() {
    setLoadingSystem(true);
    setSystemError("");

    try {
      const result = await invoke<SystemInfo>("get_system_info");
      setSystemInfo(result);
    } catch (error) {
      console.error("Erreur système :", error);
      setSystemError(String(error));
    } finally {
      setLoadingSystem(false);
    }
  }

  useEffect(() => {
    void loadSystemInfo();
  }, []);

  // ============================================================
  // OUVERTURE DE FIREFOX
  // ============================================================

  async function openInternet() {
    try {
      const command = Command.create("firefox", ["--new-window"]);
      await command.execute();
    } catch (error) {
      console.error("Impossible de lancer Firefox :", error);

      alert(
        "Impossible d'ouvrir Internet. Vérifiez que Firefox est installé."
      );
    }
  }

  // ============================================================
  // APPLICATIONS DU BUREAU
  // ============================================================

  const allApplications = [
    {
      name: "Cuisine",
      description: "Découvrez de délicieuses recettes",
      icon: Utensils,
      color: "orange",
      action: () => setActiveApp("Cuisine"),
    },
    {
      name: "Météo",
      description: "La météo en un coup d'œil",
      icon: CloudSun,
      color: "blue",
      action: () => setActiveApp("Météo"),
    },
    {
      name: "Galerie",
      description: "Retrouvez toutes vos photos",
      icon: Images,
      color: "purple",
      action: () => setActiveApp("Galerie"),
    },
    {
      name: "Internet",
      description: "Naviguez simplement sur Internet",
      icon: Globe,
      color: "green",
      action: () => void openInternet(),
    },
    {
      name: "Actualités France",
      description: "Les dernières nouvelles françaises",
      icon: Newspaper,
      color: "blue",
      action: () => setActiveApp("Actualités France"),
    },
    {
      name: "Notícias Portugal",
      description: "As últimas notícias portuguesas",
      icon: Newspaper,
      color: "red",
      action: () => setActiveApp("Notícias Portugal"),
    },
  ];

  const applications = allApplications.filter(
    (app) => !settings.hiddenApps.includes(app.name)
  );

  // ============================================================
  // DATE
  // ============================================================

  const date = time.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // ============================================================
  // HEURE
  // ============================================================

  const formattedTime = time.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // ============================================================
  // CONVERSION MÉMOIRE
  // ============================================================

  function formatMemory(mb: number) {
    return `${(mb / 1024).toFixed(1)} Go`;
  }

  // ============================================================
  // TEMPS DE FONCTIONNEMENT
  // ============================================================

  function formatUptime(seconds: number) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return `${days} j ${hours} h ${minutes} min`;
  }

  // ============================================================
  // PANEL ADMINISTRATION
  // ============================================================

  if (activeApp === "Administration") {
    return (
      <AdminPanel
        onClose={() => setActiveApp(null)}
      />
    );
  }

  // ============================================================
  // APPLICATIONS INDÉPENDANTES
  // ============================================================

  if (activeApp === "Cuisine") {
    return (
      <Cuisine
        onClose={() => setActiveApp(null)}
      />
    );
  }

  if (activeApp === "Météo") {
    return (
      <WeatherPanel
        onClose={() => setActiveApp(null)}
      />
    );
  }

  if (activeApp === "Galerie") {
    return (
      <Galerie
        onClose={() => setActiveApp(null)}
      />
    );
  }

  // ============================================================
  // ACTUALITÉS FRANCE
  // ============================================================

  if (activeApp === "Actualités France") {
    return (
      <Actualites
        country="fr"
        onClose={() => setActiveApp(null)}
      />
    );
  }

  // ============================================================
  // ACTUALITÉS PORTUGAL
  // ============================================================

  if (activeApp === "Notícias Portugal") {
    return (
      <Actualites
        country="pt"
        onClose={() => setActiveApp(null)}
      />
    );
  }

  // ============================================================
  // BUREAU CLAIROS
  // ============================================================

  return (
    <main className="desktop">

      {/* ================================================== */}
      {/* BARRE SUPÉRIEURE */}
      {/* ================================================== */}

      <header className="topbar">

        <div className="brand">

          <div className="brand-logo">
            C
          </div>

          <div>
            <strong>ClairOS</strong>
            <span>by Gab9SG</span>
          </div>

        </div>

        <div className="top-date">

          <CalendarDays size={17} />

          <span>{date}</span>

          <span className="separator">•</span>

          <Clock size={17} />

          <strong>{formattedTime}</strong>

        </div>

        <button
          className="admin-button"
          onClick={() => setActiveApp("Administration")}
        >
          <Lock size={17} />
          Administration
        </button>

      </header>

      {/* ================================================== */}
      {/* ACCUEIL */}
      {/* ================================================== */}

      <section className="welcome">

        <div>

          <div className="eyebrow">
            VOTRE ESPACE PERSONNEL
          </div>

          <h1>
            Bonjour{settings.userName ? ` ${settings.userName}` : ""} ! <Sun className="hello-sun" size="0.85em" strokeWidth={2.2} aria-hidden="true" />
          </h1>

          <p>
            Bienvenue sur votre ordinateur.
          </p>

        </div>

        {!settings.hiddenApps.includes("Météo") && (
        <div
          className="weather-card"
          role="button"
          tabIndex={0}
          onClick={() => setActiveApp("Météo")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setActiveApp("Météo");
            }
          }}
        >

          <Sun size={42} />

          <div>
            <strong>Météo</strong>
            <span>Découvrez la météo du jour</span>
          </div>

          <ChevronRight size={20} />

        </div>
        )}

      </section>

      {/* ================================================== */}
      {/* APPLICATIONS */}
      {/* ================================================== */}

      <section className="apps-section">

        <div className="section-heading">

          <div>

            <h2>Mes applications</h2>

            <p>
              Que souhaitez-vous faire aujourd'hui ?
            </p>

          </div>

          <span className="app-count">
            {applications.length} applications
          </span>

        </div>

        <div className="apps-grid">

          {applications.map((app) => {

            const Icon = app.icon;

            return (

              <button
                className={`app-card ${app.color}`}
                key={app.name}
                onClick={app.action}
              >

                <div className="app-icon">
                  <Icon size={38} strokeWidth={1.8} />
                </div>

                <div className="app-info">

                  <h3>{app.name}</h3>

                  <p>{app.description}</p>

                </div>

                <div className="app-arrow">
                  <ChevronRight size={22} />
                </div>

              </button>

            );

          })}

        </div>

      </section>

      {/* ================================================== */}
      {/* BAS DU BUREAU */}
      {/* ================================================== */}

      <section className="bottom-section">

        <div className="help-card">

          <div className="help-icon">
            <Heart size={26} />
          </div>

          <div>

            <strong>
              ClairOS, tout simplement.
            </strong>

            <p>
              Un ordinateur pensé pour vous simplifier la vie.
            </p>

          </div>

        </div>

        <button
          className="system-card"
          onClick={() => {
            void loadSystemInfo();
            setActiveApp("Informations système");
          }}
          title="Voir les informations système"
        >

          <ShieldCheck size={22} />

          <span>Système protégé</span>

          <Info size={17} />

        </button>

      </section>

      {/* ================================================== */}
      {/* PIED DE PAGE */}
      {/* ================================================== */}

      <footer>

        <span>ClairOS by Gab9SG</span>

        <span>La technologie, simplement.</span>

        <button
          title="Éteindre"
          onClick={() => setActiveApp("Éteindre")}
        >
          <Power size={19} />
        </button>

      </footer>

      {/* ================================================== */}
      {/* FENÊTRES DES APPLICATIONS */}
      {/* ================================================== */}

      {activeApp && (

        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setActiveApp(null);
            }
          }}
        >

          <div className="app-modal">

            <button
              className="close-button"
              onClick={() => setActiveApp(null)}
              aria-label="Fermer"
            >
              <X size={22} />
            </button>

            {/* ========================================== */}
            {/* INFORMATIONS SYSTÈME */}
            {/* ========================================== */}

            {activeApp === "Informations système" ? (

              <>

                <div className="modal-logo">
                  <Monitor size={36} />
                </div>

                <h2>Informations système</h2>

                {loadingSystem && (
                  <p>
                    Chargement des informations...
                  </p>
                )}

                {systemError && (
                  <p role="alert">
                    Impossible de récupérer les informations :
                    {systemError}
                  </p>
                )}

                {systemInfo && (

                  <div className="system-details">

                    <p>
                      <Monitor size={17} />
                      Système : {systemInfo.name}
                    </p>

                    <p>
                      <Monitor size={17} />
                      Distribution : {systemInfo.os}
                    </p>

                    <p>
                      <Cpu size={17} />
                      Noyau Linux : {systemInfo.kernel}
                    </p>

                    <p>
                      <HardDrive size={17} />
                      RAM totale : {formatMemory(systemInfo.memory_total_mb)}
                    </p>

                    <p>
                      <Activity size={17} />
                      RAM utilisée : {formatMemory(systemInfo.memory_used_mb)}
                    </p>

                    <p>
                      <Clock size={17} />
                      Démarré depuis : {formatUptime(systemInfo.uptime_seconds)}
                    </p>

                  </div>

                )}

                <button
                  className="primary-button"
                  onClick={() => void loadSystemInfo()}
                  disabled={loadingSystem}
                >
                  <RefreshCw size={17} />
                  Actualiser
                </button>

              </>

            ) : (

              /* ========================================== */
              /* AUTRES FENÊTRES */
              /* ========================================== */

              <>

                <div className="modal-logo">

                  <Power size={36} />

                </div>

                <h2>Éteindre l'ordinateur</h2>

                <p>Que souhaitez-vous faire ?</p>

                {powerError && <p role="alert">{powerError}</p>}

                {powerMessage && <p>{powerMessage}</p>}

                <button
                  className="primary-button"
                  onClick={() => void powerAction("poweroff")}
                  disabled={powerBusy}
                >
                  <Power size={17} />
                  Éteindre
                </button>

                <button
                  className="primary-button"
                  onClick={() => void powerAction("reboot")}
                  disabled={powerBusy}
                >
                  <RotateCw size={17} />
                  Redémarrer
                </button>

                <button
                  className="primary-button"
                  onClick={() => {
                    setPowerError("");
                    setPowerMessage("");
                    setActiveApp(null);
                  }}
                  disabled={powerBusy}
                >
                  Annuler
                </button>

              </>

            )}

          </div>

        </div>

      )}

    </main>
  );
}

export default App;
