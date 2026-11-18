import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw,
  CheckCircle2,
  Download,
  AlertCircle,
  Info,
  RotateCw,
  ShieldCheck,
} from "lucide-react";

interface VersionInfo {
  app_version: string;
  os_version: string | null;
  update_source: string | null;
}

interface UpgradablePackage {
  name: string;
  from: string | null;
  to: string;
}

interface UpdateCheck {
  status: "not_configured" | "up_to_date" | "available";
  current: string;
  latest: string | null;
  packages: UpgradablePackage[];
  removals: string[];
  reboot_required: boolean;
}

interface UpgradeProgress {
  state: "idle" | "running" | "done" | "failed";
  reboot_required: boolean;
  message: string;
  log: string[];
}

interface Props {
  token: string;
}

const POLL_MS = 2000;
const MAX_LISTED_PACKAGES = 12;

function AdminUpdates({ token }: Props) {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const [progress, setProgress] = useState<UpgradeProgress | null>(null);
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

  const running = progress?.state === "running";

  const loadVersion = useCallback(() => {
    void invoke<VersionInfo>("get_version_info")
      .then(setVersion)
      .catch((err) => setError(String(err)));
  }, []);

  const check = useCallback(async () => {
    setChecking(true);
    setError("");
    try {
      const response = await invoke<UpdateCheck>("check_for_updates");
      setResult(response);
      setCheckedAt(new Date());
    } catch (err) {
      setResult(null);
      setError(String(err));
    } finally {
      setChecking(false);
    }
  }, []);

  const readProgress = useCallback(async () => {
    try {
      const value = await invoke<UpgradeProgress>("admin_os_upgrade_progress", { token });
      setProgress(value);
      return value;
    } catch (err) {
      setError(String(err));
      return null;
    }
  }, [token]);

  // À l'ouverture : version installée, et reprise d'une mise à jour déjà en cours.
  useEffect(() => {
    loadVersion();
    void readProgress();
  }, [loadVersion, readProgress]);

  // Suivi de l'avancement toutes les 2 secondes pendant une mise à jour.
  useEffect(() => {
    if (!running) return;

    const timer = window.setInterval(() => {
      void readProgress().then((value) => {
        if (value && value.state !== "running") {
          loadVersion();
          if (value.state === "done") void check();
        }
      });
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [running, readProgress, loadVersion, check]);

  // Le journal défile automatiquement vers le bas.
  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [progress?.log]);

  async function install() {
    setStarting(true);
    setConfirming(false);
    setError("");
    try {
      await invoke("admin_os_upgrade_start", { token });
      await readProgress();
    } catch (err) {
      setError(String(err));
    } finally {
      setStarting(false);
    }
  }

  async function reboot() {
    setRebooting(true);
    setError("");
    try {
      await invoke("system_power", { action: "reboot" });
    } catch (err) {
      setError(String(err));
      setRebooting(false);
    }
  }

  const rebootNeeded = Boolean(progress?.reboot_required || result?.reboot_required);
  const packages = result?.packages ?? [];

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">MAINTENANCE</span>
          <h1>Mises à jour</h1>
          <p>Gardez votre système ClairOS à jour, directement depuis Internet.</p>
        </div>
      </div>

      <div className="ap-card">
        <h2 className="ap-card-title">Version installée</h2>
        <div className="ap-facts">
          <div>
            <span>Application ClairOS</span>
            <strong>{version?.app_version ?? "…"}</strong>
          </div>
          <div>
            <span>Version du système</span>
            <strong>{version ? version.os_version ?? "Non renseignée" : "…"}</strong>
          </div>
          <div>
            <span>Serveur de mises à jour</span>
            <strong>{version ? version.update_source ?? "Non configuré" : "…"}</strong>
          </div>
        </div>

        <div className="ap-actions">
          <button
            className="ap-btn primary"
            onClick={() => void check()}
            disabled={checking || running}
          >
            <RefreshCw size={17} className={checking ? "ap-spin" : ""} />
            {checking ? "Vérification…" : "Vérifier les mises à jour"}
          </button>
          {checkedAt && (
            <span className="ap-muted">
              Dernière vérification à{" "}
              {checkedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="ap-alert error">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {result?.status === "not_configured" && (
        <div className="ap-alert info">
          <Info size={18} />
          <div>
            <strong>Les mises à jour du système ne sont pas disponibles ici.</strong>
            <p>
              Elles fonctionnent sur un ClairOS installé depuis l'image ISO (outil
              <code> /usr/lib/clairos/clairos-update</code>).
            </p>
          </div>
        </div>
      )}

      {result?.status === "up_to_date" && !running && progress?.state !== "done" && (
        <div className="ap-alert ok">
          <CheckCircle2 size={18} />
          <div>
            <strong>ClairOS est à jour.</strong>
            <p>Version {result.current}.</p>
          </div>
        </div>
      )}

      {result?.status === "available" && !running && (
        <div className="ap-card highlight">
          <div className="ap-row">
            <div>
              <h2 className="ap-card-title">
                <Download size={20} /> Des mises à jour sont disponibles
              </h2>
              <p className="ap-muted">
                {packages.length} élément{packages.length > 1 ? "s" : ""} à mettre à jour
                {result.latest ? (
                  <>
                    {" "}
                    · ClairOS {result.current} → <strong>{result.latest}</strong>
                  </>
                ) : null}
              </p>
            </div>

            {!confirming ? (
              <button
                className="ap-btn primary"
                onClick={() => setConfirming(true)}
                disabled={starting}
              >
                <Download size={17} />
                Installer
              </button>
            ) : (
              <div className="ap-actions">
                <button className="ap-btn primary" onClick={() => void install()} disabled={starting}>
                  Oui, installer maintenant
                </button>
                <button className="ap-btn" onClick={() => setConfirming(false)}>
                  Annuler
                </button>
              </div>
            )}
          </div>

          <ul className="ap-package-list">
            {packages.slice(0, MAX_LISTED_PACKAGES).map((item) => (
              <li key={item.name}>
                <strong>{item.name}</strong>
                <span>
                  {item.from ? `${item.from} → ` : "nouveau : "}
                  {item.to}
                </span>
              </li>
            ))}
          </ul>
          {packages.length > MAX_LISTED_PACKAGES && (
            <p className="ap-muted">
              … et {packages.length - MAX_LISTED_PACKAGES} autre
              {packages.length - MAX_LISTED_PACKAGES > 1 ? "s" : ""}.
            </p>
          )}
          {result.removals.length > 0 && (
            <p className="ap-muted">
              Certains éléments obsolètes seront retirés : {result.removals.slice(0, 8).join(", ")}
              {result.removals.length > 8 ? "…" : ""}.
            </p>
          )}
          <p className="ap-muted">
            Ne coupez pas l'ordinateur pendant l'installation. Elle peut durer plusieurs minutes.
          </p>
        </div>
      )}

      {(running || progress?.state === "done" || progress?.state === "failed") && (
        <div className={`ap-card ${running ? "highlight" : ""}`}>
          <h2 className="ap-card-title">
            {running && (
              <>
                <RefreshCw size={20} className="ap-spin" /> Installation en cours…
              </>
            )}
            {progress?.state === "done" && (
              <>
                <CheckCircle2 size={20} /> Mise à jour terminée
              </>
            )}
            {progress?.state === "failed" && (
              <>
                <AlertCircle size={20} /> La mise à jour n'a pas abouti
              </>
            )}
          </h2>
          {progress?.message && <p className="ap-muted">{progress.message}</p>}
          {progress && progress.log.length > 0 && (
            <pre className="ap-code ap-log" ref={logRef}>
              {progress.log.join("\n")}
            </pre>
          )}
        </div>
      )}

      {rebootNeeded && !running && (
        <div className="ap-card highlight">
          <div className="ap-row">
            <div>
              <h2 className="ap-card-title">
                <RotateCw size={20} /> Redémarrage nécessaire
              </h2>
              <p className="ap-muted">
                Pour terminer la mise à jour (nouveau noyau Linux ou composants système),
                redémarrez l'ordinateur.
              </p>
            </div>
            <button className="ap-btn primary" onClick={() => void reboot()} disabled={rebooting}>
              <RotateCw size={17} />
              {rebooting ? "Redémarrage…" : "Redémarrer maintenant"}
            </button>
          </div>
        </div>
      )}

      <div className="ap-card">
        <h2 className="ap-card-title">
          <ShieldCheck size={20} /> Mises à jour automatiques
        </h2>
        <p className="ap-muted">
          Chaque jour, ClairOS vérifie en arrière-plan s'il existe des correctifs de sécurité et
          les installe tout seul, comme le fait Ubuntu. Cette page sert à installer sans attendre
          les nouvelles versions de ClairOS et à voir ce qui est disponible.
        </p>
      </div>
    </>
  );
}

export default AdminUpdates;
