import { useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  Search,
  Heart,
  Clock3,
  Users,
  ChefHat,
  ExternalLink,
  X,
  Utensils,
  BookOpen,
  Sparkles,
  CookingPot,
  Leaf,
  Salad,
  Apple,
  Carrot,
  TriangleAlert,
  Info,
  Play,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Globe,
  RotateCcw
} from "lucide-react";
import "./Cuisine.css";

// ============================================================
// TYPES
// ============================================================

type Recipe = {
  id: number;
  title: string;
  category: string;
  description: string;
  duration: number;
  servings: number;
  difficulty: string;
  image: string;
  ingredients: string[];
  steps: string[];
  source: string;
};

type MarmitonRecipe = {
  id: string;
  title: string;
  url: string;
  image: string;
  category: string;
};

type MarmitonDetail = {
  title: string;
  description: string;
  image: string;
  gallery_images: string[];
  ingredients: string[];
  steps: string[];
  total_time: string;
  servings: string;
  difficulty: string;
  video_url: string;
  video_embed_url: string;
  source_url: string;
};

type MealDbRecipe = {
  id: string;
  title: string;
  category: string;
  description: string;
  duration: number;
  servings: string;
  difficulty: string;
  image: string;
  ingredients: string[];
  steps: string[];
  source: string;
  video_url: string;
  area: string;
};

type Props = {
  onClose: () => void;
};

// ============================================================
// CATALOGUE DE RECETTES INTÉGRÉES
// ============================================================

const recipes: Recipe[] = [
  {
    id: 1,
    title: "Gratin dauphinois",
    category: "Plats",
    description: "Un grand classique français, fondant et délicieusement crémeux.",
    duration: 65,
    servings: 4,
    difficulty: "Facile",
    image: "https://images.unsplash.com/photo-1579631542720-3a87824fff86?w=900",
    ingredients: [
      "1 kg de pommes de terre",
      "40 cl de crème",
      "20 cl de lait",
      "1 gousse d'ail",
      "Sel",
      "Poivre",
      "Muscade"
    ],
    steps: [
      "Préchauffez le four à 160 °C.",
      "Épluchez les pommes de terre et coupez-les en fines rondelles.",
      "Frottez un plat avec la gousse d'ail.",
      "Disposez les pommes de terre dans le plat.",
      "Mélangez la crème et le lait avec le sel, le poivre et la muscade.",
      "Versez sur les pommes de terre et enfournez environ 1 heure."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=gratin+dauphinois"
  },
  {
    id: 2,
    title: "Crêpes maison",
    category: "Desserts",
    description: "Des crêpes légères et dorées pour un goûter gourmand.",
    duration: 25,
    servings: 4,
    difficulty: "Facile",
    image: "https://images.unsplash.com/photo-1519676867240-f03562e64548?w=900",
    ingredients: [
      "250 g de farine",
      "3 œufs",
      "50 cl de lait",
      "1 sachet de sucre vanillé",
      "1 pincée de sel",
      "30 g de beurre"
    ],
    steps: [
      "Versez la farine dans un saladier.",
      "Ajoutez les œufs et le sucre vanillé.",
      "Versez progressivement le lait en mélangeant.",
      "Ajoutez le beurre fondu et laissez reposer 20 minutes si possible.",
      "Faites cuire les crêpes dans une poêle chaude légèrement beurrée."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=crepes"
  },
  {
    id: 3,
    title: "Salade méditerranéenne",
    category: "Entrées",
    description: "Une salade fraîche, colorée et pleine de saveurs.",
    duration: 15,
    servings: 2,
    difficulty: "Très facile",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900",
    ingredients: [
      "1 concombre",
      "2 tomates",
      "100 g de feta",
      "Olives noires",
      "Huile d'olive",
      "Citron",
      "Origan"
    ],
    steps: [
      "Lavez les légumes.",
      "Coupez les tomates et le concombre en morceaux.",
      "Ajoutez la feta émiettée et les olives.",
      "Assaisonnez avec l'huile d'olive, le citron et l'origan.",
      "Mélangez délicatement et servez frais."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=salade+mediterraneenne"
  },
  {
    id: 4,
    title: "Poulet rôti au four",
    category: "Plats",
    description: "Un poulet tendre avec une peau bien dorée.",
    duration: 90,
    servings: 4,
    difficulty: "Facile",
    image: "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=900",
    ingredients: [
      "1 poulet entier",
      "2 cuillères d'huile d'olive",
      "2 gousses d'ail",
      "Thym",
      "Sel",
      "Poivre",
      "Pommes de terre"
    ],
    steps: [
      "Préchauffez le four à 190 °C.",
      "Badigeonnez le poulet d'huile d'olive.",
      "Salez, poivrez et ajoutez le thym et l'ail.",
      "Placez le poulet dans un plat avec les pommes de terre.",
      "Enfournez environ 1 h 20 en arrosant régulièrement."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=poulet+roti"
  },
  {
    id: 5,
    title: "Mousse au chocolat",
    category: "Desserts",
    description: "Une mousse aérienne et intense en chocolat.",
    duration: 20,
    servings: 4,
    difficulty: "Facile",
    image: "https://images.unsplash.com/photo-1511715112108-9acc9b8a4c5a?w=900",
    ingredients: [
      "200 g de chocolat noir",
      "6 œufs",
      "1 pincée de sel"
    ],
    steps: [
      "Faites fondre le chocolat doucement.",
      "Séparez les blancs des jaunes d'œufs.",
      "Mélangez les jaunes avec le chocolat tiédi.",
      "Montez les blancs en neige avec le sel.",
      "Incorporez délicatement les blancs au chocolat.",
      "Placez au réfrigérateur pendant au moins 3 heures."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=mousse+au+chocolat"
  },
  {
    id: 6,
    title: "Soupe de légumes",
    category: "Entrées",
    description: "Une soupe réconfortante, simple et pleine de légumes.",
    duration: 40,
    servings: 4,
    difficulty: "Très facile",
    image: "https://images.unsplash.com/photo-1547592180-85f173990554?w=900",
    ingredients: [
      "3 carottes",
      "2 pommes de terre",
      "1 poireau",
      "1 oignon",
      "1 litre d'eau",
      "Sel",
      "Poivre"
    ],
    steps: [
      "Épluchez et coupez les légumes en morceaux.",
      "Faites revenir l'oignon quelques minutes dans une casserole.",
      "Ajoutez les légumes et l'eau.",
      "Laissez cuire environ 30 minutes.",
      "Mixez jusqu'à obtenir une soupe onctueuse."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=soupe+de+legumes"
  },
  {
    id: 7,
    title: "Pâtes à la carbonara",
    category: "Plats",
    description: "Un plat généreux et rapide à préparer.",
    duration: 25,
    servings: 2,
    difficulty: "Facile",
    image: "https://images.unsplash.com/photo-1612874742237-6526221588e3?w=900",
    ingredients: [
      "200 g de pâtes",
      "100 g de lardons",
      "2 jaunes d'œufs",
      "40 g de parmesan",
      "Poivre"
    ],
    steps: [
      "Faites cuire les pâtes dans une grande casserole d'eau.",
      "Faites revenir les lardons dans une poêle.",
      "Mélangez les jaunes d'œufs avec le parmesan.",
      "Égouttez les pâtes en conservant un peu d'eau de cuisson.",
      "Mélangez les pâtes avec les lardons puis ajoutez la préparation aux œufs hors du feu."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=carbonara"
  },
  {
    id: 8,
    title: "Tarte aux pommes",
    category: "Desserts",
    description: "Une tarte traditionnelle aux pommes, parfaite pour le dessert.",
    duration: 50,
    servings: 6,
    difficulty: "Facile",
    image: "https://images.unsplash.com/photo-1568571780765-9276ac8b75a6?w=900",
    ingredients: [
      "1 pâte brisée",
      "4 pommes",
      "2 cuillères de sucre",
      "20 g de beurre",
      "Cannelle"
    ],
    steps: [
      "Préchauffez le four à 180 °C.",
      "Déroulez la pâte dans un moule.",
      "Épluchez les pommes et coupez-les en fines tranches.",
      "Disposez les pommes sur la pâte.",
      "Ajoutez le sucre, le beurre et un peu de cannelle.",
      "Faites cuire environ 35 minutes."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=tarte+aux+pommes"
  },
  {
    id: 9,
    title: "Pastéis de nata",
    category: "Desserts",
    description: "Les célèbres petits flans portugais à la pâte feuilletée.",
    duration: 50,
    servings: 6,
    difficulty: "Moyen",
    image: "https://images.unsplash.com/photo-1483695028939-5bb13f8648b0?w=900",
    ingredients: [
      "1 pâte feuilletée",
      "25 cl de lait",
      "150 g de sucre",
      "4 jaunes d'œufs",
      "20 g de farine",
      "1 bâton de cannelle",
      "Zeste de citron"
    ],
    steps: [
      "Préchauffez le four à 240 °C.",
      "Faites chauffer le lait avec la cannelle et le citron.",
      "Mélangez le sucre et la farine.",
      "Ajoutez progressivement le lait chaud.",
      "Incorporez les jaunes d'œufs.",
      "Versez dans les moules garnis de pâte feuilletée.",
      "Faites cuire jusqu'à obtenir une surface légèrement caramélisée."
    ],
    source: "https://www.marmiton.org/recettes/recette_pasteis-de-nata-portugal_12614.aspx"
  },
  {
    id: 10,
    title: "Riz au lait",
    category: "Desserts",
    description: "Un dessert doux et crémeux au parfum de vanille.",
    duration: 45,
    servings: 4,
    difficulty: "Facile",
    image: "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=900",
    ingredients: [
      "100 g de riz rond",
      "1 litre de lait",
      "70 g de sucre",
      "1 gousse de vanille"
    ],
    steps: [
      "Rincez rapidement le riz.",
      "Faites chauffer le lait avec la vanille.",
      "Ajoutez le riz et le sucre.",
      "Laissez cuire à feu doux en remuant régulièrement.",
      "Laissez refroidir avant de servir."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=riz+au+lait"
  },
  {
    id: 11,
    title: "Quiche lorraine",
    category: "Plats",
    description: "Une quiche généreuse avec des lardons et une garniture fondante.",
    duration: 50,
    servings: 6,
    difficulty: "Facile",
    image: "https://images.unsplash.com/photo-1576458088443-04a19bb13da6?w=900",
    ingredients: [
      "1 pâte brisée",
      "200 g de lardons",
      "3 œufs",
      "20 cl de crème",
      "20 cl de lait",
      "Poivre"
    ],
    steps: [
      "Préchauffez le four à 180 °C.",
      "Étalez la pâte dans un moule.",
      "Faites revenir les lardons.",
      "Battez les œufs avec la crème et le lait.",
      "Répartissez les lardons sur la pâte.",
      "Versez la préparation et enfournez environ 35 minutes."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=quiche+lorraine"
  },
  {
    id: 12,
    title: "Ratatouille",
    category: "Plats",
    description: "Un mélange provençal de légumes mijotés au soleil.",
    duration: 55,
    servings: 4,
    difficulty: "Facile",
    image: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=900",
    ingredients: [
      "2 courgettes",
      "1 aubergine",
      "2 poivrons",
      "4 tomates",
      "1 oignon",
      "2 gousses d'ail",
      "Huile d'olive"
    ],
    steps: [
      "Lavez et coupez les légumes.",
      "Faites revenir l'oignon et l'ail.",
      "Ajoutez les aubergines et les poivrons.",
      "Ajoutez les courgettes et les tomates.",
      "Laissez mijoter à feu doux environ 40 minutes."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=ratatouille"
  },
  {
    id: 13,
    title: "Salade niçoise",
    category: "Entrées",
    description: "Une salade complète avec tomates, œufs, thon et olives.",
    duration: 20,
    servings: 2,
    difficulty: "Très facile",
    image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=900",
    ingredients: [
      "2 tomates",
      "2 œufs",
      "1 boîte de thon",
      "Olives noires",
      "Salade verte",
      "1 petit oignon",
      "Huile d'olive"
    ],
    steps: [
      "Faites cuire les œufs pendant 9 minutes.",
      "Lavez et préparez la salade.",
      "Coupez les tomates et l'oignon.",
      "Ajoutez le thon et les olives.",
      "Écalez les œufs et disposez-les sur la salade.",
      "Assaisonnez avec l'huile d'olive."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=salade+nicoise"
  },
  {
    id: 14,
    title: "Lasagnes bolognaises",
    category: "Plats",
    description: "Des couches de pâtes, de sauce tomate et de béchamel.",
    duration: 75,
    servings: 6,
    difficulty: "Moyen",
    image: "https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=900",
    ingredients: [
      "12 feuilles de lasagnes",
      "500 g de viande hachée",
      "400 g de tomates concassées",
      "50 cl de béchamel",
      "1 oignon",
      "100 g de fromage râpé"
    ],
    steps: [
      "Faites revenir l'oignon et la viande.",
      "Ajoutez les tomates et laissez mijoter.",
      "Préparez la béchamel.",
      "Alternez les couches de pâtes, de sauce et de béchamel.",
      "Terminez avec le fromage râpé.",
      "Enfournez environ 40 minutes à 180 °C."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=lasagnes"
  },
  {
    id: 15,
    title: "Poulet au curry",
    category: "Plats",
    description: "Un poulet parfumé accompagné d'une sauce onctueuse.",
    duration: 35,
    servings: 4,
    difficulty: "Facile",
    image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=900",
    ingredients: [
      "500 g de poulet",
      "20 cl de lait de coco",
      "2 cuillères de curry",
      "1 oignon",
      "Huile",
      "Sel",
      "Poivre"
    ],
    steps: [
      "Coupez le poulet en morceaux.",
      "Faites revenir l'oignon.",
      "Ajoutez le poulet et faites-le dorer.",
      "Ajoutez le curry et le lait de coco.",
      "Laissez mijoter 15 minutes.",
      "Servez avec du riz."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=poulet+curry"
  },
  {
    id: 16,
    title: "Fondant au chocolat",
    category: "Desserts",
    description: "Un gâteau au chocolat avec un cœur délicieusement fondant.",
    duration: 30,
    servings: 6,
    difficulty: "Facile",
    image: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=900",
    ingredients: [
      "200 g de chocolat noir",
      "100 g de beurre",
      "100 g de sucre",
      "3 œufs",
      "50 g de farine"
    ],
    steps: [
      "Préchauffez le four à 180 °C.",
      "Faites fondre le chocolat et le beurre.",
      "Mélangez les œufs et le sucre.",
      "Ajoutez le chocolat fondu.",
      "Incorporez la farine.",
      "Versez dans un moule et faites cuire environ 12 à 15 minutes."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=fondant+chocolat"
  },
  {
    id: 17,
    title: "Soupe à l'oignon",
    category: "Entrées",
    description: "Une soupe traditionnelle gratinée au fromage.",
    duration: 50,
    servings: 4,
    difficulty: "Facile",
    image: "https://images.unsplash.com/photo-1547592180-85f173990554?w=900",
    ingredients: [
      "5 oignons",
      "1 litre de bouillon",
      "30 g de beurre",
      "Pain",
      "100 g de fromage râpé"
    ],
    steps: [
      "Émincez les oignons.",
      "Faites-les revenir doucement dans le beurre.",
      "Ajoutez le bouillon et laissez mijoter.",
      "Versez dans des bols.",
      "Ajoutez du pain et du fromage.",
      "Faites gratiner au four."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=soupe+oignon"
  },
  {
    id: 18,
    title: "Tiramisu",
    category: "Desserts",
    description: "Un dessert italien au café et au mascarpone.",
    duration: 30,
    servings: 6,
    difficulty: "Facile",
    image: "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=900",
    ingredients: [
      "250 g de mascarpone",
      "3 œufs",
      "80 g de sucre",
      "Biscuits à la cuillère",
      "Café froid",
      "Cacao"
    ],
    steps: [
      "Séparez les blancs des jaunes.",
      "Fouettez les jaunes avec le sucre.",
      "Ajoutez le mascarpone.",
      "Montez les blancs en neige et incorporez-les délicatement.",
      "Trempez les biscuits dans le café.",
      "Alternez les couches de biscuits et de crème.",
      "Saupoudrez de cacao et réfrigérez plusieurs heures."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=tiramisu"
  },
  {
    id: 19,
    title: "Croque-monsieur",
    category: "Plats",
    description: "Un sandwich chaud au jambon et au fromage gratiné.",
    duration: 15,
    servings: 2,
    difficulty: "Très facile",
    image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=900",
    ingredients: [
      "4 tranches de pain de mie",
      "2 tranches de jambon",
      "100 g de fromage râpé",
      "Beurre",
      "Béchamel"
    ],
    steps: [
      "Beurrez légèrement le pain.",
      "Ajoutez le jambon et le fromage.",
      "Refermez les sandwiches.",
      "Ajoutez un peu de béchamel sur le dessus.",
      "Faites gratiner au four jusqu'à ce que le fromage soit doré."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=croque+monsieur"
  },
  {
    id: 20,
    title: "Salade de fruits",
    category: "Desserts",
    description: "Un dessert frais et coloré avec des fruits de saison.",
    duration: 15,
    servings: 4,
    difficulty: "Très facile",
    image: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=900",
    ingredients: [
      "2 pommes",
      "2 bananes",
      "2 oranges",
      "250 g de fraises",
      "1 kiwi",
      "Jus de citron"
    ],
    steps: [
      "Lavez et épluchez les fruits.",
      "Coupez-les en petits morceaux.",
      "Placez-les dans un saladier.",
      "Ajoutez un peu de jus de citron.",
      "Mélangez et réservez au frais."
    ],
    source: "https://www.marmiton.org/recettes/recherche.aspx?aqt=salade+fruits"
  }
];

const categories = [
  "Toutes",
  "Entrées",
  "Plats",
  "Desserts"
];

// ============================================================
// PETITES FONCTIONS
// ============================================================

function safeVideoEmbed(url: string): string {
  if (!url) return "";

  try {
    const parsed = new URL(url);

    const host = parsed.hostname.toLowerCase();

    if (
      host === "www.youtube.com" ||
      host === "youtube.com" ||
      host === "www.youtube-nocookie.com" ||
      host === "youtube-nocookie.com"
    ) {
      return url;
    }

    if (
      host === "player.vimeo.com" ||
      host === "www.dailymotion.com" ||
      host === "geo.dailymotion.com"
    ) {
      return url;
    }

    return "";
  } catch {
    return "";
  }
}

// Version allégée d'une image Unsplash pour les cartes de la liste.
function cardImage(url: string) {
  return url.includes("images.unsplash.com")
    ? url.replace(/w=\d+/, "w=480")
    : url;
}

// ============================================================
// APPLICATION CUISINE
// ============================================================

export default function Cuisine({ onClose }: Props) {
  const searchRequestId = useRef(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Toutes");

  const [favorites, setFavorites] = useState<number[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("clairos-cuisine-favorites") ||
          localStorage.getItem("clairos-recuisine-favorites") ||
          "[]"
      );
    } catch {
      return [];
    }
  });

  const [showFavorites, setShowFavorites] = useState(false);

  const [selectedRecipe, setSelectedRecipe] =
    useState<Recipe | null>(null);

  const [selectedMarmitonRecipe, setSelectedMarmitonRecipe] =
    useState<MarmitonDetail | null>(null);

  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [galleryIndex, setGalleryIndex] = useState(0);

  const [marmitonResults, setMarmitonResults] =
    useState<MarmitonRecipe[]>([]);

  const [isSearchingMarmiton, setIsSearchingMarmiton] =
    useState(false);

  const [marmitonError, setMarmitonError] = useState("");
  const [hasSearchedMarmiton, setHasSearchedMarmiton] =
    useState(false);

  const [mealDbResults, setMealDbResults] =
    useState<MealDbRecipe[]>([]);

  const [selectedMealDbRecipe, setSelectedMealDbRecipe] =
    useState<MealDbRecipe | null>(null);

  const [isSearchingMealDb, setIsSearchingMealDb] =
    useState(false);

  const [mealDbError, setMealDbError] = useState("");
  const [hasSearchedMealDb, setHasSearchedMealDb] =
    useState(false);

  // ----------------------------------------------------------
  // FILTRAGE DES RECETTES
  // ----------------------------------------------------------

  const filteredRecipes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("fr");

    return recipes.filter((recipe) => {
      const matchesCategory =
        category === "Toutes" || recipe.category === category;

      const matchesFavorite =
        !showFavorites || favorites.includes(recipe.id);

      const searchable = [
        recipe.title,
        recipe.description,
        recipe.category,
        ...recipe.ingredients
      ]
        .join(" ")
        .toLocaleLowerCase("fr");

      return (
        matchesCategory &&
        matchesFavorite &&
        (!term || searchable.includes(term))
      );
    });
  }, [search, category, showFavorites, favorites]);

  // ----------------------------------------------------------
  // FAVORIS
  // ----------------------------------------------------------

  function toggleFavorite(id: number) {
    const next = favorites.includes(id)
      ? favorites.filter((favorite) => favorite !== id)
      : [...favorites, id];

    setFavorites(next);

    localStorage.setItem(
      "clairos-cuisine-favorites",
      JSON.stringify(next)
    );
  }

  // ----------------------------------------------------------
  // RECHERCHE INTERNET
  // ----------------------------------------------------------

  async function searchInternet() {
    const query = search.trim();

    if (!query) {
      const message = "Écris le nom d'un plat ou d'un ingrédient.";
      setMarmitonError(message);
      setMealDbError(message);
      setHasSearchedMarmiton(true);
      setHasSearchedMealDb(true);
      return;
    }

    const requestId = ++searchRequestId.current;
    setHasSearchedMarmiton(true);
    setHasSearchedMealDb(true);
    setMarmitonResults([]);
    setMealDbResults([]);
    setMarmitonError("");
    setMealDbError("");
    setIsSearchingMarmiton(true);
    setIsSearchingMealDb(true);

    // Les deux fournisseurs sont indépendants : TheMealDB peut afficher
    // ses résultats sans attendre le site Marmiton, parfois lent ou indisponible.
    void invoke<MealDbRecipe[]>("search_themealdb_recipes", { query })
      .then((results) => {
        if (requestId !== searchRequestId.current) return;
        setMealDbResults(results);
        if (results.length === 0) {
          setMealDbError("Aucune recette internationale trouvée pour cette recherche.");
        }
      })
      .catch((err) => {
        if (requestId !== searchRequestId.current) return;
        console.error("Erreur TheMealDB :", err);
        setMealDbError(String(err) || "Impossible de récupérer les recettes internationales.");
      })
      .finally(() => {
        if (requestId === searchRequestId.current) setIsSearchingMealDb(false);
      });

    void invoke<MarmitonRecipe[]>("search_marmiton_recipes", { query })
      .then((results) => {
        if (requestId !== searchRequestId.current) return;
        setMarmitonResults(results);
        if (results.length === 0) {
          setMarmitonError("Aucune recette Marmiton trouvée pour cette recherche.");
        }
      })
      .catch((err) => {
        if (requestId !== searchRequestId.current) return;
        console.warn("Marmiton indisponible :", err);
        setMarmitonError(
          "Marmiton ne répond pas pour le moment. Les autres recettes restent disponibles."
        );
      })
      .finally(() => {
        if (requestId === searchRequestId.current) setIsSearchingMarmiton(false);
      });
  }

  // ----------------------------------------------------------
  // OUVERTURE NAVIGATEUR EXTERNE
  // ----------------------------------------------------------

  async function openSource(url: string) {
    try {
      await invoke("open_external_url", { url });
    } catch (error) {
      console.error("Ouverture du lien impossible :", error);

      setDetailError(
        typeof error === "string"
          ? error
          : "Impossible d'ouvrir le navigateur."
      );
    }
  }

  // ----------------------------------------------------------
  // OUVERTURE D'UNE RECETTE MARMITON DANS L'APPLICATION
  // ----------------------------------------------------------

  async function loadMarmitonRecipe(recipe: MarmitonRecipe) {
    setSelectedRecipe(null);
    setSelectedMealDbRecipe(null);
    setSelectedMarmitonRecipe(null);
    setIsLoadingDetail(true);
    setDetailError("");
    setGalleryIndex(0);

    try {
      const detail = await invoke<MarmitonDetail>(
        "get_marmiton_recipe",
        { url: recipe.url }
      );

      setSelectedMarmitonRecipe(detail);
    } catch (error) {
      console.error("Erreur détail Marmiton :", error);

      setDetailError(
        typeof error === "string"
          ? error
          : "Impossible de charger cette recette."
      );

      setSelectedMarmitonRecipe({
        title: recipe.title,
        description: "Consultez la recette originale sur Marmiton.",
        image: recipe.image,
        gallery_images: [],
        ingredients: [],
        steps: [],
        total_time: "Non précisé",
        servings: "Non précisé",
        difficulty: "Non précisée",
        video_url: "",
        video_embed_url: "",
        source_url: recipe.url
      });
    } finally {
      setIsLoadingDetail(false);
    }
  }

  // ----------------------------------------------------------
  // OUVERTURE D'UNE RECETTE THEMEALDB
  // ----------------------------------------------------------

  function loadMealDbRecipe(recipe: MealDbRecipe) {
    setSelectedRecipe(null);
    setSelectedMarmitonRecipe(null);
    setSelectedMealDbRecipe(recipe);
    setDetailError("");
    setGalleryIndex(0);
  }

  // ----------------------------------------------------------
  // FERMETURE DES FENÊTRES
  // ----------------------------------------------------------

  function closeDetails() {
    setSelectedRecipe(null);
    setSelectedMarmitonRecipe(null);
    setSelectedMealDbRecipe(null);
    setDetailError("");
    setGalleryIndex(0);
  }

  function clearMarmitonSearch() {
    setHasSearchedMarmiton(false);
    setMarmitonResults([]);
    setMarmitonError("");
    setIsSearchingMarmiton(false);

    setHasSearchedMealDb(false);
    setMealDbResults([]);
    setMealDbError("");
    setIsSearchingMealDb(false);
  }

  // ----------------------------------------------------------
  // GALERIE
  // ----------------------------------------------------------

  const currentImages = selectedMarmitonRecipe
    ? [
        selectedMarmitonRecipe.image,
        ...selectedMarmitonRecipe.gallery_images
      ].filter(Boolean)
    : [];

  function nextImage() {
    if (currentImages.length === 0) return;

    setGalleryIndex((current) =>
      (current + 1) % currentImages.length
    );
  }

  function previousImage() {
    if (currentImages.length === 0) return;

    setGalleryIndex((current) =>
      (current - 1 + currentImages.length) % currentImages.length
    );
  }

  // ==========================================================
  // AFFICHAGE
  // ==========================================================

  return (
    <main className="recuisine">

      {/* ================================================== */}
      {/* BARRE SUPÉRIEURE */}
      {/* ================================================== */}

      <header className="recuisine-topbar">
        <button className="recuisine-back" onClick={onClose}>
          <ArrowLeft size={20} />
          <span>Retour au bureau</span>
        </button>

        <div className="recuisine-brand">
          <div className="recuisine-brand-icon">
            <CookingPot size={25} />
          </div>

          <div>
            <strong>Cuisine</strong>
            <span>La cuisine, tout simplement.</span>
          </div>
        </div>

        <button
          className={`recuisine-favorites-button ${
            showFavorites ? "active" : ""
          }`}
          onClick={() => {
            setShowFavorites(!showFavorites);
            clearMarmitonSearch();
          }}
        >
          <Heart
            size={19}
            fill={showFavorites ? "currentColor" : "none"}
          />

          <span>Mes favoris ({favorites.length})</span>
        </button>
      </header>

      {/* ================================================== */}
      {/* HERO */}
      {/* ================================================== */}

      <section className="recuisine-hero">
        <div className="recuisine-hero-copy">
          <div className="recuisine-eyebrow">
            <Sparkles size={15} />
            DES IDÉES POUR SE RÉGALER
          </div>

          <h1>
            Qu'est-ce qu'on
            <br />
            <span>cuisine aujourd'hui ?</span>
          </h1>

          <p>
            Découvrez des recettes simples et savoureuses,
            à votre rythme.
          </p>

          <div className="recuisine-search">
            <Search size={22} />

            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setMarmitonError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  searchInternet();
                }
              }}
              placeholder="Un plat, un ingrédient…"
              aria-label="Rechercher une recette ou un ingrédient"
            />

            {search && (
              <button
                className="recuisine-clear-search"
                onClick={() => {
                  setSearch("");
                  clearMarmitonSearch();
                }}
                aria-label="Effacer"
              >
                <X size={18} />
              </button>
            )}

            <button
              className="recuisine-search-button"
              onClick={searchInternet}
              disabled={isSearchingMarmiton}
            >
              {isSearchingMarmiton
                ? "Recherche..."
                : "Rechercher"}

              <Search size={16} />
            </button>
          </div>

          <div className="recuisine-search-hint">
            <Globe size={14} />
            Recherche sur Internet et dans le carnet de recettes
          </div>
        </div>

        <div className="recuisine-hero-art">
          <div className="recuisine-hero-plate"><Salad size={104} strokeWidth={1.5} color="#6a9a4f" /></div>
          <span className="recuisine-floating one"><Apple size={28} color="#d9503f" /></span>
          <span className="recuisine-floating two"><Carrot size={28} color="#e58a2b" /></span>
          <span className="recuisine-floating three"><Leaf size={28} color="#4f9a56" /></span>
        </div>
      </section>

      {/* ================================================== */}
      {/* CONTENU PRINCIPAL */}
      {/* ================================================== */}

      <section className="recuisine-content">

        {/* ================================================= */}
        {/* RÉSULTATS MARMITON */}
        {/* ================================================= */}

        {hasSearchedMarmiton && (
          <section className="marmiton-results">

            <div className="recuisine-section-heading">
              <div>
                <span className="recuisine-small-label">
                  RECHERCHE INTERNET
                </span>

                <h2>Recettes Marmiton</h2>

                <p>
                  {isSearchingMarmiton
                    ? "Recherche des recettes en cours..."
                    : `${marmitonResults.length} recette${
                        marmitonResults.length > 1 ? "s" : ""
                      } trouvée${
                        marmitonResults.length > 1 ? "s" : ""
                      }`}
                </p>
              </div>

              <div className="recuisine-heading-icon">
                <Globe size={24} />
              </div>
            </div>

            {isSearchingMarmiton && (
              <div className="marmiton-loading">
                <div className="marmiton-spinner" />
                <p>Recherche des meilleures recettes...</p>
              </div>
            )}

            {marmitonError && !isSearchingMarmiton && (
              <div className="marmiton-error">
                <span><TriangleAlert size={22} /></span>

                <div>
                  <strong>
                    {marmitonResults.length === 0
                      ? "Recherche impossible ou sans résultat"
                      : "Information"}
                  </strong>

                  <p>{marmitonError}</p>

                  <button
                    onClick={searchInternet}
                    className="marmiton-retry-button"
                  >
                    <RotateCcw size={15} />
                    Réessayer
                  </button>
                </div>
              </div>
            )}

            {!isSearchingMarmiton &&
              marmitonResults.length > 0 && (
                <>
                  <div className="recuisine-grid">
                    {marmitonResults.map((recipe) => (
                      <article
                        className="recipe-card"
                        key={recipe.id}
                      >
                        <button
                          className="recipe-card-main"
                          onClick={() =>
                            loadMarmitonRecipe(recipe)
                          }
                        >
                          <div className="recipe-image-wrap">
                            {recipe.image ? (
                              <img
                                src={cardImage(recipe.image)}
                                alt={recipe.title}
                                loading="lazy"
                                decoding="async"
                                onError={(event) => {
                                  event.currentTarget.style.display =
                                    "none";
                                }}
                              />
                            ) : (
                              <div className="marmiton-image-placeholder">
                                <Utensils size={38} strokeWidth={1.6} />
                              </div>
                            )}

                            <span className="recipe-category">
                              Marmiton
                            </span>
                          </div>

                          <div className="recipe-card-body">
                            <h3>{recipe.title}</h3>

                            <p>
                              Ouvrir la fiche de cette recette
                              directement dans Cuisine.
                            </p>

                            <div className="recipe-meta">
                              <span>
                                <BookOpen size={15} />
                                Lire la recette
                              </span>
                            </div>
                          </div>
                        </button>
                      </article>
                    ))}
                  </div>

                  <div className="marmiton-attribution">
                    Les recettes et leurs contenus originaux
                    appartiennent à leurs auteurs et à Marmiton.
                    Les fiches originales restent accessibles
                    depuis chaque recette.
                  </div>
                </>
              )}

            <button
              className="marmiton-clear-button"
              onClick={clearMarmitonSearch}
            >
              <X size={16} />
              Fermer les résultats Internet
            </button>
          </section>
        )}

        {/* ================================================= */}
        {/* RÉSULTATS THEMEALDB */}
        {/* ================================================= */}

        {hasSearchedMealDb && (
          <section className="mealdb-results">

            <div className="recuisine-section-heading">
              <div>
                <span className="recuisine-small-label">
                  CUISINE INTERNATIONALE
                </span>

                <h2>Recettes du monde</h2>

                <p>
                  {isSearchingMealDb
                    ? "Recherche des recettes internationales..."
                    : `${mealDbResults.length} recette${
                        mealDbResults.length > 1 ? "s" : ""
                      } trouvée${
                        mealDbResults.length > 1 ? "s" : ""
                      }`}
                </p>
              </div>

              <div className="recuisine-heading-icon">
                <Globe size={24} />
              </div>
            </div>

            {isSearchingMealDb && (
              <div className="marmiton-loading">
                <div className="marmiton-spinner" />
                <p>Recherche dans la cuisine internationale...</p>
              </div>
            )}

            {mealDbError && !isSearchingMealDb && (
              <div className="marmiton-error">
                <span><Info size={22} /></span>
                <p>{mealDbError}</p>
              </div>
            )}

            {!isSearchingMealDb && mealDbResults.length > 0 && (
              <div className="recuisine-grid">
                {mealDbResults.map((recipe) => (
                  <article
                    className="recipe-card"
                    key={recipe.id}
                  >
                    <button
                      className="recipe-card-main"
                      onClick={() => loadMealDbRecipe(recipe)}
                    >
                      <div className="recipe-image-wrap">
                        {recipe.image ? (
                          <img
                            src={cardImage(recipe.image)}
                            alt={recipe.title}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="marmiton-image-placeholder">
                            <Utensils size={38} strokeWidth={1.6} />
                          </div>
                        )}

                        <span className="recipe-category">
                          {recipe.area || "International"}
                        </span>
                      </div>

                      <div className="recipe-card-body">
                        <h3>{recipe.title}</h3>

                        <p>
                          {recipe.description ||
                            recipe.category ||
                            "Une recette à découvrir."}
                        </p>

                        <div className="recipe-meta">
                          <span>
                            <BookOpen size={15} />
                            Lire la recette
                          </span>
                        </div>
                      </div>
                    </button>
                  </article>
                ))}
              </div>
            )}

            <div className="marmiton-attribution">
              Recettes internationales fournies par TheMealDB.
            </div>
          </section>
        )}

        {/* ================================================= */}
        {/* CARNET DE RECETTES */}
        {/* ================================================= */}

        <div className="recuisine-section-heading">
          <div>
            <span className="recuisine-small-label">
              LE CARNET DE RECETTES
            </span>

            <h2>
              {showFavorites
                ? "Mes recettes préférées"
                : "À découvrir"}
            </h2>

            <p>
              {filteredRecipes.length} recette
              {filteredRecipes.length > 1 ? "s" : ""}
              {" "}disponible
              {filteredRecipes.length > 1 ? "s" : ""}
            </p>
          </div>

          <div className="recuisine-heading-icon">
            <BookOpen size={24} />
          </div>
        </div>

        {/* CATÉGORIES */}

        <div className="recuisine-categories">
          {categories.map((item) => (
            <button
              key={item}
              className={category === item ? "selected" : ""}
              onClick={() => setCategory(item)}
            >
              {item === "Toutes" ? (
                <Utensils size={17} />
              ) : item === "Entrées" ? (
                <Leaf size={17} />
              ) : (
                <ChefHat size={17} />
              )}

              {item}
            </button>
          ))}
        </div>

        {/* GRILLE */}

        {filteredRecipes.length > 0 ? (
          <div className="recuisine-grid">
            {filteredRecipes.map((recipe) => (
              <article
                className="recipe-card"
                key={recipe.id}
              >
                <button
                  className="recipe-card-main"
                  onClick={() => {
                    setSelectedRecipe(recipe);
                    setSelectedMarmitonRecipe(null);
                    setSelectedMealDbRecipe(null);
                    setDetailError("");
                  }}
                >
                  <div className="recipe-image-wrap">
                    <img
                      src={cardImage(recipe.image)}
                      alt={recipe.title}
                      loading="lazy"
                      decoding="async"
                    />

                    <span className="recipe-category">
                      {recipe.category}
                    </span>
                  </div>

                  <div className="recipe-card-body">
                    <h3>{recipe.title}</h3>
                    <p>{recipe.description}</p>

                    <div className="recipe-meta">
                      <span>
                        <Clock3 size={15} />
                        {recipe.duration} min
                      </span>

                      <span>
                        <Users size={15} />
                        {recipe.servings} pers.
                      </span>
                    </div>
                  </div>
                </button>

                <button
                  className={`recipe-favorite ${
                    favorites.includes(recipe.id)
                      ? "is-favorite"
                      : ""
                  }`}
                  onClick={() =>
                    toggleFavorite(recipe.id)
                  }
                  aria-label={
                    favorites.includes(recipe.id)
                      ? "Retirer des favoris"
                      : "Ajouter aux favoris"
                  }
                >
                  <Heart
                    size={19}
                    fill={
                      favorites.includes(recipe.id)
                        ? "currentColor"
                        : "none"
                    }
                  />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="recuisine-empty">
            <div><Utensils size={46} strokeWidth={1.5} /></div>

            <h3>Aucune recette trouvée</h3>

            <p>
              Essayez un autre ingrédient ou choisissez
              une autre catégorie.
            </p>

            <button
              onClick={() => {
                setSearch("");
                setCategory("Toutes");
                setShowFavorites(false);
                clearMarmitonSearch();
              }}
            >
              Voir toutes les recettes
            </button>
          </div>
        )}
      </section>

      {/* ================================================== */}
      {/* FOOTER */}
      {/* ================================================== */}

      <footer className="recuisine-footer">
        <span>
          <CookingPot size={17} />
          Cuisine pour ClairOS
        </span>

        <span>De bonnes idées, simplement.</span>
      </footer>

      {/* ================================================== */}
      {/* DÉTAIL RECETTE LOCALE */}
      {/* ================================================== */}

      {selectedRecipe && (
        <div
          className="recipe-detail-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDetails();
            }
          }}
        >
          <section className="recipe-detail">
            <button
              className="recipe-detail-close"
              onClick={closeDetails}
              aria-label="Fermer"
            >
              <X size={22} />
            </button>

            <div className="recipe-detail-image">
              <img
                src={selectedRecipe.image}
                alt={selectedRecipe.title}
              />
            </div>

            <div className="recipe-detail-content">
              <span className="recuisine-small-label">
                {selectedRecipe.category.toUpperCase()}
              </span>

              <h2>{selectedRecipe.title}</h2>

              <p className="recipe-detail-description">
                {selectedRecipe.description}
              </p>

              <div className="recipe-detail-meta">
                <span>
                  <Clock3 size={17} />
                  {selectedRecipe.duration} minutes
                </span>

                <span>
                  <Users size={17} />
                  {selectedRecipe.servings} personnes
                </span>

                <span>
                  <ChefHat size={17} />
                  {selectedRecipe.difficulty}
                </span>
              </div>

              <h3>Les ingrédients</h3>

              <ul className="recipe-ingredients">
                {selectedRecipe.ingredients.map(
                  (ingredient) => (
                    <li key={ingredient}>
                      {ingredient}
                    </li>
                  )
                )}
              </ul>

              <h3>La préparation</h3>

              <ol className="recipe-steps">
                {selectedRecipe.steps.map(
                  (step, index) => (
                    <li key={`${index}-${step}`}>
                      <span>{index + 1}</span>
                      {step}
                    </li>
                  )
                )}
              </ol>

              <div className="recipe-detail-actions">
                <button
                  className="recipe-save-button"
                  onClick={() =>
                    toggleFavorite(selectedRecipe.id)
                  }
                >
                  <Heart
                    size={18}
                    fill={
                      favorites.includes(selectedRecipe.id)
                        ? "currentColor"
                        : "none"
                    }
                  />

                  {favorites.includes(selectedRecipe.id)
                    ? "Dans mes favoris"
                    : "Ajouter aux favoris"}
                </button>

                <button
                  className="recipe-source-button"
                  onClick={() =>
                    openSource(selectedRecipe.source)
                  }
                >
                  Voir la recette originale
                  <ExternalLink size={17} />
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ================================================== */}
      {/* FICHE DÉTAILLÉE THEMEALDB */}
      {/* ================================================== */}

      {selectedMealDbRecipe && (
        <div
          className="recipe-detail-overlay mealdb-detail-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDetails();
            }
          }}
        >
          <section className="recipe-detail mealdb-detail">

            <button
              className="recipe-detail-close"
              onClick={closeDetails}
              aria-label="Fermer"
            >
              <X size={22} />
            </button>

            <div className="recipe-detail-image">
              {selectedMealDbRecipe.image ? (
                <img
                  src={selectedMealDbRecipe.image}
                  alt={selectedMealDbRecipe.title}
                />
              ) : (
                <div className="marmiton-image-placeholder large">
                  <Utensils size={64} strokeWidth={1.5} />
                </div>
              )}
            </div>

            <div className="recipe-detail-content">

              <span className="recuisine-small-label">
                CUISINE INTERNATIONALE
              </span>

              <h2>{selectedMealDbRecipe.title}</h2>

              {selectedMealDbRecipe.description && (
                <p className="recipe-detail-description">
                  {selectedMealDbRecipe.description}
                </p>
              )}

              <div className="recipe-detail-meta">
                <span>
                  <Clock3 size={17} />
                  {selectedMealDbRecipe.duration > 0
                    ? `${selectedMealDbRecipe.duration} minutes`
                    : "Durée non précisée"}
                </span>

                <span>
                  <Users size={17} />
                  {selectedMealDbRecipe.servings || "Portions non précisées"}
                </span>

                <span>
                  <ChefHat size={17} />
                  {selectedMealDbRecipe.difficulty || "Non précisée"}
                </span>
              </div>

              {selectedMealDbRecipe.area && (
                <p>
                  <strong>Origine :</strong>{" "}
                  {selectedMealDbRecipe.area}
                </p>
              )}

              {selectedMealDbRecipe.category && (
                <p>
                  <strong>Catégorie :</strong>{" "}
                  {selectedMealDbRecipe.category}
                </p>
              )}

              {selectedMealDbRecipe.ingredients.length > 0 && (
                <>
                  <h3>Les ingrédients</h3>

                  <ul className="recipe-ingredients">
                    {selectedMealDbRecipe.ingredients.map(
                      (ingredient, index) => (
                        <li key={`${index}-${ingredient}`}>
                          {ingredient}
                        </li>
                      )
                    )}
                  </ul>
                </>
              )}

              {selectedMealDbRecipe.steps.length > 0 ? (
                <>
                  <h3>La préparation</h3>

                  <ol className="recipe-steps">
                    {selectedMealDbRecipe.steps.map(
                      (step, index) => (
                        <li key={`${index}-${step}`}>
                          <span>{index + 1}</span>
                          {step}
                        </li>
                      )
                    )}
                  </ol>
                </>
              ) : (
                <div className="marmiton-error">
                  <span><Info size={22} /></span>
                  <p>
                    Les étapes de préparation ne sont pas disponibles.
                    Consultez la recette originale.
                  </p>
                </div>
              )}

              <div className="recipe-detail-actions">
                <button
                  className="recipe-source-button"
                  onClick={() =>
                    openSource(selectedMealDbRecipe.source)
                  }
                >
                  Voir la recette originale
                  <ExternalLink size={17} />
                </button>
              </div>

              {selectedMealDbRecipe.video_url && (
                <div className="recipe-detail-actions">
                  <button
                    className="recipe-source-button"
                    onClick={() =>
                      openSource(selectedMealDbRecipe.video_url)
                    }
                  >
                    Voir la vidéo
                    <Play size={17} />
                  </button>
                </div>
              )}

              <div className="marmiton-attribution">
                Source : TheMealDB.
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ================================================== */}
      {/* CHARGEMENT D'UNE RECETTE MARMITON */}
      {/* ================================================== */}

      {isLoadingDetail && (
        <div className="recipe-detail-overlay">
          <section className="marmiton-detail-loading">
            <button
              className="recipe-detail-close"
              onClick={closeDetails}
              aria-label="Fermer"
            >
              <X size={22} />
            </button>

            <Loader2
              size={48}
              className="marmiton-loading-icon"
            />

            <h2>Ouverture de la recette</h2>

            <p>
              Cuisine récupère les ingrédients, les
              étapes et les photos...
            </p>
          </section>
        </div>
      )}

      {/* ================================================== */}
      {/* DÉTAIL RECETTE MARMITON */}
      {/* ================================================== */}

      {selectedMarmitonRecipe && !isLoadingDetail && (
        <div
          className="recipe-detail-overlay marmiton-detail-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDetails();
            }
          }}
        >
          <section className="recipe-detail marmiton-detail">

            <button
              className="recipe-detail-close"
              onClick={closeDetails}
              aria-label="Fermer"
            >
              <X size={22} />
            </button>

            {/* IMAGE PRINCIPALE */}

            <div className="recipe-detail-image marmiton-main-image">
              {currentImages.length > 0 ? (
                <>
                  <img
                    src={currentImages[galleryIndex]}
                    alt={selectedMarmitonRecipe.title}
                  />

                  {currentImages.length > 1 && (
                    <>
                      <button
                        className="marmiton-gallery-arrow left"
                        onClick={previousImage}
                        aria-label="Photo précédente"
                      >
                        <ChevronLeft size={25} />
                      </button>

                      <button
                        className="marmiton-gallery-arrow right"
                        onClick={nextImage}
                        aria-label="Photo suivante"
                      >
                        <ChevronRight size={25} />
                      </button>

                      <span className="marmiton-gallery-counter">
                        {galleryIndex + 1} / {currentImages.length}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <div className="marmiton-image-placeholder large">
                  <Utensils size={64} strokeWidth={1.5} />
                </div>
              )}
            </div>

            <div className="recipe-detail-content">

              <span className="recuisine-small-label">
                RECETTE MARMITON
              </span>

              <h2>{selectedMarmitonRecipe.title}</h2>

              {selectedMarmitonRecipe.description && (
                <p className="recipe-detail-description">
                  {selectedMarmitonRecipe.description}
                </p>
              )}

              {/* MÉTADONNÉES */}

              <div className="recipe-detail-meta">
                <span>
                  <Clock3 size={17} />
                  {selectedMarmitonRecipe.total_time}
                </span>

                <span>
                  <Users size={17} />
                  {selectedMarmitonRecipe.servings}
                </span>

                <span>
                  <ChefHat size={17} />
                  {selectedMarmitonRecipe.difficulty}
                </span>
              </div>

              {/* MINIATURES */}

              {currentImages.length > 1 && (
                <div className="marmiton-gallery">
                  {currentImages.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      className={
                        galleryIndex === index
                          ? "active"
                          : ""
                      }
                      onClick={() => setGalleryIndex(index)}
                    >
                      <img
                        src={image}
                        alt={`Photo ${index + 1}`}
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* ERREUR */}

              {detailError && (
                <div className="marmiton-error">
                  <span><TriangleAlert size={22} /></span>
                  <p>{detailError}</p>
                </div>
              )}

              {/* INGRÉDIENTS */}

              {selectedMarmitonRecipe.ingredients.length > 0 && (
                <>
                  <h3>Les ingrédients</h3>

                  <ul className="recipe-ingredients">
                    {selectedMarmitonRecipe.ingredients.map(
                      (ingredient, index) => (
                        <li key={`${index}-${ingredient}`}>
                          {ingredient}
                        </li>
                      )
                    )}
                  </ul>
                </>
              )}

              {/* ÉTAPES */}

              {selectedMarmitonRecipe.steps.length > 0 && (
                <>
                  <h3>La préparation</h3>

                  <ol className="recipe-steps">
                    {selectedMarmitonRecipe.steps.map(
                      (step, index) => (
                        <li key={`${index}-${step}`}>
                          <span>{index + 1}</span>
                          {step}
                        </li>
                      )
                    )}
                  </ol>
                </>
              )}

              {/* VIDÉO */}

              {(selectedMarmitonRecipe.video_url ||
                selectedMarmitonRecipe.video_embed_url) && (
                <section className="marmiton-video-section">
                  <h3>
                    <Play size={19} />
                    Vidéo de la recette
                  </h3>

                  {safeVideoEmbed(
                    selectedMarmitonRecipe.video_embed_url
                  ) ? (
                    <iframe
                      src={safeVideoEmbed(
                        selectedMarmitonRecipe.video_embed_url
                      )}
                      title={`Vidéo ${selectedMarmitonRecipe.title}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : selectedMarmitonRecipe.video_url.startsWith(
                      "https://"
                    ) ? (
                    <video
                      src={selectedMarmitonRecipe.video_url}
                      controls
                      preload="metadata"
                    >
                      Votre navigateur ne peut pas lire cette vidéo.
                    </video>
                  ) : (
                    <p>
                      Une vidéo est mentionnée sur la recette
                      originale.
                    </p>
                  )}
                </section>
              )}

              {/* AUCUNE DONNÉE EXTRAITE */}

              {selectedMarmitonRecipe.ingredients.length === 0 &&
                selectedMarmitonRecipe.steps.length === 0 && (
                  <div className="marmiton-error">
                    <span><Info size={22} /></span>

                    <p>
                      Les détails complets ne sont pas
                      disponibles pour cette recette.
                      Consultez sa fiche originale.
                    </p>
                  </div>
                )}

              {/* ACTIONS */}

              <div className="recipe-detail-actions">
                <button
                  className="recipe-source-button"
                  onClick={() =>
                    openSource(
                      selectedMarmitonRecipe.source_url
                    )
                  }
                >
                  Voir sur Marmiton
                  <ExternalLink size={17} />
                </button>
              </div>

              <div className="marmiton-attribution">
                Source : Marmiton. La fiche originale reste
                la référence pour les contenus et les
                éventuelles mises à jour.
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
