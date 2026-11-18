// Réglages d'affichage de ClairOS (modifiés depuis l'administration).
// Ils sont conservés localement et appliqués dès le démarrage.

export const SETTINGS_KEY = "clairos-settings";

export interface AppCatalogItem {
  id: string;
  label: string;
  description: string;
}

// Applications du bureau que l'on peut afficher ou masquer.
export const APP_CATALOG: AppCatalogItem[] = [
  { id: "Cuisine", label: "Cuisine", description: "Recettes de cuisine" },
  { id: "Météo", label: "Météo", description: "Prévisions météo" },
  { id: "Galerie", label: "Galerie", description: "Photos et import USB / carte SD" },
  { id: "Internet", label: "Internet", description: "Navigateur Firefox" },
  { id: "Actualités France", label: "Actualités France", description: "Franceinfo, RFI, France 24, Le Monde" },
  { id: "Notícias Portugal", label: "Notícias Portugal", description: "RTP, Observador" },
];

export const WALLPAPERS = [
  { id: "default", label: "Clair", preview: "linear-gradient(135deg,#dbe8ff,#f3f6fb)" },
  { id: "ocean", label: "Océan", preview: "linear-gradient(135deg,#bfe3f5,#e6f4fb)" },
  { id: "sunset", label: "Coucher de soleil", preview: "linear-gradient(135deg,#ffd9bf,#fdeee3)" },
  { id: "forest", label: "Forêt", preview: "linear-gradient(135deg,#cfe9d3,#eef7ef)" },
  { id: "lavender", label: "Lavande", preview: "linear-gradient(135deg,#e0d6f5,#f4f0fb)" },
] as const;

export const ZOOM_LEVELS = [
  { value: 100, label: "Normal" },
  { value: 115, label: "Grand" },
  { value: 130, label: "Très grand" },
  { value: 150, label: "Énorme" },
] as const;

export interface ClairSettings {
  zoom: number;
  wallpaper: string;
  hiddenApps: string[];
  userName: string;
}

export const DEFAULT_SETTINGS: ClairSettings = {
  zoom: 100,
  wallpaper: "default",
  hiddenApps: [],
  userName: "",
};

export function loadSettings(): ClairSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ClairSettings>;

    return {
      zoom: ZOOM_LEVELS.some((level) => level.value === parsed.zoom)
        ? (parsed.zoom as number)
        : DEFAULT_SETTINGS.zoom,
      wallpaper: WALLPAPERS.some((item) => item.id === parsed.wallpaper)
        ? (parsed.wallpaper as string)
        : DEFAULT_SETTINGS.wallpaper,
      hiddenApps: Array.isArray(parsed.hiddenApps)
        ? parsed.hiddenApps.filter((id): id is string => typeof id === "string")
        : [],
      userName:
        typeof parsed.userName === "string"
          ? parsed.userName.slice(0, 30)
          : "",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function applySettings(settings: ClairSettings) {
  const root = document.documentElement;
  root.style.setProperty("zoom", String(settings.zoom / 100));
  root.dataset.wallpaper = settings.wallpaper;
}

export function saveSettings(settings: ClairSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Impossible d'enregistrer les réglages :", error);
  }
  applySettings(settings);
}
