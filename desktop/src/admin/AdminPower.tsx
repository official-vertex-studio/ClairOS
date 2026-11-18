import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Power, RotateCw, LogOut } from "lucide-react";

interface Props {
  token: string;
}

type Action = "poweroff" | "reboot" | "quit";

const TEXTS: Record<Action, { question: string; confirm: string }> = {
  poweroff: { question: "Éteindre l'ordinateur maintenant ?", confirm: "Oui, éteindre" },
  reboot: { question: "Redémarrer l'ordinateur maintenant ?", confirm: "Oui, redémarrer" },
  quit: { question: "Fermer l'application ClairOS ?", confirm: "Oui, fermer" },
};

function AdminPower({ token }: Props) {
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function run(action: Action) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (action === "quit") {
        await invoke("admin_quit_app", { token });
      } else {
        await invoke("system_power", { action });
        setMessage(
          action === "poweroff"
            ? "Arrêt de l'ordinateur en cours…"
            : "Redémarrage de l'ordinateur en cours…"
        );
      }
      setPendingAction(null);
    } catch (err) {
      setError(String(err));
      setPendingAction(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">ORDINATEUR</span>
          <h1>Alimentation</h1>
          <p>Éteignez ou redémarrez l'ordinateur.</p>
        </div>
      </div>

      {error && <div className="ap-alert error">{error}</div>}
      {message && <div className="ap-alert ok">{message}</div>}

      {pendingAction && (
        <div className="ap-card highlight">
          <h2 className="ap-card-title">{TEXTS[pendingAction].question}</h2>
          <div className="ap-actions">
            <button
              className="ap-btn danger"
              onClick={() => void run(pendingAction)}
              disabled={busy}
            >
              {TEXTS[pendingAction].confirm}
            </button>
            <button className="ap-btn" onClick={() => setPendingAction(null)} disabled={busy}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="ap-power-grid">
        <button className="ap-power-card" onClick={() => setPendingAction("reboot")} disabled={busy}>
          <RotateCw size={34} />
          <strong>Redémarrer</strong>
          <span>Relance l'ordinateur, par exemple après une mise à jour.</span>
        </button>

        <button className="ap-power-card danger" onClick={() => setPendingAction("poweroff")} disabled={busy}>
          <Power size={34} />
          <strong>Éteindre</strong>
          <span>Arrête complètement l'ordinateur.</span>
        </button>

        <button className="ap-power-card" onClick={() => setPendingAction("quit")} disabled={busy}>
          <LogOut size={34} />
          <strong>Fermer ClairOS</strong>
          <span>Ferme l'application (utile pour les tests et le dépannage).</span>
        </button>
      </div>
    </>
  );
}

export default AdminPower;
