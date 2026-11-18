import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Folder,
  HardDrive,
  Image as ImageIcon,
  Import,
  RefreshCw,
  X,
} from "lucide-react";

import "./Galerie.css";

// ============================================================
// TYPES
// ============================================================

interface PhotoEntry {
  name: string;
  path: string;
  is_directory: boolean;
}

interface StorageDevice {
  name: string;
  path: string;
}

interface GalerieProps {
  onClose: () => void;
}

// ============================================================
// CONFIGURATION
// ============================================================

const IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff",
];

function isImageFile(filename: string): boolean {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.includes(extension);
}

// ============================================================
// COMPOSANT
// ============================================================

export default function Galerie({ onClose }: GalerieProps) {
  const [entries, setEntries] = useState<PhotoEntry[]>([]);
  const [devices, setDevices] = useState<StorageDevice[]>([]);

  const [folder, setFolder] = useState<string | null>(null);

  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [thumbnailLoading, setThumbnailLoading] = useState<
    Record<string, boolean>
  >({});

  const [selectedPhoto, setSelectedPhoto] = useState<PhotoEntry | null>(null);
  const [viewerData, setViewerData] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingViewer, setLoadingViewer] = useState(false);
  const [importing, setImporting] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Identifiant du chargement actuel des miniatures.
  // Permet d'annuler les anciens chargements lorsqu'on change de dossier.
  const thumbnailJob = useRef(0);

  // Empêche les mises à jour après la fermeture du composant.
  const mounted = useRef(true);

  // ============================================================
  // CHARGEMENT PROGRESSIF DES MINIATURES
  // ============================================================

  const loadThumbnails = async (
    photos: PhotoEntry[],
    job: number
  ) => {
    // Quatre workers décodent en parallèle ; chaque miniature s'affiche
    // dès qu'elle est prête, sans attendre la fin du dossier.
    const pending = [...photos];
    setThumbnailLoading(
      Object.fromEntries(photos.map((photo) => [photo.path, true]))
    );
    const worker = async () => {
      while (pending.length > 0) {
        if (job !== thumbnailJob.current || !mounted.current) return;
        const photo = pending.shift();
        if (!photo) return;
        try {
          const image = await invoke<string>("read_photo_thumbnail", {
            path: photo.path,
          });
          if (job !== thumbnailJob.current || !mounted.current) return;
          setThumbnails((previous) => ({ ...previous, [photo.path]: image }));
        } catch (err) {
          console.error("Erreur de chargement de la miniature :", photo.path, err);
        }
        if (job === thumbnailJob.current && mounted.current) {
          setThumbnailLoading((previous) => {
            const next = { ...previous };
            delete next[photo.path];
            return next;
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(4, photos.length) }, () => worker())
    );
  };

  // ============================================================
  // CHARGEMENT DE LA GALERIE
  // ============================================================

  const loadGallery = useCallback(async (folderPath?: string | null) => {
    const job = ++thumbnailJob.current;

    try {
      setLoading(true);
      setError("");

      const result = await invoke<PhotoEntry[]>("get_photo_entries", {
        folder: folderPath ?? null,
      });

      if (!mounted.current || job !== thumbnailJob.current) {
        return;
      }

      // Affiche immédiatement les fichiers et les dossiers.
      setEntries(result);

      // Réinitialise les miniatures de l'ancien dossier.
      setThumbnails({});
      setThumbnailLoading({});

      // Sélectionne uniquement les images.
      const images = result.filter(
        (entry) =>
          !entry.is_directory && isImageFile(entry.name)
      );

      // Lance le chargement en arrière-plan.
      // Ne pas mettre await ici : la galerie reste disponible.
      void loadThumbnails(images, job);
    } catch (err) {
      console.error("Erreur de chargement de la galerie :", err);

      if (mounted.current && job === thumbnailJob.current) {
        setError("Impossible de charger les photos.");
      }
    } finally {
      if (mounted.current && job === thumbnailJob.current) {
        setLoading(false);
      }
    }
  }, []);

  // ============================================================
  // CHARGEMENT DES PÉRIPHÉRIQUES USB / SD
  // ============================================================

  const loadDevices = async () => {
    try {
      const result = await invoke<StorageDevice[]>(
        "get_storage_devices"
      );

      if (mounted.current) {
        setDevices(result);
      }
    } catch (err) {
      console.error("Erreur de détection des périphériques :", err);
    }
  };

  // ============================================================
  // RAFRAÎCHISSEMENT
  // ============================================================

  const refresh = async () => {
    setMessage("");
    setError("");

    await Promise.all([
      loadGallery(folder),
      loadDevices(),
    ]);
  };

  // ============================================================
  // OUVERTURE D'UNE PHOTO
  // ============================================================

  const openPhoto = async (photo: PhotoEntry) => {
    setSelectedPhoto(photo);
    // Affiche tout de suite la miniature déjà chargée pendant que
    // l'original en pleine résolution arrive.
    setViewerData(thumbnails[photo.path] ?? null);
    setLoadingViewer(true);

    try {
      // Charge toujours la photo originale en pleine résolution.
      const image = await invoke<string>("read_photo", {
        path: photo.path,
      });

      if (mounted.current) {
        setViewerData(image);
      }
    } catch (err) {
      console.error("Impossible d'ouvrir la photo :", err);
      setError("Impossible d'ouvrir cette photo.");
    } finally {
      if (mounted.current) {
        setLoadingViewer(false);
      }
    }
  };

  // ============================================================
  // NAVIGATION ENTRE LES PHOTOS
  // ============================================================

  const getPhotos = () =>
    entries.filter(
      (entry) =>
        !entry.is_directory && isImageFile(entry.name)
    );

  const movePhoto = async (direction: number) => {
    const photos = getPhotos();

    if (!selectedPhoto || photos.length === 0) {
      return;
    }

    const currentIndex = photos.findIndex(
      (photo) => photo.path === selectedPhoto.path
    );

    if (currentIndex === -1) {
      return;
    }

    const nextIndex =
      (currentIndex + direction + photos.length) % photos.length;

    await openPhoto(photos[nextIndex]);
  };

  const closeViewer = () => {
    setSelectedPhoto(null);
    setViewerData(null);
    setLoadingViewer(false);
  };

  // ============================================================
  // IMPORT USB / CARTE SD
  // ============================================================

  const importDevice = async (device: StorageDevice) => {
    const confirmed = window.confirm(
      `Importer les photos de "${device.name}" dans ClairOS ?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setImporting(true);
      setMessage("");
      setError("");

      const result = await invoke<number>(
        "import_photos_from_device",
        {
          devicePath: device.path,
        }
      );

      setMessage(`${result} photo${result > 1 ? "s" : ""} importée${result > 1 ? "s" : ""}.`);

      await loadGallery(folder);
      await loadDevices();
    } catch (err) {
      console.error("Erreur pendant l'import :", err);
      setError("Impossible d'importer les photos.");
    } finally {
      setImporting(false);
    }
  };

  // ============================================================
  // DOSSIERS
  // ============================================================

  const openFolder = async (entry: PhotoEntry) => {
    if (!entry.is_directory) {
      return;
    }

    setFolder(entry.path);
    setSelectedPhoto(null);
    setMessage("");
    setError("");

    await loadGallery(entry.path);
  };

  const goBackFolder = async () => {
    if (!folder) {
      return;
    }

    const normalized = folder.replace(/\/+$/, "");
    const lastSlash = normalized.lastIndexOf("/");

    const parent =
      lastSlash > 0
        ? normalized.substring(0, lastSlash)
        : null;

    setFolder(parent);
    setMessage("");
    setError("");

    await loadGallery(parent);
  };

  const goHome = async () => {
    setFolder(null);
    setMessage("");
    setError("");

    await loadGallery(null);
  };

  // ============================================================
  // INITIALISATION
  // ============================================================

  useEffect(() => {
    mounted.current = true;

    void loadGallery(null);
    void loadDevices();

    return () => {
      mounted.current = false;

      // Annule les chargements de miniatures en cours.
      thumbnailJob.current++;
    };
  }, [loadGallery]);

  // ============================================================
  // CLAVIER
  // ============================================================

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedPhoto) {
        return;
      }

      if (event.key === "Escape") {
        closeViewer();
      }

      if (event.key === "ArrowLeft") {
        void movePhoto(-1);
      }

      if (event.key === "ArrowRight") {
        void movePhoto(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  // ============================================================
  // AFFICHAGE
  // ============================================================

  const photos = getPhotos();

  return (
    <div className="photos-app">
      {/* ================================================== */}
      {/* EN-TÊTE */}
      {/* ================================================== */}

      <header className="photos-header">
        <div className="photos-header-left">
          <button
            className="photos-back-button"
            onClick={onClose}
            title="Retour"
          >
            <ArrowLeft size={21} />
          </button>

          <div className="photos-brand">
            <div className="photos-brand-icon">
              <ImageIcon size={23} />
            </div>

            <div>
              <h1>Galerie</h1>
              <p>Votre galerie personnelle</p>
            </div>
          </div>
        </div>

        <div className="photos-header-actions">
          <button
            className="photos-action-button"
            onClick={() => void refresh()}
            title="Actualiser"
            disabled={loading || importing}
          >
            <RefreshCw
              size={19}
              className={loading ? "photos-spinning" : ""}
            />
            <span>Actualiser</span>
          </button>
        </div>
      </header>

      {/* ================================================== */}
      {/* CONTENU */}
      {/* ================================================== */}

      <main className="photos-content">
        {/* IMPORT USB / SD */}

        <section className="photos-import-card">
          <div className="photos-section-heading">
            <div className="photos-section-icon">
              <HardDrive size={21} />
            </div>

            <div>
              <h2>Importer des photos</h2>
              <p>
                Importez vos photos depuis une clé USB ou une carte SD.
              </p>
            </div>
          </div>

          {devices.length > 0 ? (
            <div className="photos-device-list">
              {devices.map((device) => (
                <div
                  className="photos-device-row"
                  key={device.path}
                >
                  <div className="photos-device-info">
                    <HardDrive size={22} />

                    <div>
                      <strong>{device.name}</strong>
                      <span>{device.path}</span>
                    </div>
                  </div>

                  <button
                    className="photos-import-button"
                    onClick={() => void importDevice(device)}
                    disabled={importing}
                  >
                    <Import size={17} />
                    {importing ? "Import..." : "Importer"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="photos-no-device">
              <HardDrive size={20} />
              <span>
                Aucun périphérique USB ou carte SD détecté.
              </span>
            </div>
          )}

          {message && (
            <div className="photos-message">
              {message}
            </div>
          )}

          {error && (
            <div className="photos-error">
              {error}
            </div>
          )}
        </section>

        {/* GALERIE */}

        <section className="photos-gallery-section">
          <div className="photos-gallery-heading">
            <div>
              <h2>
                {folder
                  ? folder.split("/").filter(Boolean).pop()
                  : "Ma galerie"}
              </h2>

              <p>
                {photos.length} photo{photos.length > 1 ? "s" : ""}
                {" · "}
                {entries.filter((entry) => entry.is_directory).length}{" "}
                dossier
                {entries.filter((entry) => entry.is_directory).length > 1
                  ? "s"
                  : ""}
              </p>
            </div>

            {folder && (
              <button
                className="photos-action-button"
                onClick={() => void goBackFolder()}
              >
                <ArrowLeft size={17} />
                Retour
              </button>
            )}
          </div>

          {/* RACCOURCI RACINE */}

          {folder && (
            <button
              className="photos-home-button"
              onClick={() => void goHome()}
            >
              <Folder size={17} />
              Retour à la galerie principale
            </button>
          )}

          {/* CHARGEMENT DES FICHIERS */}

          {loading && entries.length === 0 && (
            <div className="photos-loading">
              <RefreshCw size={25} className="photos-spinning" />
              <p>Ouverture de la galerie...</p>
            </div>
          )}

          {/* DOSSIERS */}

          {entries.some((entry) => entry.is_directory) && (
            <div className="photos-folder-grid">
              {entries
                .filter((entry) => entry.is_directory)
                .map((entry) => (
                  <button
                    className="photos-folder-card"
                    key={entry.path}
                    onClick={() => void openFolder(entry)}
                  >
                    <Folder size={31} />
                    <span>{entry.name}</span>
                    <ChevronRight size={17} />
                  </button>
                ))}
            </div>
          )}

          {/* PHOTOS */}

          {photos.length > 0 && (
            <div className="photos-grid">
              {photos.map((photo) => {
                const thumbnail = thumbnails[photo.path];
                const isThumbnailLoading =
                  thumbnailLoading[photo.path];

                return (
                  <button
                    className="photos-thumbnail"
                    key={photo.path}
                    onClick={() => void openPhoto(photo)}
                    title={photo.name}
                  >
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt={photo.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="photos-thumbnail-placeholder">
                        {isThumbnailLoading ? (
                          <RefreshCw
                            size={25}
                            className="photos-spinning"
                          />
                        ) : (
                          <ImageIcon size={31} />
                        )}
                      </div>
                    )}

                    <span className="photos-thumbnail-name">
                      {photo.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* GALERIE VIDE */}

          {!loading &&
            entries.length === 0 && (
              <div className="photos-empty">
                <ImageIcon size={48} />

                <h3>Aucune photo pour le moment</h3>

                <p>
                  Importez des photos depuis une clé USB ou une carte SD
                  pour les retrouver ici.
                </p>
              </div>
            )}

          {!loading &&
            entries.length > 0 &&
            photos.length === 0 &&
            !entries.some((entry) => entry.is_directory) && (
              <div className="photos-empty">
                <ImageIcon size={42} />

                <h3>Aucune image dans ce dossier</h3>

                <p>
                  Ce dossier ne contient pas encore de photos.
                </p>
              </div>
            )}
        </section>
      </main>

      {/* ================================================== */}
      {/* VISIONNEUSE */}
      {/* ================================================== */}

      {selectedPhoto && (
        <div
          className="photos-viewer"
          onClick={closeViewer}
        >
          <button
            className="photos-viewer-close"
            onClick={closeViewer}
            title="Fermer"
          >
            <X size={25} />
          </button>

          <div
            className="photos-viewer-content"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="photos-viewer-arrow photos-viewer-prev"
              onClick={() => void movePhoto(-1)}
              title="Photo précédente"
              disabled={photos.length <= 1}
            >
              <ChevronLeft size={30} />
            </button>

            <div className="photos-viewer-image">
              {loadingViewer ? (
                <div className="photos-viewer-loading">
                  <RefreshCw
                    size={32}
                    className="photos-spinning"
                  />
                  <span>Ouverture de la photo...</span>
                </div>
              ) : viewerData ? (
                <img
                  src={viewerData}
                  alt={selectedPhoto.name}
                />
              ) : (
                <div className="photos-viewer-loading">
                  <ImageIcon size={35} />
                  <span>Impossible d'afficher cette photo.</span>
                </div>
              )}
            </div>

            <button
              className="photos-viewer-arrow photos-viewer-next"
              onClick={() => void movePhoto(1)}
              title="Photo suivante"
              disabled={photos.length <= 1}
            >
              <ChevronRight size={30} />
            </button>
          </div>

          <div className="photos-viewer-footer">
            <strong>{selectedPhoto.name}</strong>

            <span>
              {photos.findIndex(
                (photo) => photo.path === selectedPhoto.path
              ) + 1}
              {" / "}
              {photos.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
