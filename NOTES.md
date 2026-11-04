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

## 2026-11-04 — Plan 2 : clients des deux sites et logique de synchronisation

Ce plan ne contient que de la logique et les deux clients. Le branchement dans l'extension, l'interface
et le stockage viennent au Plan 3.

### Décisions
- **Client SensCritique.** Le jeton de la page est envoyé seulement en en-tête `authorization` brut
  vers l'API GraphQL, avec `credentials: "omit"` et sans suivre de redirection. Les messages
  d'erreur sont des textes fixes et ne contiennent jamais le jeton. La page de saison se lit sans
  session ni en-tête. La lecture de l'état d'un titre (vu, dans les envies, type) ne renvoie que ces
  trois valeurs : jamais la note, la date ni l'identifiant de l'utilisateur.
- **Client Naka.** Le jeton n'est envoyé qu'en `Bearer` vers `naka.cx/api/v1`.
- **Lectures en échec fermé.** Une liste lue de façon incomplète, tronquée, avec un doublon ou une
  entrée illisible est refusée, et la synchronisation s'arrête pour ce passage. Une liste manquante
  lue comme vide ferait croire à des retraits.
- **Rapprochement des titres.** Le rapprochement se fait par titre, titre original, année et type
  (film ou série) ; les saisons et les épisodes ne sont jamais pris pour des séries. En cas de doute,
  l'extension pose la question au propriétaire. Tant qu'une question est ouverte, le titre n'est pas
  relié par la synchronisation, et une fin de visionnage n'écrit rien pour lui. Recherches Naka
  limitées (une toutes les 2 secondes), 20 titres au plus par côté et par passage.
- **Synchronisation des listes.**
  - La première synchronisation n'ajoute que.
  - Au plus 10 écritures par passage.
  - Un retrait devient une question, et une question sans réponse ne devient jamais un ajout.
  - L'état mémorisé suit l'état réel des listes : un titre retiré pendant un passage n'est pas remis.
  - Un titre vu des deux côtés avant d'être relié est traité comme s'il avait été relié dès le départ
    (historique des périodes de présence).
  - Un titre que le site refuse toujours passe en dernier, pour ne pas bloquer les autres.
- **Film déjà vu sur SensCritique et présent dans la liste Naka.** Il n'est pas ajouté aux envies :
  la paire est figée et signalée. Choix accepté par le propriétaire le 2026-11-04, comme la question
  posée pour un titre retiré pendant la première synchronisation.
- **Fin de visionnage.**
  - Elle se déclenche à 90 % ou plus, ou sur un « vu » explicite. La progression doit être entre 0 et 1.
  - Pour un film : la paire est figée et enregistrée **avant** toute écriture, pour qu'aucune
    synchronisation ne puisse le remettre dans les envies, même après une panne entre deux
    écritures. Ensuite, retrait des envies s'il y est, « vu » s'il ne l'est pas déjà ; la date
    existante n'est jamais écrasée.
  - Pour un épisode : « vu » sur l'épisode. La série n'est jamais retirée des envies.
  - Dans les deux cas, le type du titre est vérifié sur SensCritique avant toute écriture.

### Rejeté
- Prendre la liste relue après les écritures comme mémoire de l'état : elle effaçait les retraits
  faits par le propriétaire pendant le passage.
- Ne garder que la dernière période de présence d'un titre : ratait les titres reliés tard.
- Ranger un « aucun de ceux-là » parmi les titres non reliés : une écriture pouvait atteindre le titre
  écarté. La question reste ouverte, sans candidat.

### Questions ouvertes (Plan 3)
- Un seul verrou pour les onglets Naka et le service worker, qui chargent et enregistrent le même état.
- Le client de recherche SensCritique, et les titres des candidats à afficher dans « lequel de ces
  titres ? ».
- Lier l'état au compte Naka et au compte SensCritique.
- Vérifié sur le compte le 2026-11-04 :
  - marquer vu un épisode ne retire pas la série des envies ;
  - **noter une série la retire des envies** : le Plan 4 devra la remettre, ou prévenir avant la note ;
  - l'effet d'une note sur une saison n'est pas mesuré.
- Alléger la requête de lecture des envies, qui demande aussi des données personnelles inutiles
  (décision du propriétaire).
- `unmarkDone` n'a pas encore d'usage.

## 2026-11-04 — Plan 3 : le moteur de l'extension

Ce plan branche la logique du Plan 2 dans l'extension : service worker, onglet Naka, détection de fin
de visionnage, page d'état minimale. L'interface complète vient au Plan 4.

### Décisions
- **Une seule file de jobs.**
  - Seul le service worker écrit dans le stockage.
  - Synchronisations, fins de visionnage et changements de mode passent un par un.
  - La page d'état lit l'état sans attendre la file, en lecture seule, et affiche le job en cours.
- **Simulation d'abord pour les listes.**
  - Les ajouts aux listes sont préparés sans être faits, et l'aperçu montre chaque titre avec son
    site.
  - Les fins de visionnage écrivent dans les deux modes.
  - Au plus 10 écritures par passage : l'aperçu ne montre que les 10 premières, et les suivantes
    s'écrivent aux passages suivants sans nouvel aperçu. La confirmation avant le passage en
    écritures actives le dit.
- **Déclencheurs.**
  - Une synchronisation part à l'ouverture d'un onglet Naka, après un changement de « Ma liste »
    (5 s sans nouveau changement) ou sur le bouton « Resynchroniser ».
  - Au moins 15 minutes séparent deux passages automatiques, échecs compris. Un changement de
    « Ma liste » dans cet intervalle attend le déclencheur suivant.
- **Comptes liés.**
  - Le premier passage réussi enregistre le compte SensCritique et le compte Naka.
  - Un autre compte sur l'un des deux sites arrête tout job avant la moindre écriture.
- **Jetons.**
  - Le jeton Naka n'est lu que dans le script isolé de l'onglet Naka et n'est envoyé qu'à
    `naka.cx/api/v1`. Le script de la page ne voit que des identifiants.
  - Le jeton SensCritique est lu depuis la page d'accueil au moment de chaque appel. Il n'est jamais
    stocké, ni mis dans un message ou une erreur.
  - La recherche SensCritique se fait sans session : vérifié le 2026-11-04, elle répond sans jeton.
    Cela évite de charger la page d'accueil à chaque recherche.
- **Onglet Naka.**
  - Un job prend le premier onglet Naka qui répond et s'y tient : la vérification du compte et les
    écritures vont au même onglet.
  - Si cet onglet disparaît en cours de route, les appels Naka suivants échouent aussitôt. Le passage
    enregistre ce qu'il a déjà fait, et le reste est réessayé au passage suivant.
- **Coupe-circuit.**
  - Il se déclenche sur un refus pour trop de requêtes, une session expirée ou un délai dépassé
    (30 s par requête SensCritique, 20 s par appel Naka).
  - Le même type d'appel s'arrête alors pour le reste du job, et la page d'état l'indique.
- **Détection de fin.**
  - Marques de progression à 85, 90, 95 et 99 % : le seuil réglable du Plan 4 devra être l'une
    d'elles.
  - Un échantillon toutes les 5 s, sur des vidéos de 5 minutes au moins dont la durée reste stable à
    2 % près.
  - Après un changement d'épisode, il faut une source vidéo différente, pour que la fin de l'épisode
    précédent ne marque jamais le suivant.
- **Plafond des fins de visionnage.**
  - 30 par heure, une seule en attente par titre, 20 en attente au plus.
  - Un message que l'extension tranche seule (pas assez avancé, ou déjà traité) ne compte pas.
- **Date du « vu ».** C'est la date locale, jamais la date UTC.

### Rejeté
- Interrompre tout le passage quand l'onglet Naka se ferme : les écritures déjà faites n'auraient
  pas été enregistrées.
- Compter chaque message de fin de visionnage dans le plafond : un seul visionnage en envoie jusqu'à
  cinq, et six épisodes courts par heure auraient suffi à le bloquer.
- Faire attendre la page d'état derrière la file : la première synchronisation peut durer plusieurs
  minutes.

### Reporté au Plan 4
- Le réglage du seuil, limité aux quatre marques.
- La note après un visionnage. Les titres à noter ne sont pas encore conservés.
- Remettre une série dans les envies après l'avoir notée, ou prévenir avant la note.
- Oublier les comptes liés.
- Réinitialiser un état enregistré illisible.
- Répondre aux questions et aux retraits, et relier les titres non reliés.
- Aperçu des écritures reportées.
- Le nom du titre dans la ligne de fin de visionnage.

## Leçons apprises

- Pour une logique qui rapproche deux listes au fil des passages, la relecture cas par cas ne suffit
  pas. Une simulation de milliers d'historiques, avec une règle de sécurité dont on vérifie qu'elle
  repère chaque correction retirée, a trouvé plusieurs remises à tort que les relectures avaient
  laissées passer. Une règle de simulation qui recopie la règle du code ne peut pas voir ses trous.
- Un plafond contre les abus se compte sur l'action qui coûte (un appel réseau, une écriture), pas
  sur les messages reçus. Les messages que l'on peut trancher sur place passent gratuitement :
  sinon l'usage normal, qui répète les messages, épuise le plafond.
