# BRYSS AI

Assistant IA créé par **Issam Akdi et Bryana Lebon**.

## Ce que contient le projet
- `index.html` : l'application (interface, robot guide Bry, 29 langues, installable)
- `server.js` : le moteur IA (aucune dépendance, Node.js 18+). La clé API reste sur le serveur.
- `config.js` : l'adresse de ton serveur (à remplir une fois le serveur en ligne)
- `manifest.webmanifest`, `sw.js`, `icon*` : installation comme une appli
- `tools/` + `.github/` : génération facultative de voix naturelles

## Moteur IA (gratuit avec Gemini)
1. Crée une clé sur https://aistudio.google.com/apikey
2. Héberge `server.js` sur un service qui exécute Node.js (Render, Railway…).
   - Commande de démarrage : `npm start`
   - Variable d'environnement : `AI_API_KEY` = ta clé
3. Ouvre `config.js` et mets l'adresse du serveur :
   `window.BRYSS_API_URL = "https://ton-serveur.onrender.com";`
4. L'indicateur en haut de l'appli passe de « Démo » à « En ligne ».

Variables facultatives : `AI_MODEL` (défaut `gemini-3.5-flash`), `AI_BASE_URL` (tout service compatible OpenAI),
`ALLOWED_ORIGINS` (défaut `https://issam-akdi.github.io`), `LIMIT_PER_MINUTE`, `LIMIT_PER_DAY`, `LIMIT_GLOBAL_PER_DAY`.

Remarque : avec l'offre gratuite de Gemini, Google indique que les données envoyées peuvent servir à améliorer ses produits.

## Tester en local
`AI_API_KEY=ta_cle node server.js` puis http://localhost:3000

## Déjà inclus
- Robot guide « Bry » + animation de bienvenue (une seule fois, bouton « Passer »), 29 langues, voix en option
- Application installable (PWA)
- Historique local, export .txt, dictée vocale, thème clair
- Réponses de l'IA avec mise en forme (gras, code)
- Protection : clé jamais envoyée au navigateur, limites d'usage par personne et par jour

## À développer ensuite
Recherche web, génération d'images, lecture des PDF, comptes utilisateurs, mémoire synchronisée, abonnements.
