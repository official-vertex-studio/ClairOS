import { useCallback, useEffect, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Wifi, WifiOff, Lock, RefreshCw, Network, Check } from "lucide-react";

interface NetDevice {
  name: string;
  kind: string;
  state: string;
  connection: string;
  ip: string;
}

interface NetworkStatus {
  available: boolean;
  connectivity: string;
  wifi_enabled: boolean;
  devices: NetDevice[];
}

interface WifiNetwork {
  ssid: string;
  signal: number;
  security: string;
  in_use: boolean;
}

interface Props {
  token: string;
}

function connectivityLabel(value: string) {
  switch (value) {
    case "full":
      return { text: "Connecté à Internet", tone: "ok" };
    case "limited":
      return { text: "Connexion limitée (pas d'accès à Internet)", tone: "warn" };
    case "portal":
      return { text: "Connexion à valider (portail Wi-Fi)", tone: "warn" };
    case "none":
      return { text: "Non connecté", tone: "error" };
    default:
      return { text: "État inconnu", tone: "info" };
  }
}

function isOpen(security: string) {
  return security.trim() === "" || security.trim() === "--";
}

function AdminNetwork({ token }: Props) {
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  const scan = useCallback(
    async (rescan: boolean) => {
      setScanning(true);
      try {
        const result = await invoke<WifiNetwork[]>("admin_wifi_scan", {
          token,
          rescan,
        });
        setNetworks(result);
      } catch (err) {
        setError(String(err));
      } finally {
        setScanning(false);
      }
    },
    [token]
  );

  const refresh = useCallback(async () => {
    try {
      const result = await invoke<NetworkStatus>("admin_network_status", {
        token,
      });
      setError("");
      setStatus(result);
      if (result.available && result.wifi_enabled) {
        void scan(false);
      } else {
        setNetworks([]);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [token, scan]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function connect(network: WifiNetwork, event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await invoke("admin_wifi_connect", {
        token,
        ssid: network.ssid,
        password: isOpen(network.security) ? null : password,
      });
      setMessage(`Connecté à « ${network.ssid} ».`);
      setSelected(null);
      setPassword("");
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await invoke("admin_wifi_disconnect", { token });
      setMessage("Wi-Fi déconnecté.");
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleWifi(enabled: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await invoke("admin_wifi_set_enabled", { token, enabled });
      // Le Wi-Fi met quelques instants à s'allumer avant de lister les réseaux.
      await new Promise((resolve) => setTimeout(resolve, enabled ? 2500 : 300));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const label = status ? connectivityLabel(status.connectivity) : null;

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">CONNEXION</span>
          <h1>Réseau</h1>
          <p>Wi-Fi, câble Ethernet et état d'Internet.</p>
        </div>
        <button
          className="admin-refresh"
          onClick={() => {
            setLoading(true);
            void refresh();
          }}
          disabled={loading || busy}
        >
          <RefreshCw size={17} />
          Actualiser
        </button>
      </div>

      {error && <div className="ap-alert error">{error}</div>}
      {message && <div className="ap-alert ok">{message}</div>}

      {loading && !status && <div className="ap-card ap-muted">Chargement…</div>}

      {status && !status.available && (
        <div className="ap-card">
          <h2 className="ap-card-title">Gestion du réseau indisponible</h2>
          <p className="ap-muted">
            NetworkManager (nmcli) n'est pas installé sur ce système. Dans
            l'image ClairOS il sera présent ; sur un ordinateur de test,
            installez le paquet « network-manager ».
          </p>
        </div>
      )}

      {status?.available && label && (
        <>
          <div className="ap-card">
            <div className="ap-row">
              <div>
                <h2 className="ap-card-title">État de la connexion</h2>
                <span className={`ap-badge ${label.tone}`}>{label.text}</span>
              </div>
            </div>

            <div className="ap-list">
              {status.devices.length === 0 && (
                <p className="ap-muted">Aucune carte réseau détectée.</p>
              )}
              {status.devices.map((device) => (
                <div className="ap-list-item" key={device.name}>
                  <div className="ap-item-icon">
                    {device.kind === "wifi" ? <Wifi size={20} /> : <Network size={20} />}
                  </div>
                  <div className="ap-item-main">
                    <strong>
                      {device.kind === "wifi" ? "Wi-Fi" : "Câble Ethernet"}
                      <small> ({device.name})</small>
                    </strong>
                    <span>
                      {device.state.startsWith("connected")
                        ? `Connecté${device.connection ? ` à « ${device.connection} »` : ""}${
                            device.ip ? ` — adresse ${device.ip}` : ""
                          }`
                        : device.state === "unavailable"
                          ? "Désactivé"
                          : "Non connecté"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ap-card">
            <div className="ap-row">
              <h2 className="ap-card-title">Réseaux Wi-Fi</h2>
              <div className="ap-actions">
                <button
                  className="ap-btn"
                  onClick={() => void scan(true)}
                  disabled={scanning || busy || !status.wifi_enabled}
                >
                  <RefreshCw size={16} className={scanning ? "ap-spin" : ""} />
                  Rechercher
                </button>
                <button
                  className="ap-btn"
                  onClick={() => void toggleWifi(!status.wifi_enabled)}
                  disabled={busy}
                >
                  {status.wifi_enabled ? <WifiOff size={16} /> : <Wifi size={16} />}
                  {status.wifi_enabled ? "Désactiver le Wi-Fi" : "Activer le Wi-Fi"}
                </button>
              </div>
            </div>

            {!status.wifi_enabled && (
              <p className="ap-muted">Le Wi-Fi est désactivé.</p>
            )}

            {status.wifi_enabled && networks.length === 0 && !scanning && (
              <p className="ap-muted">Aucun réseau Wi-Fi trouvé pour le moment.</p>
            )}

            <div className="ap-list">
              {networks.map((network) => {
                const open = selected === network.ssid;
                return (
                  <div className="ap-list-item column" key={network.ssid}>
                    <div className="ap-list-line">
                      <div className="ap-item-icon">
                        <Wifi size={20} />
                      </div>
                      <div className="ap-item-main">
                        <strong>
                          {network.ssid}
                          {network.in_use && (
                            <span className="ap-badge ok inline">
                              <Check size={13} /> Connecté
                            </span>
                          )}
                        </strong>
                        <span>
                          Signal {network.signal} %
                          {!isOpen(network.security) && (
                            <>
                              {" · "}
                              <Lock size={12} /> Protégé
                            </>
                          )}
                        </span>
                      </div>
                      {network.in_use ? (
                        <button className="ap-btn" onClick={() => void disconnect()} disabled={busy}>
                          Déconnecter
                        </button>
                      ) : (
                        <button
                          className="ap-btn primary"
                          disabled={busy}
                          onClick={() => {
                            setPassword("");
                            if (isOpen(network.security)) {
                              void connect(network);
                            } else {
                              setSelected(open ? null : network.ssid);
                            }
                          }}
                        >
                          Se connecter
                        </button>
                      )}
                    </div>

                    {open && !network.in_use && (
                      <form
                        className="ap-inline-form"
                        onSubmit={(event) => void connect(network, event)}
                      >
                        <input
                          type="password"
                          placeholder="Mot de passe du Wi-Fi"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          autoFocus
                          required
                        />
                        <button className="ap-btn primary" type="submit" disabled={busy}>
                          {busy ? "Connexion…" : "Valider"}
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default AdminNetwork;
