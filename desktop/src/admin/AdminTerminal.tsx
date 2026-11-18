import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { RotateCw, ShieldAlert, Eraser } from "lucide-react";

import "@xterm/xterm/css/xterm.css";

interface Props {
  token: string;
}

interface OutputEvent {
  id: number;
  data: string;
}

interface ExitEvent {
  id: number;
}

interface Opened {
  id: number;
  root: boolean;
}

type Phase = "starting" | "open" | "closed" | "error";

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function AdminTerminal({ token }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<number | null>(null);
  // Sortie reçue avant que le démarrage ne nous ait donné l'identifiant de session.
  const pendingRef = useRef<OutputEvent[]>([]);
  const tokenRef = useRef(token);

  const [phase, setPhase] = useState<Phase>("starting");
  const [isRoot, setIsRoot] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const start = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;

    setPhase("starting");
    setError("");
    sessionRef.current = null;
    pendingRef.current = [];
    term.reset();

    try {
      fitRef.current?.fit();
      const opened = await invoke<Opened>("admin_term_open", {
        token: tokenRef.current,
        rows: term.rows,
        cols: term.cols,
      });
      sessionRef.current = opened.id;
      setIsRoot(opened.root);

      for (const event of pendingRef.current) {
        if (event.id === opened.id) term.write(decodeBase64(event.data));
      }
      pendingRef.current = [];

      setPhase("open");
      term.focus();
    } catch (err) {
      setError(String(err));
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily: '"DejaVu Sans Mono", "Liberation Mono", monospace',
      fontSize: 16,
      cursorBlink: true,
      scrollback: 5000,
      convertEol: false,
      theme: {
        background: "#0f172a",
        foreground: "#e2e8f0",
        cursor: "#fbbf24",
        selectionBackground: "#334155",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    const inputSubscription = term.onData((data) => {
      const id = sessionRef.current;
      if (id === null) return;
      void invoke("admin_term_write", { token: tokenRef.current, id, data }).catch(() => undefined);
    });

    const resizeSubscription = term.onResize(({ rows, cols }) => {
      const id = sessionRef.current;
      if (id === null) return;
      void invoke("admin_term_resize", { token: tokenRef.current, id, rows, cols }).catch(
        () => undefined
      );
    });

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // Le conteneur n'est pas encore affiché : on réessaiera au prochain redimensionnement.
      }
    });
    observer.observe(container);

    let disposed = false;
    const unlisteners: UnlistenFn[] = [];

    void listen<OutputEvent>("clairos-terminal-output", (event) => {
      const payload = event.payload;
      if (sessionRef.current === null) {
        pendingRef.current.push(payload);
      } else if (payload.id === sessionRef.current) {
        term.write(decodeBase64(payload.data));
      }
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    });

    void listen<ExitEvent>("clairos-terminal-exit", (event) => {
      if (event.payload.id === sessionRef.current) {
        sessionRef.current = null;
        term.write("\r\n\x1b[33m[Session terminée]\x1b[0m\r\n");
        setPhase("closed");
      }
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    });

    void start();

    return () => {
      disposed = true;
      observer.disconnect();
      inputSubscription.dispose();
      resizeSubscription.dispose();
      unlisteners.forEach((unlisten) => unlisten());
      sessionRef.current = null;
      void invoke("admin_term_close", { token: tokenRef.current }).catch(() => undefined);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [start]);

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">MAINTENANCE</span>
          <h1>Terminal (CMD)</h1>
          <p>Ligne de commande du système, réservée à l'administrateur.</p>
        </div>

        <div className="ap-actions">
          <button
            className="ap-btn"
            onClick={() => termRef.current?.clear()}
            disabled={phase !== "open"}
            title="Efface l'écran du terminal"
          >
            <Eraser size={17} />
            Effacer
          </button>
          <button
            className="ap-btn primary"
            onClick={() => void start()}
            disabled={phase === "starting"}
          >
            <RotateCw size={17} />
            {phase === "open" ? "Redémarrer le terminal" : "Ouvrir un terminal"}
          </button>
        </div>
      </div>

      {phase === "open" && isRoot && (
        <div className="ap-alert info">
          <ShieldAlert size={18} />
          <div>
            <strong>Vous êtes connecté en tant que « root ».</strong>
            <p>
              Les commandes saisies ici ont tous les droits sur l'ordinateur.
              Le terminal se ferme automatiquement quand l'administration est
              verrouillée ou quittée.
            </p>
          </div>
        </div>
      )}

      {phase === "open" && !isRoot && (
        <div className="ap-alert info">
          <ShieldAlert size={18} />
          <div>
            <strong>Mode développement : terminal utilisateur.</strong>
            <p>Sur ClairOS installé, ce terminal ouvre un shell administrateur (root).</p>
          </div>
        </div>
      )}

      {error && (
        <div className="ap-alert error">
          <ShieldAlert size={18} /> {error}
        </div>
      )}

      <div className="ap-terminal-wrap">
        <div className="ap-terminal" ref={containerRef} />
      </div>
    </>
  );
}

export default AdminTerminal;
