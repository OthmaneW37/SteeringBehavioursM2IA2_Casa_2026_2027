# 11 – Le Gardien du Brouillard

Un combat de boss de type *Souls*, vu de dessus, dans une arène fermée. Vous jouez un chevalier ; face à vous,
le **Gardien du Brouillard**. Le boss n'est pas programmé à la main : ses décisions viennent d'un **réseau de
neurones** entraîné par **algorithme génétique**, c'est-à-dire par sélection naturelle. Le réseau choisit, et
les steering behaviors de Reynolds exécutent ces choix :
- `seek` et `arrive` pour s'approcher (en spirale) et tourner autour du joueur (vers un point en avance sur le
  cercle centré sur le joueur) ;
- `flee` pour reculer ;
- `evade` pour esquiver ;
- une **prédiction** de la position du joueur pour la ruée, comme `pursue` ;
- `wander` pour errer quand le joueur est loin ;
- un **évitement d'obstacles**, qui permet de contourner les piliers et la brume.

## Lancer

Ouvrir `index.html` via un serveur local, par exemple `python -m http.server` dans ce dossier, puis aller sur
`http://localhost:8000`. p5.js et les polices sont chargés en local depuis `libraries/` : aucune ressource
externe (voir [`CREDITS.md`](CREDITS.md)).

Le jeu s'ouvre sur l'**écran titre** : le Gardien combat le joueur robot en fond, dans le brouillard, et un
menu sur parchemin propose **Nouvelle partie**, **Continuer** (si un combat est en cours), **Entraîner**,
**Panthéon**, **Laboratoire** et **Options**. Navigation à la souris ou au clavier (↑ ↓ et Entrée), avec
des fondus au noir entre les écrans. Au premier combat, un **tutoriel** de 5 cartes présente les commandes ;
on peut le revoir depuis les Options, où se trouve aussi la **fenêtre d'aide** (« Comment ça marche ? »).

| Touche | Action |
|---|---|
| ZQSD, WASD ou flèches | se déplacer (verrouillé : avancer vers le boss, reculer, tourner autour de lui) |
| J / K | attaque légère / attaque lourde (plus lente, plus forte, plus fatigante) |
| Espace | roulade : `evade` loin du boss, 0,3 s d'invulnérabilité |
| E | boire une fiole d'Estus (soin de 25 PV, 1 s presque immobile) |
| L ou Tab | verrouiller la caméra sur le boss (lock-on) |
| G | mode debug (aussi par la case des Options) |
| Échap | menu de pause : reprendre, recommencer, choisir l'adversaire, Options, retour au titre |
| R / P | recommencer le combat / pause rapide |

La touche D sert à se déplacer, d'où le choix de G pour le debug. Une action demandée pendant une autre est
gardée 0,25 s puis jouée, comme le tampon d'entrée des jeux Souls.

## Les mécaniques

### Le chevalier

| Mécanique | Règle |
|---|---|
| Endurance | Attaquer et rouler fatiguent ; sans endurance, on ne peut plus rien faire. Elle revient après 0,5 s de repos. |
| Roulade | `evade` loin du boss pendant 0,4 s, dont **0,3 s d'invulnérabilité**. |
| **Fioles d'Estus** | 2 fioles par défaut (curseur de 0 à 5). Boire prend **1 s**, pendant laquelle on avance à peine. Le soin de 25 PV arrive à 0,6 s : **un coup reçu avant interrompt la gorgée et la fiole est perdue**. On les récupère au feu de camp. |
| **Taches de sang** | À chaque mort, une tache marque l'endroit et la cause (« vaincu par la ruée »). Elles sont gardées d'une session à l'autre (8 au plus). |

### Le boss : trois techniques

| Technique | Télégraphe | Effet |
|---|---|---|
| Hallebarde | cône rouge pendant 0,6 s | coup devant lui (22 PV), puis 1 s de récupération |
| **Ruée** | ligne rouge pendant 0,5 s | charge en ligne droite (20 PV au contact), puis 1,2 s de récupération. Le boss vise la position **prédite** du joueur (position + vitesse × 0,4 s, comme `pursue`) et fige sa visée 0,15 s avant de partir : changer de direction au dernier moment fait rater la charge. |
| **Souffle du brouillard** | cercle vert pendant 0,6 s | une **nappe de brume** apparaît là où le joueur sera dans 0,5 s. Elle dure 6 s, brûle 10 PV par seconde (même pendant la roulade) et ralentit (vitesse × 0,55). Au plus 3 nappes : la plus ancienne disparaît. |

Chaque technique a sa propre attente (cooldown) : 1,5 s, 5 s et 7 s. **Phase enragée** (vie ≤ 30 %) : aura
rouge, vitesse × 1,35 et toutes les attentes × 0,55. Le nom de la technique préparée s'affiche au-dessus du
boss (« Ruée ! »).

La hallebarde ne se lève que si le joueur est **à portée + 15 px** : le boss ne frappe pas l'air depuis
l'autre bout de l'arène. La ruée et le souffle, techniques à distance, restent toujours possibles.

### Le boss bouge, esquive et riposte

| Mécanique | Règle |
|---|---|
| **Déplacement latéral** | Le boss tourne autour du joueur avec les comportements du cours : il vise un point **en avance sur le cercle centré sur le joueur** (`orbitPoint`), avec `arrive` en approche (il arrive en spirale puis tourne au lieu de s'arrêter) et avec `seek` sinon. |
| **Il rôde** | Sans ordre latéral, il tourne lentement autour du joueur et change de sens toutes les 3 s : il ne reste **jamais planté** à regarder le joueur. |
| **Esquive** | Quand le joueur prépare ou porte un coup : `evade` pendant 0,35 s, puis 3 s d'attente. |
| **Riposte** | Une esquive où il n'est pas touché rend sa hallebarde **prête aussitôt** (« Riposte ! »). Un coup levé dans les 0,5 s qui suivent et qui touche est une **riposte qui touche**. |
| **Anti-camping** | Un boss dont le centre reste à moins de 110 px de deux murs à la fois est dans un **coin**. Son compteur monte d'1 s par seconde dans le coin et redescend de 2 s par seconde ailleurs ; à **6 s, le brouillard le dévore** : il meurt, et toute sa vie restante compte comme dégâts reçus. Le coin s'assombrit en violet et un compte à rebours s'affiche. Une 16e entrée du réseau lui donne ce compteur. |

### Les piliers en ruine

4 piliers par défaut (curseur de 0 à 6, scénarios « Arène sans piliers » et « Arène en ruines »). Ce sont des
entités `Pillar` (sous-classe de `Vehicle`, immobile) :
- on ne les traverse pas : le combat repousse les corps sur leur bord, comme le mur de l'arène ;
- le boss et le joueur robot les contournent avec l'**évitement d'obstacles** de Reynolds (`avoidZones`) ;
- un pilier entre l'attaquant et sa cible **pare le coup** (« paré par le pilier ») ;
- il coupe la **ligne de vue** : le joueur robot s'y **cache pour boire** et se reposer, le boss doit venir le débusquer ;
- une **ruée** qui en percute un **étourdit le boss 1,6 s** (étoiles au-dessus de lui) et fissure le pilier.
  Au deuxième choc, le pilier s'effondre jusqu'à la fin du combat. Attirer la ruée dans un pilier est donc
  une vraie tactique pour le joueur ; le boss à états, lui, ne charge pas à travers un pilier.

## Le cerveau du boss

**Réseau** : 16 entrées → 16 neurones cachés sigmoïdes → 6 sorties sigmoïdes (`NeuralNetwork.js` de l'exemple 9b),
soit 16 × 16 + 16 + 16 × 6 + 6 = **374 paramètres** que l'algorithme génétique fait évoluer.

| Entrées (toutes dans [0, 1]) | Sorties |
|---|---|
| distance au joueur, angle du joueur par rapport au cap du boss | **déplacement** : > 0,5 approche (`arrive` en spirale), < 0,5 recul (`flee`), l'écart à 0,5 donne la vitesse |
| vitesse, endurance et **vie** du joueur | **hallebarde** (> 0,6, si le joueur est à portée) |
| joueur **vulnérable** (il boit, ou récupère après une attaque) | **esquive** (> 0,6, si le joueur attaque) : `evade` |
| **le joueur attaque** (préparation ou frappe de son coup) | **ruée** (> 0,6) |
| vie du boss | **souffle** (> 0,6) |
| attentes de la hallebarde, de la ruée, du souffle et de **l'esquive** | **latéral** : tourner autour du joueur dans un sens ou l'autre (`seek` vers un point en avance sur le cercle) ; près de 0,5, il rôde |
| rayons à −45° et à +45° vers le premier obstacle (**mur ou pilier**) | |
| **abri** : un pilier coupe la ligne de vue entre le boss et le joueur | |
| **danger du coin** : compteur de l'anti-camping / 6 s | |

Si plusieurs techniques dépassent le seuil, la plus forte sortie passe en premier, à condition d'être prête.
**Sans décision du réseau** : `wander` quand le joueur est hors du rayon de détection, évitement des piliers,
confinement (`stayInside`) près des murs.

**Boss écrit à la main** (référence) : une machine à états `attente` → `attaque` → `recul`. En attente, il
tourne autour du joueur (sens changé toutes les 2,5 s). Il esquive dès que le joueur attaque. Dès qu'il est
libre, il souffle sur un joueur qui boit, charge un joueur lointain s'il n'y a pas de pilier sur la
trajectoire, et souffle à moyenne distance.

### Pourquoi le boss restait planté, et ce qui a changé

Mesure sur 30 combats contre le joueur robot : « immobile » = vitesse sous 0,3 px par pas alors qu'il est
libre (ni technique, ni esquive, ni étourdi) et que le joueur est dans son rayon.

| | Boss fourni avant | Boss fourni maintenant |
|---|---|---|
| Immobile | **97 %** de ce temps | **16 %** |
| Distance parcourue par combat | 79 px | 386 px |
| Victoires (30 combats) | 37 % | 53 % |
| Morts dans un coin | (pas de règle) | 0 % |

Trois causes, toutes corrigées :
1. **La décision « rester sur place » faisait `arrive(sa propre position)`** : il freinait et se contentait de
   tourner pour faire face au joueur. Désormais il rôde ; une 6e sortie lui permet de choisir de tourner
   autour du joueur (`seek` vers un point en avance sur le cercle).
2. **`arrive` vers le point de garde l'arrêtait net** une fois à distance d'attaque. Il vise maintenant un
   point en avance sur son cercle de garde (`orbitPoint`) : il tourne autour du joueur.
3. **Il enchaînait les coups de hallebarde dans le vide** (95 % du combat, planté pendant chaque coup), parce
   que le joueur robot finissait par entrer dans le cône. La hallebarde ne se lève plus que si le joueur est
   à portée.

### L'esquive : ce que l'évolution a appris, et pas appris

C'est l'expérience la plus instructive du projet, en trois temps.

1. **Sans récompense, pas d'esquive.** Le réseau ne voyait pas quand le joueur attaquait : il a maintenant
   cette entrée. Pourtant, le boss entraîné n'esquivait pas. Forcer l'esquive sur son cerveau faisait
   **chuter ses victoires de 34 % à 10 %** : sa stratégie est la pression au contact, et esquiver le fait
   reculer. **L'évolution n'apprend que ce qui rapporte.** Le boss à états, qui tourne autour du joueur puis
   frappe, en profite (5 esquives et 3,5 ripostes par combat).
2. **Récompenser l'esquive : triche sur la récompense.** Avec + 15 points par riposte (esquive réussie), les
   boss ont appris à esquiver… sans plus jamais chercher à gagner : 7 ripostes rapportaient 105 points, plus
   que la victoire (100). Plusieurs populations finissaient à 0 % de victoires, et le Geôlier ne frappait plus
   du tout (12,8 esquives par combat, 0 coup). C'est un cas classique de *reward hacking*.
3. **Récompenser la riposte qui touche : plus de triche, mais pas d'esquive.** La note ne donne plus + 15 que
   pour une riposte suivie d'un coup qui touche. On ne peut plus tricher (chaque bonus est un vrai coup), et
   aucune population ne s'effondre. Mais l'esquive n'émerge plus : il faudrait réussir d'un coup l'esquive
   **et** le coup qui touche, ce qu'un cerveau au hasard ne fait presque jamais. Même un petit bonus de 3 par
   esquive (essayé dans une copie, sans pouvoir dépasser la victoire) donne le même champion.

Conséquence : avec les boss fournis, **aucun boss appris n'esquive**. Le Panthéon a eu un temps une recette
« la Brute », la note de référence sans bonus de riposte, pour montrer la différence. Elle a été retirée :
le bonus ne s'étant jamais déclenché, la Brute et le Gardien avaient suivi exactement la même évolution et
obtenu le **même cerveau**. Cette égalité est elle-même la preuve que le bonus n'a rien changé.

## L'interface

| Écran | Ce qu'on y fait |
|---|---|
| **Titre** | Menu principal sur parchemin, combat de fond assombri. |
| **Combat** | Plein écran, HUD façon Souls : vie (avec la traînée « fantôme ») et endurance en haut à gauche, fioles d'Estus dessous, morts en haut à droite, barre et nom du boss en bas. Bandeaux animés « VOUS ÊTES MORT » et « ENNEMI VAINCU ». **Échap** : menu de pause. |
| **Laboratoire** | Les outils de recherche, en onglets : Duels, Entraîner, Comparer, Panthéon (détaillés ci-dessous). |
| **Options** (fenêtre) | Aide, tutoriel, mode debug, les 9 scénarios et les 11 réglages avancés. |

La logique de l'interface est dans des modules purs et testés : `screens.js` (écrans et fondus),
`titleMenu.js` (menu), `tutorial.js` (cartes et mémorisation), `hudLayout.js` (disposition du HUD à toutes
les tailles d'écran) et `banners.js` (courbes d'animation des bandeaux). Le rendu ne modifie jamais l'état du
jeu.

## Les outils

| Outil | Ce qu'on voit |
|---|---|
| ⚔️ **Combat** | Vous affrontez le champion de votre entraînement, le boss écrit à la main, ou un boss du Panthéon (adversaire choisi dans le menu de pause). |
| 🎬 **Démonstration et duels** | Deux combats côte à côte contre le même joueur robot, avec la même graine. Par défaut : un boss qui n'a rien appris contre le champion. Avec deux boss du Panthéon, c'est un **duel** (voir plus bas). On choisit aussi le joueur robot affronté. |
| 🧬 **Entraîner** | On choisit une **recette d'entraînement**, puis on suit l'évolution génération par génération. Deux courbes : les victoires du champion à son examen, et la note des boss, lissée. En direct, le champion affronte le joueur robot. Le bouton « Ajouter le champion au Panthéon » le garde. |
| 📊 **Comparer** | Les deux boss jouent les mêmes 50 combats, sur des graines jamais vues à l'entraînement. Le résultat donne le taux de victoire, la durée, les dégâts, les techniques utilisées et les fioles bues. **C'est la mesure à retenir.** |
| 🏛️ **Panthéon** | Le tournoi croisé : chaque boss du Panthéon affronte 4 joueurs robots différents, sur les mêmes combats. |

**Mode debug** :
- les 16 entrées et les 6 sorties du réseau en direct, avec leurs seuils ;
- l'état du boss, le compteur du coin et les attentes de ses techniques et de son esquive ;
- le cercle de détection : jaune, rouge quand le joueur est dedans ;
- la ligne de vue (pointillés si un pilier cache le joueur), la portée d'attaque, les rayons vers les
  obstacles, la vitesse, et le cercle du `wander` de `vehicle.js`.

## Le Panthéon : des boss entraînés différemment

Tous les boss du Panthéon ont le même cerveau 16-16-6, le même algorithme génétique et le même nombre de
générations (120, avec 4 combats par boss). Seule la **recette d'entraînement** change (`doctrines.js`) :
- la **note** : les mêmes termes que la fitness, avec d'autres poids ;
- l'**adversaire** : une des 4 **épreuves** (`trials.js`), c'est-à-dire un réglage du joueur robot.

| Boss | Note | Adversaire à l'entraînement |
|---|---|---|
| Le Gardien | référence : infligés × 100, reçus × −100, victoire + 100, coup dans le vide − 4, riposte qui touche + 15 | référence (40 % de bonnes réactions, 2 fioles) |
| Le Bourreau | infligés × 200, reçus × −30 : il compte surtout ce qu'il inflige | référence |
| Le Spectre | infligés × 60, reçus × −220 : il compte surtout ce qu'il encaisse | référence |
| Le Chasseur | référence | expert (60 % de bonnes réactions, frappe toutes les 0,7 s) |
| L'Opportuniste | référence | débutant (35 %, frappe toutes les 1,5 s) |
| Le Geôlier | référence − 30 par gorgée d'Estus réussie par le chevalier | buveur (3 fioles) |

Le Gardien est le boss fourni (`pretrainedBoss.js`). Les autres sont dans `pretrainedPantheon.js`, générés par
`node tools/pretrain-pantheon.mjs` (environ 20 minutes par recette). Chaque recette a été entraînée avec deux
graines (7 et 13) ; on a gardé celle qui gagne le plus sur **100 combats d'examen neufs** (graines 960000 et
suivantes, utilisées nulle part ailleurs), car l'examen de 30 combats ne départageait pas. Vous pouvez aussi
ajouter au Panthéon le champion de votre entraînement : au plus 6 boss ajoutés, gardés dans le navigateur.

### Le tournoi croisé

Chaque boss affronte chaque épreuve sur les **mêmes 30 combats** (graines 7000 et suivantes, jamais utilisées
ailleurs). Le résultat est une grille de taux de victoire. La case encadrée est l'adversaire de l'entraînement
du boss ; ★ marque le meilleur boss de chaque colonne. À droite, le **style** de chaque boss : coups de
hallebarde, ruées, souffles et esquives par combat, dégâts encaissés, fioles bues par le chevalier.

Résultat avec les boss fournis :

| Boss | Débutant | Référence | Expert | Buveur | Moyenne | Ruées | Souffles | Esquives | Morts dans un coin |
|---|---|---|---|---|---|---|---|---|---|
| Boss écrit à la main | 57 % | 47 % | 13 % | 37 % | 38 % | 1,1 | 0,3 | 5,8 | 16 % |
| Le Gardien | 47 % | 37 % | 23 % | 20 % | 32 % | 1,1 | 3,1 | 0 | 0 % |
| Le Bourreau | 40 % | 37 % | **37 %** | 23 % | 34 % | 0 | 3,3 | 0 | 0 % |
| Le Spectre | **60 %** | **50 %** | 20 % | 30 % | **40 %** | 0 | 0 | 0 | 5 % |
| Le Chasseur | 20 % | 27 % | 23 % | 7 % | 19 % | 2,1 | 4,1 | 0 | 0 % |
| L'Opportuniste | 43 % | 40 % | 17 % | 23 % | 31 % | 0 | 2,8 | 0 | 0 % |
| Le Geôlier | 20 % | 20 % | 13 % | 10 % | 16 % | 0 | 2,0 | 0 | 0 % |

Ce que le tournoi montre :
- **L'anti-camping a été appris** : aucun boss appris ne meurt dans un coin (0 à 5 %), alors que le boss à
  états, qui ne sait pas que la règle existe, y meurt dans 16 % des combats.
- **Les styles diffèrent** : le Spectre (puni quand il est touché) ne charge ni ne souffle, et c'est le plus
  polyvalent ; le Chasseur, entraîné contre l'expert, charge et souffle le plus.
- **Le boss à états reste le plus solide en moyenne** (38 %) face à des joueurs robots variés : la plupart
  des boss appris se sont spécialisés contre le joueur robot de leur entraînement.
- **Limites honnêtes** : aucun boss n'esquive (voir « L'esquive » plus haut) ; le Chasseur et le Geôlier,
  entraînés contre les joueurs robots les plus durs, restent faibles.

### Pourquoi les boss ne se battent pas entre eux

Leur cerveau a appris à **lire un chevalier** : son endurance, ses fioles, sa vulnérabilité. Face à un autre
boss, ces entrées n'auraient plus de sens. Les boss s'affrontent donc en **duel**, contre le même chevalier,
dans le mode Démonstration (`Demo.roundWinner`). À chaque manche :
1. le boss qui tue le chevalier bat celui qui ne le tue pas, et un match nul bat une défaite ;
2. si les deux le tuent, le plus **rapide** gagne (au moins 0,5 s d'écart, sinon égalité) ;
3. si aucun ne le tue, gagne celui qui a infligé le plus de dégâts.

## L'entraînement

1. 50 boss, chacun avec son réseau, aux poids tirés au hasard au départ.
2. Chaque boss joue **2 combats** (4 pour les boss fournis) sans rendu contre le **joueur robot** (`scriptedPlayer.js`), un adversaire
   reproductible. Pour chaque technique du boss, il décide une fois, avec une probabilité fixe (40 % par
   défaut), s'il réagira bien :
   - hallebarde : roulade 0,12 s avant la frappe ;
   - ruée : il sort de la ligne, puis roule ;
   - souffle : il s'écarte.

   Il contourne toujours les nappes et les piliers (évitement d'obstacles) et **boit ses fioles à l'abri** :
   boss loin, en longue récupération, ou caché derrière un pilier. Il punit la récupération du boss, se repose quand il est fatigué et attaque à
   intervalles réguliers.
3. **Fitness** : dégâts infligés (en % de la vie du joueur, brume comprise) − dégâts reçus (en % de la vie du
   boss), + 100 si le boss gagne, − 4 par attaque dans le vide (le souffle n'en compte pas), + 15 par riposte
   qui touche. Mourir dans un coin compte toute la vie restante comme dégâts reçus.
4. **Génération suivante** : 1 élite, les autres boss sont des copies mutées de parents choisis par tournoi.
5. **Champion validé** : les 2 meilleurs de chaque génération passent un examen de 30 combats fixes. Le
   champion n'est remplacé que par un boss qui gagne plus souvent à cet examen.

### Ce que les nouvelles mécaniques changent à l'entraînement

- Le nombre de **fioles** du joueur robot est un réglage d'entraînement : plus il en a, plus il faut au boss
  de dégâts pour gagner. Le scénario « Sans fiole » le montre.
- Le boss a des entrées pour **punir** : la vie du joueur et l'indicateur « vulnérable » (en train de boire).
- Les stratégies apprises **dépendent de l'adversaire**. Dans nos essais :
  - contre un robot qui réagit bien à 35 ou 40 % des techniques, la hallebarde seule suffit, et le champion
    n'utilise qu'elle ;
  - à 45 %, un champion a combiné hallebarde et souffle ;
  - avec une ruée moins risquée, un autre n'utilisait que la ruée, 17 fois par combat.

  Le mode Comparer affiche les techniques utilisées, pour le constater.

### Boss pré-entraîné et équilibre

`pretrainedBoss.js` contient un boss entraîné sous Node avec les réglages par défaut (4 piliers), sur
120 générations, avec **4 combats par boss** au lieu de 2. Deux graines ont été entraînées (7 et 13) ; la
graine 7 l'emporte sur 100 combats d'examen neufs (44 % contre 33 %) :

```bash
node tools/pretrain.mjs 120 7 4
```

L'entraînement dure environ 20 minutes sous Node. Le script charge les scripts dans le contexte principal de
Node, car un contexte `vm` isolé était 15 fois plus lent. Il retient le meilleur entre le champion et les
5 meilleurs de la dernière génération, mesuré sur 30 combats neufs.

Résultats sur les mêmes 50 combats (mode Comparer), avec les réglages par défaut (robot à 40 %, 2 fioles,
4 piliers) :

| Boss | Victoires | Durée moyenne | Morts dans un coin |
|---|---|---|---|
| Boss écrit à la main | 42 % | 37 s | 14 % |
| Boss pré-entraîné fourni | 50 % | 28 s | 0 % |

Ces chiffres sont reproductibles sous Node : mêmes graines, même résultat. **Dans le navigateur, le boss à
états obtient 40 %** au lieu de 42 % : son `wander` utilise le générateur aléatoire du vrai p5.js, qui n'est
pas celui des tests. Le résultat dépend beaucoup de la graine de l'entraînement : la graine 13 a donné un boss
à 24 %. Sur 220 combats, l'écart entre le boss fourni et le boss à états reste faible (environ 44 % contre
40 %).

### Sauvegarde

- **Automatique**, dans le navigateur : population, génération, courbe, champion. Elle se fait au plus toutes
  les 5 s, et aussi à la fermeture de la page.
- **Fichier JSON** : « Exporter » et « Importer ». Un fichier importé est entièrement vérifié.
- **Format version 4** : cerveau 16-16-6. Les sauvegardes des **versions 2** (cerveau 12-16-5, d'avant les
  piliers) et **3** (cerveau 15-16-6, d'avant l'anti-camping) sont **converties** : poids nuls pour les
  nouvelles entrées, sortie latérale neutre si elle manquait. Les boss jouent donc comme avant, en rôdant au
  lieu de rester plantés ; le champion repasse l'examen avec les nouvelles règles. Un entraînement de
  600 générations n'est pas perdu. La version 1 (cerveau 8-16-3) est refusée avec un message clair.
- La **recette** de l'entraînement est sauvegardée. Une sauvegarde plus ancienne, sans recette, reprend avec
  celle du Gardien.
- Le **Panthéon** est sauvegardé à part (`gardienDuBrouillard.pantheon.v1`). Une entrée invalide est ignorée,
  avec un message.

## Scénarios

9 préréglages :
1. Référence
2. Joueur robot expert
3. Joueur robot débutant
4. Entraînement rapide
5. Mutation forte
6. Sans fiole d'Estus
7. Boss myope
8. Arène sans piliers
9. Arène en ruines (6 piliers)

Un scénario ne liste que ce qui change. Modifier un curseur à la main fait passer le menu sur « Personnalisé ».

## Fichiers

| Fichier | Rôle |
|---|---|
| `vehicle.js` | **Fourni, protégé** : copie intacte de `4-Wander/vehicle.js`. Un test vérifie son empreinte. |
| `steering.js` | `flee` de Reynolds, `evade`, `stayInside`, point de garde, **`orbitPoint`** (cible en avance sur le cercle, pour `seek` et `arrive`), **`avoidZones`** (évitement des nappes et des piliers), `distanceToSegment`. |
| `combat.js` | Règles : vies, endurance, roulade, fioles, techniques du boss (préparation, frappe, récupération), cône de frappe. |
| `arena.js` | Arène : bords, coins (anti-camping), rayons vers les murs et les piliers, mur physique, emplacements des piliers, sol, brouillard et coins violets (décor). |
| `NeuralNetwork.js` | Copie du réseau de l'exemple 9b. |
| `campfire.js`, `mistPatch.js`, `pillar.js`, `bloodstain.js`, `player.js`, `boss.js` | Les entités : feu de camp, nappe de brume, pilier, tache de sang, chevalier, boss. Toutes `extends Vehicle`. |
| `bossBrain.js`, `handBoss.js`, `scriptedPlayer.js`, `humanController.js` | Cerveau du boss appris (16-16-6) et conversion des anciens cerveaux, boss à états, joueur robot, clavier. |
| `fight.js` | Un combat à pas fixe de 1/60 s, sans dessin : nappes, brûlure, piliers (collision, coup paré, ruée écrasée), anti-camping, cause de la mort. |
| `fitness.js`, `genetic.js`, `training.js`, `trainingStore.js` | Note, tournoi et élitisme, entraînement avec champion validé, sauvegarde. |
| `comparison.js`, `demo.js` | Comparaison sur 50 combats, démonstration côte à côte. |
| `settings.js`, `scenarios.js` | Plages des curseurs (`RangeError` hors plage) et préréglages. |
| `trials.js`, `doctrines.js` | Épreuves (réglages du joueur robot) et recettes d'entraînement (poids de la note et épreuve). |
| `pantheon.js`, `tournament.js` | Panthéon (boss fournis et ajoutés, plafond, sauvegarde) et tournoi croisé boss × épreuves. |
| `pretrainedBoss.js`, `pretrainedPantheon.js` | Données : le Gardien et les autres boss du Panthéon. |
| `fitnessChart.js`, `debugPanel.js`, `hud.js`, `camera.js`, `menuToggle.js` | Courbes, debug, HUD, bandeaux et effets, caméra de verrouillage, panneau du laboratoire masquable. |
| `screens.js`, `titleMenu.js`, `tutorial.js`, `hudLayout.js`, `banners.js` | Interface : écrans et fondus, menu titre, tutoriel, disposition du HUD, animation des bandeaux. |
| `libraries/fonts/` | Polices UnifrakturMaguntia et Cinzel (SIL OFL 1.1) et leurs licences. |
| `sketch.js` | Câblage p5 : aucune règle de comportement. |
| `tools/pretrain.mjs`, `tools/pretrain-pantheon.mjs` | Pré-entraînement sous Node : le Gardien, puis un boss par autre recette, avec le tournoi affiché à la fin. |

Les scripts de `index.html` portent un numéro de version (`?v=13`) : après une mise à jour, le navigateur
recharge les nouveaux fichiers. Si un comportement semble ancien, faites **Ctrl + F5**.

## Tests

```bash
node --test tests/*.test.mjs
```

Aucune dépendance (Node 18 ou plus récent), aléatoire à graine fixe. 92 tests :

| Fichier | Ce qui est vérifié |
|---|---|
| `entities.test.mjs` | `vehicle.js` intact ; `flee`, `evade` et confinement ; télégraphe de 0,6 s ; cône de frappe ; endurance ; invulnérabilité de 0,3 s ; `arrive` près des bords ; boss (attentes, phase enragée, esquive, `wander`, `arrive`, `flee`). |
| `mechanics.test.mjs` | Fioles (soin exact à 0,6 s, interruption, charges) ; brume (brûlure, ralentissement, plafond, durée) ; `avoidZones` ; ruée (visée prédite, visée figée, contact unique, attente) ; souffle ; ordre des techniques ; boss à états ; joueur robot ; taches de sang ; combat complet reproductible. |
| `learning.test.mjs` | Cerveau 16-16-6 et ses 16 entrées ; conversion des cerveaux 12-16-5 et 15-16-6 ; décisions ; mutation ; tournoi et élitisme ; fitness (riposte qui touche) ; combats ; entraînement ; comparaison. |
| `saving.test.mjs` | Champion validé ; sauvegarde complète et reprise ; fichiers invalides, dont la version 1 ; conversion des versions 2 et 3 ; stockage bloqué ; démonstration. |
| `obstacles.test.mjs` | Piliers (collision, fissures, effondrement, abri) ; ligne de vue et rayons ; `orbitPoint` avec `seek` ; piliers dans le combat ; coup paré ; ruée écrasée et étourdissement ; esquive, riposte et riposte qui touche ; portée de la hallebarde ; mesure d'immobilité ; abri du joueur robot ; boss à états ; anti-camping (coin, compteur, mort, note). |
| `pantheon.test.mjs` | Épreuves et recettes (plages, valeurs) ; note qui suit la recette, changement à la génération suivante, champion réexaminé ; recette sauvegardée ; boss fournis ; ajout, plafond, retrait, stockage invalide ; règles du duel ; tournoi (mêmes combats, budget, profil, rang). |
| `interface.test.mjs` | Écrans et fondus (changement au noir complet, dernier ordre gagnant, pas de fondu relancé), menu titre (boucle, entrées inactives, Continuer), tutoriel (cartes, mémorisation, stockage bloqué), HUD dans l'écran à toutes les tailles, bandeaux, page (menu, onglets, fenêtres, polices locales et créditées). |
| `ui.test.mjs` | Identifiants HTML, plages des curseurs, ordre et version des scripts, scénarios, clavier, caméra, courbes, debug, menu, équilibre du boss fourni (sur les 50 combats du mode Comparer). |

Chaque règle importante a été cassée volontairement, sur une copie du dossier, pour vérifier qu'au moins un
test échoue (28 sabotages pour les piliers, l'esquive, la riposte qui touche, le déplacement latéral,
l'anti-camping, les nouvelles entrées et la conversion des sauvegardes).
