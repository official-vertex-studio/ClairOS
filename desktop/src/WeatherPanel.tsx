import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapPin,
  MapPinned,
  RefreshCw,
  Search,
  Sun,
  Thermometer,
  Wind,
  ShieldCheck,
  X,
} from "lucide-react";

import "./WeatherPanel.css";

interface City {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  source?: string;
  city?: string | null;
}

interface WeatherData {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    is_day: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    sunrise: string[];
    sunset: string[];
  };
}

interface Props {
  onClose: () => void;
}

const STORAGE_KEY = "clairos-weather-preference";
const CONSENT_KEY = "clairos-location-consent";

function weatherDescription(code: number) {
  if (code === 0) return "Ciel dégagé";
  if (code === 1) return "Principalement dégagé";
  if (code === 2) return "Partiellement nuageux";
  if (code === 3) return "Couvert";
  if (code === 45 || code === 48) return "Brouillard";
  if ([51, 53, 55, 56, 57].includes(code)) return "Bruine";
  if ([61, 63, 65, 66, 67].includes(code)) return "Pluie";
  if ([71, 73, 75, 77].includes(code)) return "Neige";
  if ([80, 81, 82].includes(code)) return "Averses";
  if ([85, 86].includes(code)) return "Averses de neige";
  if ([95, 96, 99].includes(code)) return "Orages";
  return "Conditions variables";
}

function WeatherIcon({
  code,
  size = 44,
}: {
  code: number;
  size?: number;
}) {
  if (code === 0) return <Sun size={size} />;
  if ([1, 2].includes(code)) return <CloudSun size={size} />;
  if (code === 3) return <Cloud size={size} />;
  if ([45, 48].includes(code)) return <CloudFog size={size} />;
  if ([51, 53, 55, 56, 57].includes(code)) {
    return <CloudDrizzle size={size} />;
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return <CloudRain size={size} />;
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return <CloudSnow size={size} />;
  }
  if ([95, 96, 99].includes(code)) {
    return <CloudLightning size={size} />;
  }
  return <CloudSun size={size} />;
}

function dayName(date: string, index: number) {
  if (index === 0) return "Aujourd'hui";
  if (index === 1) return "Demain";

  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
  });
}

export default function WeatherPanel({ onClose }: Props) {
  const [city, setCity] = useState<City | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<City[]>([]);

  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showConsent, setShowConsent] = useState(false);

  async function loadWeather(selectedCity: City) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        latitude: String(selectedCity.latitude),
        longitude: String(selectedCity.longitude),
        current: [
          "temperature_2m",
          "relative_humidity_2m",
          "apparent_temperature",
          "is_day",
          "precipitation",
          "weather_code",
          "wind_speed_10m",
          "wind_direction_10m",
        ].join(","),
        daily: [
          "weather_code",
          "temperature_2m_max",
          "temperature_2m_min",
          "precipitation_probability_max",
          "sunrise",
          "sunset",
        ].join(","),
        timezone: "auto",
        forecast_days: "7",
      });

      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Le service météo ne répond pas.");
      }

      const data = (await response.json()) as WeatherData;

      setWeather(data);
      setCity(selectedCity);

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode: "city",
          city: selectedCity,
        })
      );
    } catch (err) {
      console.error(err);
      setError(
        "Impossible de récupérer la météo. Vérifiez votre connexion Internet."
      );
    } finally {
      setLoading(false);
    }
  }

  async function requestNativeLocation() {
    setShowConsent(false);
    setLoading(true);
    setError("");

    try {
      // Appel de la commande Rust enregistrée dans Tauri.
      const position = await invoke<GeoLocation>("get_current_location");

      const selectedCity: City = {
        name: position.city || "Ma position",
        latitude: position.latitude,
        longitude: position.longitude,
      };

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mode: "auto" })
      );

      await loadWeather(selectedCity);
    } catch (err) {
      console.error("Erreur GeoClue :", err);

      setLoading(false);
      setError(
        "Impossible de déterminer votre position automatiquement. Vérifiez votre connexion Internet ou choisissez votre ville ci-dessous."
      );
      setShowSearch(true);
    }
  }

  function useMyLocation() {
    setError("");

    const consent = localStorage.getItem(CONSENT_KEY);

    if (consent === "accepted") {
      void requestNativeLocation();
      return;
    }

    setShowConsent(true);
  }

  function acceptLocation() {
    localStorage.setItem(CONSENT_KEY, "accepted");
    void requestNativeLocation();
  }

  function refuseLocation() {
    localStorage.setItem(CONSENT_KEY, "denied");
    setShowConsent(false);
    setShowSearch(true);
    setError(
      "La localisation n'est pas activée. Vous pouvez choisir votre ville manuellement."
    );
  }

  async function searchCities(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = search.trim();

    if (query.length < 2) {
      setError("Entrez au moins deux lettres pour rechercher une ville.");
      return;
    }

    setSearching(true);
    setError("");
    setResults([]);

    try {
      const params = new URLSearchParams({
        name: query,
        count: "8",
        language: "fr",
        format: "json",
      });

      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Recherche indisponible.");
      }

      const data = await response.json();

      const cities: City[] = (data.results ?? []).map(
        (item: {
          name: string;
          latitude: number;
          longitude: number;
          country?: string;
          admin1?: string;
        }) => ({
          name: item.name,
          latitude: item.latitude,
          longitude: item.longitude,
          country: item.country,
          admin1: item.admin1,
        })
      );

      setResults(cities);

      if (cities.length === 0) {
        setError("Aucune ville trouvée. Essayez un autre nom.");
      }
    } catch (err) {
      console.error(err);
      setError("La recherche de villes est momentanément indisponible.");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return;

    try {
      const preference = JSON.parse(saved);

      if (
        preference.mode === "auto" &&
        localStorage.getItem(CONSENT_KEY) === "accepted"
      ) {
        void requestNativeLocation();
      } else if (preference.city) {
        void loadWeather(preference.city);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    // Chargement initial de la préférence enregistrée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = weather?.current;
  const daily = weather?.daily;

  return (
    <div className="weather-panel">
      <header className="weather-header">
        <button className="weather-back" onClick={onClose}>
          <ArrowLeft size={21} />
          <span>Retour au bureau</span>
        </button>

        <div className="weather-brand">
          <CloudSun size={27} />
          <strong>Météo</strong>
        </div>
      </header>

      <div className="weather-content">
        <div className="weather-heading">
          <div>
            <span className="weather-eyebrow">VOTRE MÉTÉO</span>
            <h2>Le temps chez vous</h2>
            <p>Des prévisions simples pour organiser votre journée.</p>
          </div>

          <button
            className="weather-refresh"
            onClick={() => {
              if (city) void loadWeather(city);
              else useMyLocation();
            }}
            disabled={loading}
            title="Actualiser la météo"
          >
            <RefreshCw size={20} />
            Actualiser
          </button>
        </div>

        <div className="weather-location-actions">
          <button
            className="weather-location-button"
            onClick={useMyLocation}
            disabled={loading}
          >
            <MapPin size={20} />
            Utiliser ma position
          </button>

          <button
            className="weather-location-button secondary"
            onClick={() => setShowSearch((value) => !value)}
          >
            <Search size={20} />
            Choisir une ville
          </button>
        </div>

        {showSearch && (
          <section className="weather-search-box">
            <h3>Rechercher une ville</h3>

            <form onSubmit={searchCities}>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Exemple : Paris, Lyon, Lisbonne..."
                aria-label="Nom de la ville"
              />

              <button type="submit" disabled={searching}>
                <Search size={19} />
                {searching ? "Recherche..." : "Rechercher"}
              </button>
            </form>

            {results.length > 0 && (
              <div className="weather-city-results">
                {results.map((result, index) => (
                  <button
                    key={`${result.latitude}-${result.longitude}-${index}`}
                    onClick={() => {
                      setShowSearch(false);
                      setResults([]);
                      setSearch("");
                      void loadWeather(result);
                    }}
                  >
                    <MapPinned size={20} />
                    <span>
                      <strong>{result.name}</strong>
                      <small>
                        {[result.admin1, result.country]
                          .filter(Boolean)
                          .join(", ")}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {error && (
          <div className="weather-error" role="alert">
            {error}
          </div>
        )}

        {loading && (
          <div className="weather-loading">
            <RefreshCw size={30} className="weather-spin" />
            <strong>Préparation de votre météo...</strong>
            <span>Veuillez patienter quelques instants.</span>
          </div>
        )}

        {!loading && !weather && !error && (
          <div className="weather-welcome">
            <div className="weather-welcome-icon">
              <CloudSun size={60} />
            </div>
            <h3>Bienvenue dans Météo</h3>
            <p>
              Activez votre localisation ou choisissez une ville pour
              découvrir la météo.
            </p>
          </div>
        )}

        {!loading && weather && current && daily && (
          <>
            <section className="weather-current">
              <div className="weather-current-main">
                <div className="weather-city-name">
                  <MapPin size={18} />
                  {city?.name}
                  {city?.country ? `, ${city.country}` : ""}
                </div>

                <div className="weather-temperature">
                  {Math.round(current.temperature_2m)}°
                </div>

                <h3>{weatherDescription(current.weather_code)}</h3>

                <p>
                  Ressenti : {Math.round(current.apparent_temperature)}°
                </p>
              </div>

              <div className="weather-current-icon">
                <WeatherIcon
                  code={current.weather_code}
                  size={104}
                />
              </div>
            </section>

            <h3 className="weather-section-title">
              Les conditions actuelles
            </h3>

            <section className="weather-details">
              <div className="weather-detail-card">
                <Thermometer size={25} />
                <span>Ressenti</span>
                <strong>{Math.round(current.apparent_temperature)}°C</strong>
              </div>

              <div className="weather-detail-card">
                <Droplets size={25} />
                <span>Humidité</span>
                <strong>{current.relative_humidity_2m}%</strong>
              </div>

              <div className="weather-detail-card">
                <Wind size={25} />
                <span>Vent</span>
                <strong>{Math.round(current.wind_speed_10m)} km/h</strong>
              </div>

              <div className="weather-detail-card">
                <CloudRain size={25} />
                <span>Précipitations</span>
                <strong>{current.precipitation} mm</strong>
              </div>
            </section>

            <h3 className="weather-section-title">
              Les 7 prochains jours
            </h3>

            <section className="weather-forecast">
              {daily.time.map((date, index) => (
                <article className="weather-day" key={date}>
                  <strong>{dayName(date, index)}</strong>

                  <WeatherIcon
                    code={daily.weather_code[index]}
                    size={32}
                  />

                  <span className="weather-day-description">
                    {weatherDescription(daily.weather_code[index])}
                  </span>

                  <div className="weather-day-temperatures">
                    <strong>
                      {Math.round(daily.temperature_2m_max[index])}°
                    </strong>
                    <span>
                      {Math.round(daily.temperature_2m_min[index])}°
                    </span>
                  </div>

                  <small>
                    <Droplets size={13} />
                    {daily.precipitation_probability_max[index] ?? 0}%
                  </small>
                </article>
              ))}
            </section>

            <p className="weather-source">
              Données météorologiques fournies par Open-Meteo.
            </p>
          </>
        )}
      </div>

      {showConsent && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowConsent(false);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(10, 18, 35, 0.62)",
            backdropFilter: "blur(9px)",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-consent-title"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 430,
              padding: 32,
              borderRadius: 24,
              background: "#ffffff",
              color: "#172033",
              boxShadow: "0 25px 80px rgba(0,0,0,0.25)",
              textAlign: "center",
            }}
          >
            <button
              onClick={() => setShowConsent(false)}
              aria-label="Fermer"
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                border: 0,
                background: "#f1f4f9",
                borderRadius: 10,
                padding: 8,
                cursor: "pointer",
                color: "#475569",
              }}
            >
              <X size={18} />
            </button>

            <div
              style={{
                width: 76,
                height: 76,
                margin: "0 auto 20px",
                display: "grid",
                placeItems: "center",
                borderRadius: 22,
                background: "#eaf2ff",
                color: "#3678e5",
              }}
            >
              <MapPin size={36} />
            </div>

            <span
              style={{
                display: "inline-block",
                marginBottom: 10,
                color: "#3678e5",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1.5,
              }}
            >
              AUTORISATION CLAIROS
            </span>

            <h2
              id="location-consent-title"
              style={{
                margin: "0 0 12px",
                fontSize: 25,
                fontWeight: 750,
              }}
            >
              Utiliser votre position ?
            </h2>

            <p
              style={{
                margin: "0 0 22px",
                color: "#64748b",
                fontSize: 14,
                lineHeight: 1.7,
              }}
            >
              Météo souhaite utiliser la localisation de votre ordinateur
              pour afficher automatiquement la météo de votre secteur.
            </p>

            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: 15,
                marginBottom: 24,
                borderRadius: 14,
                background: "#f3f7fc",
                textAlign: "left",
              }}
            >
              <ShieldCheck
                size={23}
                style={{ flexShrink: 0, color: "#3678e5" }}
              />
              <span
                style={{
                  color: "#475569",
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                Votre position sert à rechercher les prévisions météo. Vous
                pouvez refuser et choisir une ville manuellement.
              </span>
            </div>

            <button
              onClick={acceptLocation}
              style={{
                width: "100%",
                minHeight: 48,
                border: 0,
                borderRadius: 13,
                background: "#3678e5",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Autoriser la localisation
            </button>

            <button
              onClick={refuseLocation}
              style={{
                width: "100%",
                minHeight: 44,
                marginTop: 9,
                border: 0,
                borderRadius: 13,
                background: "transparent",
                color: "#64748b",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Pas maintenant
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
