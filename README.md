# MyNakaExtension

Extension Chromium (Brave, Chrome) qui relie [Naka](https://naka.cx) et
[SensCritique](https://www.senscritique.com) : à la fin d'un film ou d'un épisode regardé sur Naka,
l'œuvre est marquée « vue » sur SensCritique et une note est proposée sans quitter Naka. Les listes
« à voir » des deux sites sont synchronisées.

Le projet est au stade de l'échafaudage : la conception est écrite, le code de l'extension commence
par une phase de vérification technique (voir `NOTES.md`).

## Démarrage

Prérequis : Node.js 22 ou plus récent. Depuis la racine du dépôt :

```bash
npm install
npm run check
```

`npm run check` lance le lint, les tests et le build. Le résultat est dans `dist/`.

## Charger l'extension dans Brave ou Chrome

1. Ouvrir `brave://extensions` (ou `chrome://extensions`).
2. Activer le « Mode développeur ».
3. Cliquer sur « Charger l'extension non empaquetée » et choisir le dossier `dist/`.

## Développement

| Commande | Rôle |
|---|---|
| `npm run lint` | Biome (style et erreurs) puis vérification des types avec `tsc` |
| `npm test` | Tests unitaires avec Vitest |
| `npm run build` | Construit `dist/` |
| `npm run check` | Lint, tests et build à la suite |

## Architecture

L'extension n'a pas de serveur. Elle utilise les API internes des deux sites depuis le navigateur,
avec la session déjà ouverte de l'utilisateur. La logique pure (seuil de fin de visionnage,
correspondance de titres, synchronisation des listes) est séparée du code qui touche aux pages et à
l'API `chrome.*`, pour pouvoir être testée sans navigateur.

## Git

Commits au format Conventional Commits : `<type>(<portée>): <résumé à l'impératif>`, 72 caractères
au maximum, avec les types `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`,
`style` et `revert`. Un commit correspond à un changement complet et testé.
