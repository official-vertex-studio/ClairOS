import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import {
  DEFAULT_SETTINGS,
  WALLPAPERS,
  ZOOM_LEVELS,
  loadSettings,
  saveSettings,
  type ClairSettings,
} from "../settings";

function AdminAppearance() {
  const [settings, setSettings] = useState<ClairSettings>(() => loadSettings());

  function update(changes: Partial<ClairSettings>) {
    const next = { ...settings, ...changes };
    setSettings(next);
    saveSettings(next);
  }

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">AFFICHAGE</span>
          <h1>Personnalisation</h1>
          <p>Les changements s'appliquent immédiatement.</p>
        </div>
        <button
          className="admin-refresh"
          onClick={() =>
            update({
              zoom: DEFAULT_SETTINGS.zoom,
              wallpaper: DEFAULT_SETTINGS.wallpaper,
              userName: DEFAULT_SETTINGS.userName,
            })
          }
        >
          <RotateCcw size={17} />
          Réinitialiser
        </button>
      </div>

      <div className="ap-card">
        <h2 className="ap-card-title">Prénom affiché sur le bureau</h2>
        <p className="ap-muted">Le bureau dira « Bonjour {settings.userName || "…"} ! ».</p>
        <input
          className="ap-input"
          type="text"
          maxLength={30}
          placeholder="Par exemple : Maria"
          value={settings.userName}
          onChange={(event) => update({ userName: event.target.value })}
        />
      </div>

      <div className="ap-card">
        <h2 className="ap-card-title">Taille de l'affichage</h2>
        <p className="ap-muted">Agrandit les textes et les boutons dans toute l'application.</p>
        <div className="ap-choice-row">
          {ZOOM_LEVELS.map((level) => (
            <button
              key={level.value}
              className={`ap-choice ${settings.zoom === level.value ? "active" : ""}`}
              onClick={() => update({ zoom: level.value })}
            >
              <strong>{level.label}</strong>
              <span>{level.value} %</span>
              {settings.zoom === level.value && <Check size={16} />}
            </button>
          ))}
        </div>
      </div>

      <div className="ap-card">
        <h2 className="ap-card-title">Fond d'écran</h2>
        <div className="ap-choice-row">
          {WALLPAPERS.map((item) => (
            <button
              key={item.id}
              className={`ap-choice wallpaper ${settings.wallpaper === item.id ? "active" : ""}`}
              onClick={() => update({ wallpaper: item.id })}
            >
              <div className="ap-swatch" style={{ background: item.preview }} />
              <strong>{item.label}</strong>
              {settings.wallpaper === item.id && <Check size={16} />}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export default AdminAppearance;
