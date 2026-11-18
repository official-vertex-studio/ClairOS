import { useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { KeyRound, Lock } from "lucide-react";

interface Props {
  token: string;
  onLock: () => void;
}

function AdminSecurity({ token, onLock }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (next.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (next !== confirm) {
      setError("Les deux nouveaux mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);
    try {
      await invoke("admin_change_password", {
        token,
        current,
        newPassword: next,
      });
      setMessage("Le mot de passe administrateur a été modifié.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">PROTECTION</span>
          <h1>Sécurité</h1>
          <p>Mot de passe de l'administration.</p>
        </div>
        <button className="admin-refresh" onClick={onLock}>
          <Lock size={17} />
          Verrouiller maintenant
        </button>
      </div>

      <form className="ap-card" onSubmit={submit}>
        <h2 className="ap-card-title">
          <KeyRound size={20} /> Changer le mot de passe
        </h2>

        <label className="ap-label" htmlFor="sec-current">Mot de passe actuel</label>
        <input
          id="sec-current"
          className="ap-input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          required
        />

        <label className="ap-label" htmlFor="sec-new">Nouveau mot de passe (8 caractères minimum)</label>
        <input
          id="sec-new"
          className="ap-input"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          minLength={8}
          required
        />

        <label className="ap-label" htmlFor="sec-confirm">Confirmer le nouveau mot de passe</label>
        <input
          id="sec-confirm"
          className="ap-input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          minLength={8}
          required
        />

        {error && <div className="ap-alert error">{error}</div>}
        {message && <div className="ap-alert ok">{message}</div>}

        <div className="ap-actions">
          <button className="ap-btn primary" type="submit" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>

      <div className="ap-card">
        <h2 className="ap-card-title">Verrouillage automatique</h2>
        <p className="ap-muted">
          L'administration se verrouille toute seule après 10 minutes sans
          activité, et chaque fois que vous la quittez : le mot de passe est
          alors redemandé à la prochaine ouverture.
        </p>
      </div>
    </>
  );
}

export default AdminSecurity;
