import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ImagePlus,
  Upload,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Copy,
  RefreshCw,
} from "lucide-react";

interface AdminPhoto {
  name: string;
  path: string;
  folder: string;
  size: number;
  modified: number;
}

interface UploadResult {
  status: "added" | "duplicate";
  name: string;
  message: string;
}

interface PendingFile {
  id: string;
  file: File;
  url: string;
}

interface ResultLine {
  id: string;
  name: string;
  status: "added" | "duplicate" | "error";
  message: string;
}

interface Props {
  token: string;
}

const MAX_SIZE = 25 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function AdminGallery({ token }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const pendingRef = useRef<PendingFile[]>([]);
  const thumbJob = useRef(0);

  const [pending, setPending] = useState<PendingFile[]>([]);
  const [results, setResults] = useState<ResultLine[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");

  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmPath, setConfirmPath] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      thumbJob.current += 1;
      pendingRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  const loadThumbs = useCallback(async (list: AdminPhoto[], job: number) => {
    const queue = [...list];
    const worker = async () => {
      while (queue.length > 0) {
        if (!mounted.current || job !== thumbJob.current) return;
        const photo = queue.shift();
        if (!photo) return;
        try {
          const image = await invoke<string>("read_photo_thumbnail", {
            path: photo.path,
          });
          if (!mounted.current || job !== thumbJob.current) return;
          setThumbs((previous) => ({ ...previous, [photo.path]: image }));
        } catch {
          // Miniature impossible (format non décodable) : l'espace reste vide.
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, list.length) }, () => worker()));
  }, []);

  const loadPhotos = useCallback(async () => {
    const job = ++thumbJob.current;
    try {
      const list = await invoke<AdminPhoto[]>("admin_list_photos", { token });
      if (!mounted.current || job !== thumbJob.current) return;
      setError("");
      setPhotos(list);
      void loadThumbs(list, job);
    } catch (err) {
      if (mounted.current) setError(String(err));
    } finally {
      if (mounted.current && job === thumbJob.current) setLoading(false);
    }
  }, [token, loadThumbs]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const added: PendingFile[] = [];
    const known = new Set(pending.map((item) => `${item.file.name}|${item.file.size}|${item.file.lastModified}`));

    for (const file of Array.from(fileList)) {
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      if (known.has(key)) continue;
      known.add(key);
      added.push({
        id: `${key}|${Math.random().toString(36).slice(2, 8)}`,
        file,
        url: URL.createObjectURL(file),
      });
    }

    if (added.length > 0) setPending((previous) => [...previous, ...added]);
    setResults([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removePending(id: string) {
    setPending((previous) => {
      const target = previous.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return previous.filter((item) => item.id !== id);
    });
  }

  function clearPending() {
    pending.forEach((item) => URL.revokeObjectURL(item.url));
    setPending([]);
  }

  async function uploadAll() {
    if (pending.length === 0 || uploading) return;

    setUploading(true);
    setResults([]);
    const batch = [...pending];
    const lines: ResultLine[] = [];

    for (let index = 0; index < batch.length; index += 1) {
      const item = batch[index];
      setProgress(`Envoi ${index + 1} sur ${batch.length} : ${item.file.name}`);

      if (item.file.size > MAX_SIZE) {
        lines.push({
          id: item.id,
          name: item.file.name,
          status: "error",
          message: "Dépasse la limite de 25 Mo.",
        });
        continue;
      }

      try {
        const bytes = new Uint8Array(await item.file.arrayBuffer());
        const result = await invoke<UploadResult>("admin_upload_photo", bytes, {
          headers: {
            "x-admin-token": token,
            "x-file-name": encodeURIComponent(item.file.name),
          },
        });
        lines.push({
          id: item.id,
          name: result.name,
          status: result.status,
          message: result.message,
        });
      } catch (err) {
        lines.push({
          id: item.id,
          name: item.file.name,
          status: "error",
          message: String(err),
        });
      }
    }

    if (!mounted.current) return;

    batch.forEach((item) => URL.revokeObjectURL(item.url));
    setPending([]);
    setResults(lines);
    setProgress("");
    setUploading(false);
    await loadPhotos();
  }

  async function deletePhoto(photo: AdminPhoto) {
    setDeleting(true);
    setError("");
    try {
      await invoke("admin_delete_photo", { token, path: photo.path });
      setConfirmPath(null);
      setPhotos((previous) => previous.filter((item) => item.path !== photo.path));
    } catch (err) {
      setError(String(err));
    } finally {
      setDeleting(false);
    }
  }

  const added = results.filter((line) => line.status === "added").length;

  return (
    <>
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">CONTENU</span>
          <h1>Galerie</h1>
          <p>Ajoutez des photos à la galerie ou supprimez-en.</p>
        </div>
        <button
          className="admin-refresh"
          onClick={() => {
            setLoading(true);
            void loadPhotos();
          }}
          disabled={loading || uploading}
        >
          <RefreshCw size={17} />
          Actualiser
        </button>
      </div>

      {error && <div className="ap-alert error">{error}</div>}

      <div className="ap-card">
        <h2 className="ap-card-title">Ajouter des photos</h2>
        <p className="ap-muted">
          Formats acceptés : JPG, PNG, WebP, GIF, BMP, TIFF et AVIF (25 Mo
          maximum par photo). Une photo déjà présente dans la galerie est
          refusée.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,image/avif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.avif"
          multiple
          hidden
          onChange={(event) => addFiles(event.target.files)}
        />

        <div className="ap-actions">
          <button className="ap-btn primary" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <ImagePlus size={17} />
            Choisir des photos
          </button>
          {pending.length > 0 && (
            <>
              <button className="ap-btn primary" onClick={() => void uploadAll()} disabled={uploading}>
                <Upload size={17} />
                {uploading ? "Envoi en cours…" : `Envoyer ${pending.length} photo${pending.length > 1 ? "s" : ""}`}
              </button>
              <button className="ap-btn" onClick={clearPending} disabled={uploading}>
                Tout retirer
              </button>
            </>
          )}
        </div>

        {progress && <p className="ap-muted">{progress}</p>}

        {pending.length > 0 && (
          <div className="ap-thumb-grid">
            {pending.map((item) => (
              <div className="ap-thumb" key={item.id}>
                <img src={item.url} alt={item.file.name} />
                <button
                  className="ap-thumb-remove"
                  onClick={() => removePending(item.id)}
                  disabled={uploading}
                  aria-label={`Retirer ${item.file.name}`}
                >
                  <X size={15} />
                </button>
                <div className="ap-thumb-caption">
                  <strong title={item.file.name}>{item.file.name}</strong>
                  <span>{formatSize(item.file.size)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {results.length > 0 && (
          <div className="ap-results">
            <strong>
              {added} photo{added > 1 ? "s" : ""} ajoutée{added > 1 ? "s" : ""} sur {results.length}.
            </strong>
            {results.map((line) => (
              <div className={`ap-result ${line.status}`} key={line.id}>
                {line.status === "added" && <CheckCircle2 size={17} />}
                {line.status === "duplicate" && <Copy size={17} />}
                {line.status === "error" && <AlertCircle size={17} />}
                <span>
                  <b>{line.name}</b> — {line.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ap-card">
        <div className="ap-row">
          <h2 className="ap-card-title">Photos de la galerie</h2>
          <span className="ap-badge info">
            {photos.length} photo{photos.length > 1 ? "s" : ""}
          </span>
        </div>

        {loading && photos.length === 0 && <p className="ap-muted">Chargement…</p>}
        {!loading && photos.length === 0 && (
          <p className="ap-muted">La galerie est vide pour le moment.</p>
        )}

        <div className="ap-thumb-grid">
          {photos.map((photo) => (
            <div className="ap-thumb" key={photo.path}>
              {thumbs[photo.path] ? (
                <img src={thumbs[photo.path]} alt={photo.name} />
              ) : (
                <div className="ap-thumb-empty" />
              )}

              {confirmPath === photo.path ? (
                <div className="ap-thumb-confirm">
                  <span>Supprimer cette photo ?</span>
                  <div>
                    <button
                      className="ap-btn danger small"
                      onClick={() => void deletePhoto(photo)}
                      disabled={deleting}
                    >
                      Supprimer
                    </button>
                    <button
                      className="ap-btn small"
                      onClick={() => setConfirmPath(null)}
                      disabled={deleting}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="ap-thumb-remove danger"
                  onClick={() => setConfirmPath(photo.path)}
                  aria-label={`Supprimer ${photo.name}`}
                >
                  <Trash2 size={15} />
                </button>
              )}

              <div className="ap-thumb-caption">
                <strong title={photo.name}>{photo.name}</strong>
                <span>
                  {formatSize(photo.size)}
                  {photo.folder ? ` · ${photo.folder}` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default AdminGallery;
