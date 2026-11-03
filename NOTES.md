# Notes — journal de décisions

## 2026-10-25 — Initialisation

### Décisions
- **Besoin :** relier Naka et SensCritique (fin de visionnage, notes, listes dans les deux sens).
  Détail et faits relevés sur les deux sites : `docs/superpowers/specs/2026-10-25-naka-senscritique-bridge-design.md`
  (local, non versionné).
- **Qui écrit, qui maintient :** l'agent écrit, le propriétaire relit et maintient. D'où une stack
  lisible et un seul gate : `npm run check`.
- **Navigateur :** Brave (Chromium), Manifest V3, extension non empaquetée.
- **Stack :** TypeScript simple, Vitest, Biome. Pas de bundler tant qu'il n'y a aucun point d'entrée :
  esbuild sera ajouté avec le premier.
- **Pas d'API officielle :** l'extension appelle les API internes des deux sites avec la session de
  l'utilisateur. Elles peuvent changer sans préavis.
- **Séries :** la série n'est jamais retirée de la liste d'envies automatiquement.
- **Retraits de liste :** propagés seulement après confirmation.

### Choix de versions
- Vitest 5.0.5 et non 5.0.3 : avec npm 10.9.4, Vitest 4.x et 5.0.0 à 5.0.3 plantent à l'installation
  (`Cannot read properties of null (reading 'edgesOut')`). La 5.0.5 s'installe. Elle date du
  2026-10-19, soit moins de deux semaines au moment du choix.
- CI : MyCI `node-ci` seul. Pas de Dockerfile, pas de déploiement Coolify (extension locale).
- Node 22 dans `.nvmrc` pour que la CI utilise la même version que la machine de développement
  (le défaut de MyCI est 24).

### Reporté
- Dépôt privé `K-Schmitt/MyNakaExtension` créé le 2026-10-28. CI (MyCI `node-ci`) verte sur la
  pull request #1 et sur `main` le 2026-11-02.
- Pas de `.portfolio.json` : dépôt privé (la page Projets n'affiche que les dépôts publics). À revoir si
  le dépôt devient public.

## 2026-11-01 — Décision phase 0 : go

- Le service worker de l'extension appelle l'API GraphQL de SensCritique avec `fetch` et
  `credentials: "include"` : HTTP 200 et JSON, y compris quand il est sollicité depuis une page Naka,
  mais sur une requête publique en lecture seule. L'envoi de la session du navigateur n'est donc
  pas encore prouvé (l'écriture réversible du Plan 2 le prouvera).
  Un script injecté sur une page SensCritique échoue (`Failed to fetch`, appel entre sous-domaines).
  Architecture retenue : seul le service worker parle à SensCritique, les scripts lui envoient des messages.
- Naka refuse (403) la connexion depuis un navigateur automatisé : le trafic Naka authentifié ne
  s'enregistre pas par script, on le relève à la main dans un navigateur normal.
- Reste à confirmer avec une écriture réversible sur SensCritique (premier travail du Plan 2).
- Conditions d'utilisation de Naka et de SensCritique : non lues.
- L'extension sonde (`spike/probe-extension/`) a été supprimée après la décision ; elle reste dans
  l'historique git au commit 386256b.

## 2026-11-03 — Phase A : l'écriture SensCritique passe par le jeton de la page

- Les écritures sur SensCritique exigent un en-tête `authorization` : la valeur du cookie `SC_AUTH`,
  lue par le service worker dans la page d'accueil, envoyée brute (sans `Bearer`) à l'API,
  `credentials: "omit"`. Prouvé par un ajout puis retrait réversible du film *Batman* (1966).
- Décision du propriétaire : l'extension utilise ce jeton (option A), uniquement vers l'API de
  SensCritique, en mémoire, sans jamais le stocker, l'afficher ni le journaliser. Une revue de sécurité
  est obligatoire pour tout code qui le touche.
- Si SensCritique change son authentification, les écritures s'arrêtent ; les lectures publiques
  continuent. Erreur dédiée à prévoir : « session expirée, reconnectez-vous sur SensCritique ».
- La sonde de phase A a affiché une fois la valeur du jeton (clé de cache GraphQL) ; elle est corrigée.
- Sondes supprimées après usage (hors dépôt : `~/.local/share/mynakaextension-spike/`).
- Inconnu : la limite de recherche de Naka est de 30 requêtes, mais la durée de la fenêtre n'est pas
  annoncée (par défaut : une recherche toutes les 2 secondes).

## Leçons apprises

(à compléter au fil du projet)
