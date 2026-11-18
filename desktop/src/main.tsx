import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applySettings, loadSettings } from './settings'

// Applique tout de suite l'affichage choisi (taille, fond d'écran).
applySettings(loadSettings())

// Dans la version installée, on retire le menu clic droit du navigateur.
if (import.meta.env.PROD) {
  window.addEventListener('contextmenu', (event) => event.preventDefault())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
