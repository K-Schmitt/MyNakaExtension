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

## 2026-11-04 — Recette du Plan 3

La recette dans Brave a validé le moteur :
- 265 films et séries lus dans les envies, soit les 268 envies moins 1 livre et 2 jeux ;
- les fins d'épisode par seuil et par le bouton « vu » de Naka ;
- le passage automatique à l'épisode suivant ;
- la synchronisation après un changement de « Ma liste » ;
- les messages de session expirée et d'onglet absent.

Le 2026-11-04 à 20:11, le propriétaire a passé les listes en écritures actives. Le premier passage a
écrit 10 titres, justes des deux côtés.

Faits appris pendant la recette :
- marquer un épisode vu laisse la série dans les envies ;
- le propriétaire quitte au début du générique, vers 84 % pour un épisode d'« Un Job Mortel ».

## 2026-11-05 — Plan 4a : noter depuis Naka

Ce plan ajoute la note sur SensCritique sans quitter Naka : à la fin d'un visionnage, sur la pause, et
dans une liste « À noter » sur l'accueil. La page de l'extension gagne des réglages.

### Décisions
- **Seuils par type.** 90 % pour un film, 80 % pour un épisode, réglables parmi 80, 85, 90, 95 et
  99 %. Le seuil à 80 % vient de l'habitude du propriétaire de quitter au générique. L'ancien seuil
  unique reste dans l'état enregistré, mais il n'est plus lu.
- **Une note vaut « vu ».** Noter à la pause un titre pas encore vu le marque d'abord vu, comme le
  bouton « vu » de Naka. Le propriétaire l'a validé.
- **Une fiche de note par titre fini**, gardée par l'extension (100 au plus). Elle dit quoi noter :
  le film, ou l'épisode, puis la saison et la série quand elles sont finies.
- **La fin d'une saison se juge sur Naka** (`available-seasons`), qui donne le nombre d'épisodes de
  chaque saison. Si Naka ne répond pas, la liste d'épisodes de SensCritique prend le relais.
- **Moyennes de départ.** La saison propose la moyenne arrondie des notes d'épisodes données par
  l'extension, et la série celle des saisons.
- **Une série pas finie demande confirmation**, dans le bloc lui-même : SensCritique retire de vos
  envies une série que vous notez. Une fenêtre du navigateur aurait fait quitter le plein écran.
- **Le mode simulation ne concerne que les listes.** Une note est un clic sur un titre : elle part
  dans les deux modes.
- **Un clic, une note.**
  - Une note ne part que sur un vrai clic dans un bloc de l'extension, isolé de la page Naka.
  - Un clic n'est pris en compte que 0,4 s après l'apparition du bloc.
  - Après le clic, le bloc reste verrouillé sur « Envoi de la note… » jusqu'à ce que la fiche montre
    la note.
  - Si la note ne part pas, le bloc dit pourquoi.
- **L'extension dit quelles notes sont en cours d'envoi.** Une note qui attend derrière une
  synchronisation reste affichée verrouillée partout, même après un aller-retour sur l'accueil, donc
  un second clic ne la renvoie pas.
- **Vérification des comptes avant chaque note**, comme pour une fin de visionnage.
- **Rien ne gêne le lecteur.**
  - Un clic sur un bloc n'atteint pas le lecteur de Naka.
  - Les blocs restent hors des commandes du bas, et ceux du lecteur se ferment quand on quitte le
    lecteur.
  - L'extension ne met jamais la vidéo en pause.

### Rejeté
- Lire la saison et la série sur SensCritique d'abord : la conception validée juge la fin sur ce que
  Naka propose.
- Fermer le bloc deux secondes après un clic : pendant une synchronisation, la note n'était pas encore
  partie, et un second clic la renvoyait.
- Lire le nombre de saisons dans la réponse SensCritique d'un produit : la valeur ne servait à rien,
  et une valeur inattendue aurait bloqué tout le moteur.

### Reporté au Plan 4b
- Répondre aux titres ambigus (dans le bloc de fin et sur l'accueil) et aux retraits ; relier les
  titres non reliés.
- « Oublier les comptes liés » et « Réinitialiser ».
- Les reprises du Plan 3 :
  - l'année dans l'aperçu ;
  - le message trompeur quand l'onglet change de page ;
  - la fermeture d'un retrait sans objet ;
  - le nom du titre dans la ligne de fin de visionnage.
- Une note donnée à la pause sur un titre ambigu ne part pas : la question passe d'abord.

## 2026-11-05 — Mesure de la couverture des tests

- `npm run coverage` mesure la couverture avec le fournisseur v8 de Vitest (`@vitest/coverage-v8`,
  même version que Vitest). Le rapport HTML va dans `coverage/`, ignoré par git.
- Base de départ : 97,5 % des lignes et 96,9 % des branches de `src/`. Le plus faible est la page de
  l'extension (75 %), dont les fichiers d'entrée ne sont pas chargés par les tests.
- Écarté pour l'instant : un seuil bloquant dans le gate. Il faut d'abord voir comment la mesure
  bouge au fil des plans. Un seuil fixé trop tôt bloquerait sans rien apprendre.

## 2026-11-05 — Recette du Plan 4a

La recette dans Brave a validé les notes depuis Naka :
- le bloc de fin d'un film et d'un épisode, et la note qui part sur SensCritique ;
- la saison proposée après le dernier épisode, avec la moyenne des épisodes ;
- « Plus tard » et la liste « À noter » de l'accueil ;
- le bloc de pause et son réglage « À partir de 50 % » ;
- l'avertissement avant de noter une série pas finie.

Un défaut corrigé après la recette : en haut à droite, le bloc cachait trois boutons du lecteur
(« Voir la fiche », « Créer un clip », « Signaler un problème »). Le lecteur a une barre de
commandes en haut (1 à 5 % de la hauteur) et une en bas (95 à 99 %). Le bloc commence donc à 7 % et
s'arrête au plus à 87 %.

Faits appris pendant la recette :
- noter un épisode ou une saison laisse la série dans les envies ; noter la série l'en retire ;
- Naka sert une adresse vidéo neuve (`blob:`) à chaque chargement, même pour le même film ;
- cocher et décocher « vu » sur Naka passent par le même appel, `PUT /api/v1/history/watched`, avec
  `watched: true` ou `false`. Décocher ne change rien sur SensCritique, et l'extension garde le titre
  comme traité : le Plan 4b le lui fera oublier.

## 2026-11-05 — Plan 4b : les questions et la page de l'extension

Le Plan 4b pose les questions au bon moment et complète la page de l'extension :
- un titre ambigu est demandé dans le bloc de fin ou de pause, avant la note ;
- un retrait fait sur Naka est suivi d'un petit bloc « Retirer aussi de vos envies SensCritique ? » ;
- les autres questions vont dans une partie « Questions » du panneau d'accueil de Naka ;
- la page de l'extension liste les questions et les titres non reliés, avec une recherche pour relier
  un titre à la main ;
- elle ajoute « Oublier les comptes liés », « Réinitialiser » et les « Titres traités » avec « Oublier » ;
- décocher « vu » sur Naka fait oublier le titre traité (demande du propriétaire pendant la recette
  du 4a).

Décisions à connaître :
- Une question garde son titre et ses candidats au moment où elle est posée : l'afficher ne demande
  aucune lecture réseau. Une question enregistrée avant le 4b se repose par « Reposer la question ».
- Une écriture sur un site part d'un seul vrai clic, et le service worker vérifie avant d'écrire :
  un choix doit être un candidat enregistré ; un retrait doit correspondre à une question enregistrée,
  ou, juste après un retrait sur Naka, à une paire reliée que les deux listes contenaient au dernier
  passage. Le travail relit les deux sites avant sa seule écriture ; un retrait devenu sans objet
  n'écrit rien.
- « Non » à un retrait fige la paire : la synchro ne remet pas le titre du côté qu'il a quitté.
- « Aucun de ceux-là » garde la question ouverte, sans candidat, et la liste avec les titres non
  reliés pour une liaison à la main.
- La synchro ferme seule un retrait sans objet (le titre est dans les deux listes ou dans aucune),
  seulement si sa paire est encore reliée telle quelle. Une paire remplacée garde son retrait ouvert,
  comme au Plan 3 : sinon la synchro oubliait le retrait et remettait le titre (trouvé par la
  simulation aléatoire).
- Le bloc après un retrait sur Naka exige les deux présences au dernier passage, sans repli sur
  l'instantané de la synchro : l'instantané garde des paires anciennes, et un faux retrait aurait pu
  retirer des envies un titre remis depuis (trouvé par la simulation aléatoire).
- Un clic sur un bloc n'est pris que 0,4 s après tout redessin qui peut déplacer les boutons : celui
  du bloc, d'un voisin du panneau d'accueil, ou du pliage du panneau. Sans cela, un double-clic pouvait
  tomber sur « Retirer aussi… » d'un autre titre.
- Décocher « vu » depuis un onglet Naka est plafonné à 10 oublis par heure (compte enregistré), une
  seule demande en attente par titre ; « Oublier » sur la page n'a pas de plafond. Un script de la page
  Naka peut imiter ce décochage : sans plafond, il aurait vidé la liste « À noter ».
- « Réinitialiser » enregistre d'abord le mode simulation, puis efface l'état. Il garde les comptes
  liés, les seuils, la pause, les fenêtres de budget et le compteur des réponses.

Écarté :
- Retirer aussi « vu » sur SensCritique quand on le décoche sur Naka : ce serait une écriture que le
  propriétaire n'a pas cliquée dans un bloc de l'extension (idée gardée dans BACKLOG.md).

Limites connues :
- Les données enregistrées ne vont que vers l'avant : après le 4b, une version 4a lit l'état ET les
  réglages comme illisibles (ses lecteurs stricts refusent les nouveaux champs). Le retour en arrière
  passe par l'export de l'étape 0 de la recette.
- Une liste « Ma liste » lue vide refuse un retrait (`naka-list-empty`) : une liste vide ne prouve
  rien. Si elle l'est vraiment, ce retrait se fait à la main sur SensCritique.
- La fermeture automatique d'un retrait suppose que les deux listes soient lues en entier ou pas du
  tout : la liste d'envies est complète ou lève une erreur, « Ma liste » est un seul GET qui refuse
  toute pagination.
- Répondre à une question qui porte une fin de visionnage demande un onglet Naka ouvert : sans lui,
  le titre est relié mais pas marqué vu. La reprise passe par une pause ou la fin du titre sur Naka.
- Une écriture née d'une réponse ou d'une liaison peut attendre plusieurs passages quand d'autres
  écritures sont reportées (10 par passage au plus).

## 2026-11-06 — Saison en cours de diffusion (VisionQuest)

Défaut vu pendant la recette du 4b : l'épisode 7 de VisionQuest passait pour la fin de la saison et de la
série. `available-seasons` ne compte que les épisodes sortis (`{1: 7}`), alors que la fiche du catalogue
annonce `numberOfEpisodes: 8`.

### Décisions

- `NakaItem` lit `numberOfEpisodes`, comme `numberOfSeasons` : un entier positif, sinon absent. Le
  worker le recopie depuis l'onglet.
- Les épisodes annoncés mais pas encore sortis (annoncés moins sortis, jamais négatif) s'ajoutent à la
  saison la plus haute de la liste, et seulement quand le catalogue n'annonce pas de saison plus loin.
  Sinon, ils appartiennent à cette saison non listée.

### Limites connues

- Si Naka n'a pas un épisode déjà sorti d'une saison ancienne d'une série finie, le compte affiché est
  inférieur au compte annoncé. Cet écart ne se distingue pas d'un épisode à venir : la fin de la dernière
  saison n'est alors plus reconnue, et le bloc ne propose que l'épisode (on peut toujours noter la saison
  à la main). On n'écrit rien de faux : on propose moins. Un test fixe ce comportement.

## 2026-11-06 — I2 : relancer une fin échouée faute d'onglet

Constat I2 de la revue finale du Plan 4b. Le propriétaire répond à « Quel titre est-ce ? » depuis la page
de l'extension sans onglet Naka (ou avec une session Naka expirée) : la liaison est faite, mais la fiche
SensCritique n'est pas marquée vue, et la fin est perdue. Elle est désormais gardée et relancée seule.

### Décisions du propriétaire

- D1. La relance compte comme son clic d'origine : elle passe par `finishJob` (pré-contrôle, budget horaire,
  vérification du compte, relecture du catalogue), jamais par un autre chemin d'écriture.
- D2. Aucune limite d'âge.
- D3. Déclencheurs : `no-naka-tab` et `naka-session`.
- D4. Une ligne « en attente d'un onglet Naka » dans « Titres traités ».
- D5. « Annuler » empêche le « vu » ET défait la liaison ; la question revient.
- D6. Si le choix avait évincé la liaison d'un autre titre, « Annuler » la rétablit.

### Choix de l'auteur, relus par le propriétaire

- C1. Au plus 20 fins en attente, la 21ᵉ remplace la plus ancienne ; une clé n'y figure qu'une fois (la plus récente).
- C2. Les échecs qui gardent la fin pendant une relance sont `no-naka-tab`, `naka-session`, `finish-limit` et
  `naka-tab-changed` ; aucun n'a rien écrit.
- C3. Les relances passent après une synchronisation réussie ; le lot s'arrête au premier échec qui garde, donc un
  onglet déconnecté ne brûle pas le budget horaire (chaque tentative y prend une place).
- C4. Une fin dont la paire n'est plus dans `mapping` est retirée sans rien lancer.
- C5. La ligne porte le titre (Naka si connu, sinon SensCritique), « en attente d'un onglet Naka » et « Annuler ».
- C6. « Annuler » retire aussi la paire de `snapshot` et de `retryLast` : sinon la synchro suivante la croirait connue.
- C7. La liaison à la main est hors du champ (elle lit Naka avant d'enregistrer, sans onglet elle échoue sans rien perdre).

### Décisions du plan

- P1. Les relances suivent TOUTE synchronisation qui a tourné et réussi (naka-ready, bouton, liste), pas
  seulement `naka-ready` : la raison de C3 vaut pour chacune. Une synchro espacée ne compte pas (elle ne tourne pas).
- P2. « Réussi » = `lastRun.outcome === "ok"`, sans `error`, et `lastRun.at` au moins égal à l'instant où le
  router a mis la synchro en file.
- P3. « Annuler » fait quitter la ligne à l'instant côté page, et la réponse `handled-titles` omet une clé dont
  l'annulation est encore en file (mémoire du router) : un rechargement ne la ramène pas (leçon du D7).
- P4. `retryFinishes` est facultatif dans `SyncState` (comme `handledTitles`) : `emptyState()` et « Réinitialiser »
  le vident sans changement.

### Arbitrages de mise en œuvre

- `linkedBefore` : une réponse dont la paire choisie était déjà liée enregistre quand même une fin en attente ;
  « Annuler » laisse cette liaison (D6 : l'état d'avant la réponse la contenait déjà) et ne fait que reposer la question.
- Une file, un travail par relance : chaque relance est son propre travail, comme toute fin (un travail épingle un
  onglet Naka). Le router en met un en file après chaque synchro, puis un autre tant que le précédent a retiré son
  entrée et qu'il en reste ; d'autres travaux peuvent passer entre deux relances.
- La simulation aléatoire juge les relances avec l'oracle O17 : une relance ne peut marquer faite qu'une fiche que le
  monde a vue mise en attente par une réponse acceptée, jamais une fiche déjà faite.

### Limites connues

- Les données ne vont que vers l'avant : une version plus ancienne de l'extension ne lit plus un état qui contient
  `retryFinishes` (état illisible, comme pour tout champ inconnu), mais seulement tant qu'une fin attend : la liste
  vide quitte l'état. « Réinitialiser » est la sortie.
- Une relance peut tourner des heures après la réponse (D2, aucune limite d'âge) : la fiche est alors marquée vue
  à ce moment-là, non à la date du visionnage.

## 2026-11-07 — I2 après audit

Un audit d'I2 a trouvé un défaut important (A1) et deux mineurs (A2, A3), corrigés avec le propriétaire.

- **Décocher « vu » sur Naka oublie la fin en attente** (A1) : sinon la synchro suivante marquait le titre vu sur
  SensCritique contre ce geste. La liaison reste. Même quand le budget horaire des oublis venus de Naka est plein,
  la fin en attente est retirée, et rien d'autre : retirer n'écrit jamais nulle part (choix du propriétaire). Un
  script de Naka pourrait donc annuler des fins en attente, que la page cesserait de montrer.
- **Une seule relance attend dans la file** (A2) : plusieurs onglets Naka chargés ensemble relançaient chacun la
  même fin et prenaient chacun une place du budget. Une relance mise en file pendant qu'une autre attend la
  remplace, après la dernière synchro, avec l'heure la plus ancienne. Rejeté : garder la première (elle passait
  avant la deuxième synchro) ou la dernière avec son heure (une synchro date son passage à son début, donc la
  dernière heure seule manquait le succès de la première). Le prix : si une synchro plus récente échoue, la fin
  attend le succès suivant.
- **« Annuler » défait aussi un « garder »** (A3) donné sur la paire pendant l'attente : la question revient
  libre (choix du propriétaire). Une liaison antérieure à la réponse garde le sien.
- **La simulation aléatoire avance son horloge d'1 ms par travail** : deux échecs identiques au même instant
  laissaient des traces identiques, et un oracle prenait la note d'attente pour ancienne. Un test fixe l'égalité
  de l'heure de la synchro et de la relance, que l'horloge ne produit plus.

### Questions ouvertes

- A3 retire toute marque « garder » de la paire, y compris une marque antérieure à la réponse si la paire était
  réglée sans être liée. Personne n'a montré que cet état est atteignable ; sinon, il faudrait la retenir comme
  `linkedBefore`.

## 2026-11-08 — Étape 6 : thème Naka et rangée « À traiter »

Après l'essai de la refonte, le propriétaire a demandé les couleurs de Naka et l'accueil dans la page, pas en
panneau. Décisions (spec du 2026-11-08, P1 à P13) :

- **Une rangée à nous, qui imite Naka** : un `section` inséré dans `.discover-page .dc-sections` juste après
  « Reprendre la lecture », racine fantôme fermée. Rejeté : reprendre les classes de Naka (`dc-head`, `dc-row`) ;
  la moindre mise à jour de Naka la défigurerait, et son carrousel (Embla) ne s'attache pas à nos nœuds.
- **Naka reconstruit la liste à chaque retour sur l'accueil** (sonde du 2026-11-08) : un gardien replace la
  rangée. Il attend « Reprendre » une seconde au plus, car une autre rangée titrée arrive avant elle.
- **Les couleurs sont lues en direct dans Naka** (`var(--color-…, copie)`), la page de l'extension garde la copie.
  Trois teintes restent fixes, car celles de Naka ne passent pas le test de contraste : texte tertiaire, erreur et
  fonds d'alerte.
- **Les affiches ne viennent que des réponses déjà lues** : aucune requête n'est faite pour une affiche. Les
  données stockées ne vérifient que la forme d'une adresse ; la liste des hôtes SensCritique s'applique à
  l'entrée et au dessin. Elle est vide tant que la sonde du propriétaire n'a pas donné l'hôte, et les
  candidats SensCritique montrent alors un cadre neutre.
- **Naka voit les adresses des images** chargées par sa page, jamais le texte des cartes (accepté, P12).
- **Un retrait fait sur l'accueil** devient la première carte de la rangée. Un bloc de retrait garde la place où
  il s'est dessiné, et l'arrivée sur l'accueil ferme un bloc flottant.
- **La rangée retient les clics et les touches** comme le faisait le panneau, mais pas la molette. Quand une
  carte arrive ou part, les autres reçoivent un nouveau délai de grâce au clic.
- **Les blocs du lecteur** ne prennent que les couleurs (P11).

## 2026-11-11 — Fin de visionnage au début du générique

Naka charge lui-même `GET /api/v1/skip-segments` pour chaque épisode (sonde du propriétaire, 2026-11-11 : début du
générique à 95,7 % d'un épisode ; `hit: false` pour un film). Décisions (« construis direct », choix de l'agent) :

- **Aucune requête en plus** : le relais de la page lit une **copie** de cette seule réponse, si elle est ok, et
  n'en transmet que le début du générique, la saison et l'épisode. Jamais un en-tête, jamais le `tmdbId`. C'est la
  première réponse que le relais lit : la règle « la requête et la réponse ne sont jamais touchées » reste vraie
  pour la page (même promesse, même réponse, corps intact).
- **Une fin « générique »** compte comme terminée, quel que soit le seuil réglé, à partir de 80 % de la durée
  seulement (le seuil le plus bas qu'on peut choisir), dans l'onglet et dans le worker. Un générique inventé par
  un script de la page ne fait donc pas mieux qu'un « vu » inventé, risque déjà accepté.
- **Le générique est lié au contenu qui joue** quand il arrive (l'id de la série, saison et épisode ; l'id du
  film) : une autre série ou un autre film n'en hérite jamais. Reçu sans contexte, il est ignoré.
- Sans générique connu, le seuil en pourcentage s'applique comme avant.

## Leçons apprises

- Pour une logique qui rapproche deux listes au fil des passages, la relecture cas par cas ne suffit
  pas. Une simulation de milliers d'historiques, avec une règle de sécurité dont on vérifie qu'elle
  repère chaque correction retirée, a trouvé plusieurs remises à tort que les relectures avaient
  laissées passer. Une règle de simulation qui recopie la règle du code ne peut pas voir ses trous.
- Un plafond contre les abus se compte sur l'action qui coûte (un appel réseau, une écriture), pas
  sur les messages reçus. Les messages que l'on peut trancher sur place passent gratuitement :
  sinon l'usage normal, qui répète les messages, épuise le plafond.
- Un bloc qui écrit sur un vrai compte doit savoir si son écriture attend encore. Une relecture à
  heure fixe ne suffit pas quand la file de l'extension peut être occupée plusieurs minutes. La file,
  qui sait, doit le dire.
- Une simulation aléatoire dont la règle de sécurité juge à partir de ce que le monde simulé a fait
  (ses propres listes, les actions du propriétaire), et non à partir des définitions du code, a trouvé
  deux défauts réels du Plan 4b que les relectures avaient laissés passer : la fermeture d'un retrait
  qui faisait oublier un retrait voulu, et un instantané ancien qui laissait passer un faux retrait.
