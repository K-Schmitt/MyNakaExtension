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
- Pas de dépôt distant pour l'instant : la CI n'a donc pas encore tourné sur GitHub. Elle sera vérifiée
  sur la première pull request.
- Pas de `.portfolio.json` : dépôt non publié et aucun dépôt distant.
- Conditions d'utilisation de Naka et de SensCritique : non lues.

## Leçons apprises

(à compléter au fil du projet)
