import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  ExternalLink,
  Newspaper,
  RefreshCw,
  Search,
  Clock3,
  AlertCircle,
  Globe2,
  X,
  CalendarDays,
  BookOpen,
} from "lucide-react";

import "./Actualites.css";


// Drapeaux dessinés en SVG : les emojis de drapeaux ne s'affichent pas
// sur tous les systèmes Linux.
function Flag({ code }: { code: string }) {
  if (code === "pt") {
    return (
      <svg viewBox="0 0 60 40" width="1em" height="0.67em" role="img" aria-label="Portugal">
        <rect width="60" height="40" rx="5" fill="#d8232a" />
        <rect width="24" height="40" rx="5" fill="#0a7a3d" />
        <rect x="12" width="12" height="40" fill="#0a7a3d" />
        <circle cx="24" cy="20" r="8" fill="#f9d423" />
        <circle cx="24" cy="20" r="4.6" fill="#ffffff" />
        <circle cx="24" cy="20" r="2.4" fill="#d8232a" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 60 40" width="1em" height="0.67em" role="img" aria-label="France">
      <rect width="60" height="40" rx="5" fill="#ffffff" />
      <path d="M5 0h15v40H5a5 5 0 0 1-5-5V5a5 5 0 0 1 5-5z" fill="#1f4aa8" />
      <rect x="40" width="20" height="40" fill="#e1262d" />
      <path d="M55 0a5 5 0 0 1 5 5v30a5 5 0 0 1-5 5h-15V0z" fill="#e1262d" />
    </svg>
  );
}

interface NewsArticle {
  title: string;
  link: string;
  description: string;
  published: string;
  image: string | null;
  source: string;
}

interface NewsArticleDetail {
  title: string;
  link: string;
  description: string;
  published: string;
  image: string;
  source: string;
  paragraphs: string[];
}

interface ActualitesProps {
  country: "fr" | "pt";
  onClose: () => void;
}

const CONFIG = {
  fr: {
    title: "Actualités France",
    subtitle: "Toute l'actualité française, simplement.",
    source: "Franceinfo, RFI, France 24, Le Monde",
    language: "Français",
    flag: "fr",
    search: "Rechercher dans les actualités françaises...",
    accent: "fr",
    read: "Lire l'article",
    back: "Retour aux actualités",
    loadingArticle: "Ouverture de l'article...",
    articleError: "Impossible de charger le contenu complet de cet article.",
    external: "Lire sur le site d’origine",
    featured: "À LA UNE",
    other: "LES AUTRES ARTICLES",
    discover: "À découvrir",
    noResults: "Aucun article ne correspond à votre recherche.",
    allRights: "Les articles appartiennent à leurs médias d'origine.",
  },
  pt: {
    title: "Notícias Portugal",
    subtitle: "As notícias de Portugal, num só lugar.",
    source: "RTP, Observador",
    language: "Português",
    flag: "pt",
    search: "Pesquisar notícias portuguesas...",
    accent: "pt",
    read: "Ler notícia",
    back: "Voltar às notícias",
    loadingArticle: "A abrir a notícia...",
    articleError: "Não foi possível carregar o conteúdo completo desta notícia.",
    external: "Ler no site de origem",
    featured: "EM DESTAQUE",
    other: "OUTRAS NOTÍCIAS",
    discover: "Descobrir",
    noResults: "Não foram encontradas notícias para esta pesquisa.",
    allRights: "As notícias pertencem aos respetivos meios de comunicação.",
  },
};

function formatDate(value: string, country: "fr" | "pt") {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString(country === "fr" ? "fr-FR" : "pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Actualites({ country, onClose }: ActualitesProps) {
  const config = CONFIG[country];

  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [articleDetail, setArticleDetail] = useState<NewsArticleDetail | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState("");

  async function loadNews(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const result = await invoke<NewsArticle[]>("get_news", { country });

      if (!Array.isArray(result)) {
        throw new Error("Le serveur a renvoyé une réponse inattendue.");
      }

      setArticles(result);
      setLastUpdate(new Date());

      if (result.length === 0) {
        setError(
          country === "fr"
            ? "Aucun flux français n'a renvoyé d'article pour le moment."
            : "Nenhum feed português devolveu notícias neste momento."
        );
      }
    } catch (err) {
      console.error("Erreur actualités :", err);
      setError(`Impossible de charger les actualités. ${String(err)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadNews();
    const timer = window.setInterval(() => void loadNews(true), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [country]);

  const filteredArticles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return articles;

    return articles.filter((article) =>
      `${article.title} ${article.description}`.toLocaleLowerCase().includes(query)
    );
  }, [articles, search]);

  const featuredArticle = filteredArticles[0];
  const remainingArticles = filteredArticles.slice(1);

  async function openArticle(article: NewsArticle) {
    setSelectedArticle(article);
    // Affiche immédiatement le résumé RSS : le lecteur reste utilisable
    // même si le site média est lent ou refuse l'extraction du texte complet.
    setArticleDetail({
      title: article.title,
      link: article.link,
      description: article.description || "",
      published: article.published || "",
      image: article.image || "",
      source: article.source || config.source,
      paragraphs: [],
    });
    setArticleError("");
    setArticleLoading(true);

    try {
      const detail = await invoke<NewsArticleDetail>("get_news_article", {
        country,
        url: article.link,
      });
      setArticleDetail(detail);
    } catch (err) {
      console.error("Impossible de charger l'article dans ClairOS :", err);
      setArticleError(`${config.articleError} ${String(err)}`);
    } finally {
      setArticleLoading(false);
    }
  }

  function closeArticle() {
    setSelectedArticle(null);
    setArticleDetail(null);
    setArticleError("");
    setArticleLoading(false);
  }

  async function openExternalArticle() {
    if (!selectedArticle) return;
    try {
      await invoke("open_external_url", { url: selectedArticle.link });
    } catch (err) {
      console.error("Impossible d'ouvrir le navigateur :", err);
      setArticleError(
        country === "fr"
          ? "Le navigateur n'a pas pu être ouvert."
          : "Não foi possível abrir o navegador."
      );
    }
  }

  return (
    <main className={`news-app news-${config.accent}`}>
      <header className="news-topbar">
        <button
          className="news-back"
          onClick={selectedArticle ? closeArticle : onClose}
          aria-label={selectedArticle ? config.back : "Retour au bureau"}
        >
          <ArrowLeft size={21} />
          <span>{selectedArticle ? config.back : "Retour au bureau"}</span>
        </button>

        <div className="news-brand">
          <div className="news-brand-icon"><Newspaper size={22} /></div>
          <span>ClairOS Actualités</span>
        </div>

        {!selectedArticle && (
          <button
            className="news-refresh"
            onClick={() => void loadNews(true)}
            disabled={loading || refreshing}
            title="Actualiser les articles"
          >
            <RefreshCw size={19} className={refreshing ? "news-spinning" : ""} />
            <span>Actualiser</span>
          </button>
        )}
      </header>

      {selectedArticle ? (
        <section className="news-reader">
          <div className="news-reader-toolbar">
            <span className="news-reader-source">
              <Globe2 size={16} />
              {articleDetail?.source || selectedArticle.source || config.source}
            </span>
            <span className="news-reader-date">
              <Clock3 size={15} />
              {formatDate(
                articleDetail?.published || selectedArticle.published,
                country
              )}
            </span>
          </div>

          {articleLoading && (
            <div className="news-loading news-reader-loading">
              <div className="news-loader" />
              <h2>{config.loadingArticle}</h2>
              <p>
                {country === "fr"
                  ? "ClairOS récupère le texte de l'article."
                  : "O ClairOS está a carregar o texto da notícia."}
              </p>
            </div>
          )}

          {!articleLoading && articleError && !articleDetail && (
            <div className="news-error news-reader-error">
              <div className="news-error-icon"><AlertCircle size={30} /></div>
              <div>
                <h2>{country === "fr" ? "Lecture indisponible" : "Leitura indisponível"}</h2>
                <p>{articleError}</p>
                <button
                  className="news-retry"
                  onClick={() => void openArticle(selectedArticle)}
                >
                  <RefreshCw size={17} />
                  {country === "fr" ? "Réessayer" : "Tentar novamente"}
                </button>
              </div>
            </div>
          )}

          {articleDetail && (
            <article className="news-reader-article">
              {articleDetail.image && (
                <div className="news-reader-image-wrap">
                  <img
                    className="news-reader-image"
                    src={articleDetail.image}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              )}

              <div className="news-reader-content">
                {articleLoading && (
                  <p className="news-reader-lead">
                    Chargement du texte complet… Le résumé est déjà disponible.
                  </p>
                )}
                {articleError && (
                  <p className="news-reader-lead">
                    Le texte complet n'est pas disponible pour le moment. Voici le résumé fourni par la source.
                  </p>
                )}
                <span className="news-reader-kicker">
                  {country === "fr" ? "ARTICLE" : "NOTÍCIA"}
                </span>
                <h1>{articleDetail.title || selectedArticle.title}</h1>
                {articleDetail.description && (
                  <p className="news-reader-lead">{articleDetail.description}</p>
                )}

                <div className="news-reader-divider" />

                {articleDetail.paragraphs.length > 0 ? (
                  <div className="news-reader-text">
                    {articleDetail.paragraphs.map((paragraph, index) => (
                      <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
                    ))}
                  </div>
                ) : (
                  <p className="news-reader-fallback">
                    {country === "fr"
                      ? "Le média ne fournit pas le texte complet dans son contenu accessible. Vous pouvez consulter l'article original."
                      : "O meio de comunicação não disponibiliza o texto completo. Pode consultar a notícia original."}
                  </p>
                )}

                <div className="news-reader-actions">
                  <button className="news-reader-external" onClick={() => void openExternalArticle()}>
                    <ExternalLink size={17} />
                    {config.external}
                  </button>
                  <button className="news-reader-back" onClick={closeArticle}>
                    <ArrowLeft size={17} />
                    {config.back}
                  </button>
                </div>
                <p className="news-reader-copyright">{config.allRights}</p>
              </div>
            </article>
          )}
        </section>
      ) : (
        <>
          <section className="news-hero">
            <div className="news-hero-content">
              <div className="news-eyebrow">
                <span className="news-live-dot" />
                {country === "fr" ? "ACTUALITÉS EN DIRECT" : "NOTÍCIAS EM DIRETO"}
              </div>
              <div className="news-title-line">
                <span className="news-flag"><Flag code={config.flag} /></span>
                <h1>{config.title}</h1>
              </div>
              <p>{config.subtitle}</p>
              <div className="news-meta">
                <span><Globe2 size={15} />{config.source}</span>
                <span><CalendarDays size={15} />{config.language}</span>
                <span><Newspaper size={15} />{articles.length} articles</span>
              </div>
            </div>
            <div className="news-hero-decoration"><Newspaper size={110} strokeWidth={0.8} /></div>
          </section>

          <section className="news-content">
            <div className="news-toolbar">
              <div className="news-search">
                <Search size={20} />
                <input
                  type="search"
                  placeholder={config.search}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch("")} aria-label="Effacer la recherche">
                    <X size={18} />
                  </button>
                )}
              </div>
              <div className="news-update-info">
                {lastUpdate
                  ? `${country === "fr" ? "Mis à jour à" : "Atualizado às"} ${lastUpdate.toLocaleTimeString(
                      country === "fr" ? "fr-FR" : "pt-PT",
                      { hour: "2-digit", minute: "2-digit" }
                    )}`
                  : "Chargement des actualités..."}
              </div>
            </div>

            {loading && (
              <div className="news-loading">
                <div className="news-loader" />
                <h2>{country === "fr" ? "Chargement des actualités..." : "A carregar notícias..."}</h2>
                <p>{country === "fr" ? "Nous récupérons les derniers articles." : "Estamos a obter as notícias mais recentes."}</p>
                <div className="news-skeleton-grid">
                  <div className="news-skeleton" />
                  <div className="news-skeleton" />
                  <div className="news-skeleton" />
                </div>
              </div>
            )}

            {!loading && error && (
              <div className="news-error">
                <div className="news-error-icon"><AlertCircle size={30} /></div>
                <div>
                  <h2>{country === "fr" ? "Actualités indisponibles" : "Notícias indisponíveis"}</h2>
                  <p>{error}</p>
                  <button className="news-retry" onClick={() => void loadNews()}>
                    <RefreshCw size={17} />
                    {country === "fr" ? "Réessayer" : "Tentar novamente"}
                  </button>
                </div>
              </div>
            )}

            {!loading && !error && filteredArticles.length === 0 && (
              <div className="news-empty">
                <Search size={38} />
                <h2>{country === "fr" ? "Aucun résultat" : "Sem resultados"}</h2>
                <p>{config.noResults}</p>
                <button onClick={() => setSearch("")}>
                  {country === "fr" ? "Effacer la recherche" : "Limpar pesquisa"}
                </button>
              </div>
            )}

            {!loading && featuredArticle && (
              <>
                <div className="news-section-heading">
                  <div>
                    <span>{config.featured}</span>
                    <h2>{country === "fr" ? "Les dernières actualités" : "Últimas notícias"}</h2>
                  </div>
                  <span className="news-count">{filteredArticles.length} résultats</span>
                </div>

                <article
                  className="news-featured"
                  onClick={() => void openArticle(featuredArticle)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void openArticle(featuredArticle);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="news-featured-image">
                    {featuredArticle.image ? (
                      <img
                        src={featuredArticle.image}
                        alt=""
                        onError={(event) => { event.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <div className="news-image-placeholder"><Newspaper size={65} /></div>
                    )}
                    <span className="news-featured-label">{config.featured}</span>
                  </div>
                  <div className="news-featured-body">
                    <span className="news-source">{featuredArticle.source || config.source}</span>
                    <h3>{featuredArticle.title}</h3>
                    <p>{featuredArticle.description || (country === "fr" ? "Ouvrir pour lire l'article." : "Abrir para ler a notícia.")}</p>
                    <div className="news-article-footer">
                      <span><Clock3 size={15} />{formatDate(featuredArticle.published, country)}</span>
                      <strong><BookOpen size={16} />{config.read}</strong>
                    </div>
                  </div>
                </article>

                {remainingArticles.length > 0 && (
                  <div className="news-section-heading news-other-heading">
                    <div>
                      <span>{config.other}</span>
                      <h2>{config.discover}</h2>
                    </div>
                  </div>
                )}

                <div className="news-grid">
                  {remainingArticles.map((article, index) => (
                    <article
                      className="news-card"
                      key={`${article.link}-${index}`}
                      onClick={() => void openArticle(article)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void openArticle(article);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="news-card-image">
                        {article.image ? (
                          <img
                            src={article.image}
                            alt=""
                            loading="lazy"
                            onError={(event) => { event.currentTarget.style.display = "none"; }}
                          />
                        ) : (
                          <div className="news-image-placeholder"><Newspaper size={38} /></div>
                        )}
                      </div>
                      <div className="news-card-body">
                        <span className="news-source">{article.source || config.source}</span>
                        <h3>{article.title}</h3>
                        <p>{article.description || (country === "fr" ? "Ouvrir pour lire l'article." : "Abrir para ler a notícia.")}</p>
                        <div className="news-card-footer">
                          <span><Clock3 size={14} />{formatDate(article.published, country)}</span>
                          <BookOpen size={17} />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}

      <footer className="news-footer">
        <span>ClairOS by Gab9SG</span>
        <span>{config.allRights}</span>
        <button onClick={selectedArticle ? closeArticle : onClose}>
          <ArrowLeft size={16} />
          {selectedArticle ? config.back : "Bureau"}
        </button>
      </footer>
    </main>
  );
}

export default Actualites;
