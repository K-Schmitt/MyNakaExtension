# Politique de confidentialité

[English](PRIVACY.md)

Dernière mise à jour : 2026-11-16. S’applique à MyNakaExtension 1.0.0 et aux versions suivantes.

MyNakaExtension n’a pas de serveur. Le développeur ne reçoit aucune de tes données, et l’extension ne
contient ni statistiques, ni pistage, ni publicité, ni code tiers.

## Ce qui est enregistré

L’extension garde cinq entrées dans le stockage d’extension du navigateur (`chrome.storage.local`) :

| Clé | Contenu |
| --- | --- |
| `state` | Les titres que l’extension a traités : les liens entre un titre Naka et sa fiche SensCritique, les titres terminés, les questions ouvertes (« quel titre est-ce ? », « retirer aussi ? »), les titres qu’elle n’a pas pu relier, et le contenu des deux listes « à voir » au dernier passage. |
| `settings` | Tes réglages (mode simulation, seuils de fin, bloc sur la pause), les comptes liés (ton nom d’utilisateur SensCritique et l’identifiant de ton compte Naka, pour s’arrêter si un autre compte se connecte), le résultat de la dernière synchronisation et de la dernière fin de visionnage, et des compteurs d’écritures par heure. |
| `ratings` | Les notes en attente (la liste « À noter »). |
| `ficheLinks` | Les liens faits à la main entre une fiche Naka et un titre SensCritique, pour l’affichage. |
| `ficheUndo` | La dernière note donnée depuis une fiche Naka et ce qu’elle a remplacé, pour que « Annuler » le remette (10 minutes). |

**Les jetons ne sont jamais enregistrés.** Le jeton de session SensCritique est lu dans ta session
ouverte au moment de chaque requête et ne reste qu’en mémoire ; le jeton Naka reste dans le script de l’extension de l’onglet Naka.
Aucun des deux n’est écrit dans le stockage, un journal, un message d’erreur ou un export. L’extension
ne dépose aucun cookie qui lui soit propre.

## Où c’est enregistré

Sur ton ordinateur seulement, dans le stockage d’extension de ton profil de navigateur. Rien n’est
synchronisé vers d’autres appareils, et les sites web ne peuvent pas le lire.

## Où les données sont envoyées

Seulement à `naka.cx` et `senscritique.com` (`www` et `apollo`), pour ton compte et pour faire ce que
tu as demandé : lire tes listes, marquer un titre vu, donner une note, ajouter ou retirer un titre d’une
liste. Ces requêtes utilisent ta session déjà ouverte sur chaque site, comme si tu les faisais toi-même.
Rien n’est envoyé ailleurs, et rien n’est envoyé au développeur.

## Combien de temps

Jusqu’à ce que tu l’effaces depuis la page de l’extension (« Réinitialiser », « Oublier les comptes
liés », voir plus bas), ou jusqu’à la désinstallation de l’extension, qui supprime son stockage.

## Tes droits

Tout se fait sur la page de l’extension, onglet Réglages, partie « Données enregistrées » :

- **Accès et portabilité** : « Exporter mes données » télécharge un fichier JSON des cinq entrées
  ci-dessus.
- **Effacement** : « Oublier les comptes liés » oublie les comptes liés ; « Réinitialiser » efface
  l’état de synchronisation, les notes en attente, les liens d’affichage et l’enregistrement
  d’annulation (tes réglages, le mode et les comptes liés sont gardés). Désinstaller l’extension efface
  tout.

## Contact

Pour une question sur cette politique : ouvre une issue sur le dépôt GitHub du projet.
