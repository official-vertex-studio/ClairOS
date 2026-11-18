import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { APP_CATALOG, loadSettings, saveSettings } from "../settings";

function AdminApplications() {
  const [hidden, setHidden] = useState<string[]>(() => loadSettings().hiddenApps);

  function toggle(id: string) {
    const next = hidden.includes(id)
      ? hidden.filter((item) => item !== id)
      : [...hidden, id];
    setHidden(next);
    saveSettings({ ...loadSettings(), hiddenApps: next });
  }

  const visibleCount = APP_CATALOG.length - hidden.length;

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">BUREAU</span>
          <h1>Applications</h1>
          <p>Choisissez les applications visibles sur le bureau.</p>
        </div>
        <span className="ap-badge info">
          {visibleCount} sur {APP_CATALOG.length} affichées
        </span>
      </div>

      <div className="ap-card">
        <div className="ap-list">
          {APP_CATALOG.map((app) => {
            const isHidden = hidden.includes(app.id);
            return (
              <div className="ap-list-item" key={app.id}>
                <div className={`ap-item-icon ${isHidden ? "off" : ""}`}>
                  {isHidden ? <EyeOff size={20} /> : <Eye size={20} />}
                </div>
                <div className="ap-item-main">
                  <strong>{app.label}</strong>
                  <span>{app.description}</span>
                </div>
                <button
                  className={`ap-switch ${isHidden ? "" : "on"}`}
                  role="switch"
                  aria-checked={!isHidden}
                  aria-label={`${isHidden ? "Afficher" : "Masquer"} ${app.label}`}
                  onClick={() => toggle(app.id)}
                >
                  <span />
                </button>
              </div>
            );
          })}
        </div>
        <p className="ap-muted">
          Une application masquée n'est pas supprimée : vous pouvez la
          réafficher ici à tout moment.
        </p>
      </div>
    </>
  );
}

export default AdminApplications;
