# 11 – Le Gardien du Brouillard

Un combat de boss de type *Souls*, vu de dessus, dans une arène fermée. Vous jouez un chevalier ; face à vous,
le **Gardien du Brouillard**. Le boss n'est pas programmé à la main : ses décisions viennent d'un **réseau de
neurones** entraîné par **algorithme génétique**, c'est-à-dire par sélection naturelle. Le réseau choisit, et
les steering behaviors de Reynolds exécutent ces choix :
- `seek` et `arrive` pour s'approcher ;
- `flee` pour reculer ;
- `evade` pour esquiver ;
- une **prédiction** de la position du joueur pour la ruée, comme `pursue` ;
- `wander` pour errer quand le joueur est loin ;
- un **évitement d'obstacles**, qui permet au joueur robot de contourner la brume.

## Lancer

Ouvrir `index.html` via un serveur local, par exemple `python -m http.server` dans ce dossier, puis aller sur
`http://localhost:8000`. p5.js est chargé en local depuis `libraries/` : aucune ressource externe. Une
**fenêtre d'aide** (« Comment ça marche ? ») s'ouvre à la première visite : elle explique le jeu,
l'apprentissage et le vocabulaire sans prérequis.

| Touche | Action |
|---|---|
| ZQSD, WASD ou flèches | se déplacer (verrouillé : avancer vers le boss, reculer, tourner autour de lui) |
| J / K | attaque légère / attaque lourde (plus lente, plus forte, plus fatigante) |
| Espace | roulade : `evade` loin du boss, 0,3 s d'invulnérabilité |
| E | boire une fiole d'Estus (soin de 25 PV, 1 s presque immobile) |
| L ou Tab | verrouiller la caméra sur le boss (lock-on) |
| G | mode debug (aussi par la case des réglages avancés) |
| R / P | recommencer le combat / pause |

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

## Le cerveau du boss

**Réseau** : 12 entrées → 16 neurones cachés sigmoïdes → 5 sorties sigmoïdes (`NeuralNetwork.js` de l'exemple 9b).

| Entrées (toutes dans [0, 1]) | Sorties |
|---|---|
| distance au joueur, angle du joueur par rapport au cap du boss | **déplacement** : > 0,5 approche (`arrive` à distance d'attaque), < 0,5 recul (`flee`), l'écart à 0,5 donne la vitesse |
| vitesse, endurance et **vie** du joueur | **hallebarde** (> 0,6) |
| joueur **vulnérable** (il boit, ou récupère après une attaque) | **esquive** (> 0,6, si le joueur attaque) : `evade` |
| vie du boss | **ruée** (> 0,6) |
| attentes de la hallebarde, de la **ruée** et du **souffle** | **souffle** (> 0,6) |
| rayons vers le mur à −45° et à +45° | |

Si plusieurs techniques dépassent le seuil, la plus forte sortie passe en premier, à condition d'être prête.
**Sans décision du réseau** : `wander` quand le joueur est hors du rayon de détection, `arrive` vers un point
à distance d'attaque, confinement (`stayInside`) près des murs.

**Boss écrit à la main** (référence) : une machine à états `attente` → `attaque` → `recul`. Dès qu'il est
libre, il souffle sur un joueur qui boit, charge un joueur lointain et souffle à moyenne distance.

## Les cinq modes

| Mode | Ce qu'on voit |
|---|---|
| ⚔️ **Combattre** | Vous affrontez le champion de votre entraînement, le boss écrit à la main, ou un boss du Panthéon. |
| 🎬 **Démonstration et duels** | Deux combats côte à côte contre le même joueur robot, avec la même graine. Par défaut : un boss qui n'a rien appris contre le champion. Avec deux boss du Panthéon, c'est un **duel** (voir plus bas). On choisit aussi le joueur robot affronté. |
| 🧬 **Entraîner** | On choisit une **recette d'entraînement**, puis on suit l'évolution génération par génération. Deux courbes : les victoires du champion à son examen, et la note des boss, lissée. En direct, le champion affronte le joueur robot. Le bouton « Ajouter le champion au Panthéon » le garde. |
| 📊 **Comparer** | Les deux boss jouent les mêmes 50 combats, sur des graines jamais vues à l'entraînement. Le résultat donne le taux de victoire, la durée, les dégâts, les techniques utilisées et les fioles bues. **C'est la mesure à retenir.** |
| 🏛️ **Panthéon** | Le tournoi croisé : chaque boss du Panthéon affronte 4 joueurs robots différents, sur les mêmes combats. |

**Mode debug** :
- les 12 entrées et les 5 sorties du réseau en direct, avec leurs seuils ;
- l'état du boss et les attentes de ses trois techniques ;
- le cercle de détection : jaune, rouge quand le joueur est dedans ;
- la portée d'attaque, les rayons vers les murs, la vitesse, et le cercle du `wander` de `vehicle.js`.

## Le Panthéon : des boss entraînés différemment

Tous les boss du Panthéon ont le même cerveau 12-16-5, le même algorithme génétique, la même population de
départ (graine 7) et le même nombre de générations (40). Seule la **recette d'entraînement** change
(`doctrines.js`) :
- la **note** : les mêmes termes que la fitness, avec d'autres poids ;
- l'**adversaire** : une des 4 **épreuves** (`trials.js`), c'est-à-dire un réglage du joueur robot.

| Boss | Note | Adversaire à l'entraînement |
|---|---|---|
| Le Gardien | référence : infligés × 100, reçus × −100, victoire + 100, coup dans le vide − 4 | référence (40 % de bonnes réactions, 2 fioles) |
| Le Bourreau | infligés × 200, reçus × −30 : il compte surtout ce qu'il inflige | référence |
| Le Spectre | infligés × 60, reçus × −220 : il compte surtout ce qu'il encaisse | référence |
| Le Chasseur | référence | expert (60 % de bonnes réactions, frappe toutes les 0,7 s) |
| L'Opportuniste | référence | débutant (35 %, frappe toutes les 1,5 s) |
| Le Geôlier | référence − 30 par gorgée d'Estus réussie par le chevalier | buveur (3 fioles) |

Le Gardien est le boss fourni (`pretrainedBoss.js`). Les autres sont dans `pretrainedPantheon.js`, généré par
`node tools/pretrain-pantheon.mjs` (environ 6 minutes). Vous pouvez aussi ajouter au Panthéon le champion de
votre entraînement, avec la recette de votre choix : au plus 6 boss ajoutés, gardés dans le navigateur.

### Le tournoi croisé

Chaque boss affronte chaque épreuve sur les **mêmes 30 combats** (graines 7000 et suivantes, jamais utilisées
ailleurs). Le résultat est une grille de taux de victoire. La case encadrée est l'adversaire de l'entraînement
du boss ; ★ marque le meilleur boss de chaque colonne. À droite, le **style** de chaque boss : coups de
hallebarde, ruées et souffles par combat, dégâts encaissés, fioles bues par le chevalier.

Résultat avec les boss fournis :

| Boss | Débutant | Référence | Expert | Buveur | Moyenne | Frappes | Souffles |
|---|---|---|---|---|---|---|---|
| Boss écrit à la main | 23 % | 10 % | 3 % | 10 % | 12 % | 9,9 | 0 |
| Le Gardien | 37 % | 37 % | 13 % | 20 % | 27 % | 22,9 | 0,4 |
| Le Bourreau | 43 % | **47 %** | 17 % | 20 % | 32 % | 23,5 | 0 |
| Le Spectre | 10 % | 10 % | 7 % | 0 % | 7 % | 16,7 | 5,0 |
| Le Chasseur | 20 % | 13 % | **23 %** | 7 % | 16 % | 14,1 | 5,5 |
| L'Opportuniste | **50 %** | 47 % | 17 % | 23 % | 34 % | 23,0 | 0 |
| Le Geôlier | 50 % | 47 % | 13 % | **27 %** | 34 % | 23,0 | 0 |

Ce que le tournoi montre :
- **Chaque colonne est gagnée par le boss entraîné contre ce joueur robot** : L'Opportuniste contre le débutant,
  le Bourreau contre la référence, le Chasseur contre l'expert, le Geôlier contre le buveur.
- **Deux styles sont apparus.** Le Spectre et le Chasseur gardent leurs distances et soufflent la brume
  (5 souffles par combat). Les autres frappent à la hallebarde sans arrêt (environ 23 coups par combat).
- **Une note mal choisie donne un mauvais boss.** Le Spectre, puni surtout quand il est touché, a appris à ne
  pas s'exposer, mais il gagne rarement (7 %).
- **Des recettes différentes peuvent converger.** L'Opportuniste et le Geôlier ont des cerveaux différents mais
  presque le même style : contre ces adversaires, frapper sans arrêt marche bien. C'est une limite honnête du
  résultat : 40 générations et une seule graine par recette.
- Personne n'a écrit ces stratégies : elles viennent uniquement de la note et de l'adversaire.

### Pourquoi les boss ne se battent pas entre eux

Leur cerveau a appris à **lire un chevalier** : son endurance, ses fioles, sa vulnérabilité. Face à un autre
boss, ces entrées n'auraient plus de sens. Les boss s'affrontent donc en **duel**, contre le même chevalier,
dans le mode Démonstration (`Demo.roundWinner`). À chaque manche :
1. le boss qui tue le chevalier bat celui qui ne le tue pas, et un match nul bat une défaite ;
2. si les deux le tuent, le plus **rapide** gagne (au moins 0,5 s d'écart, sinon égalité) ;
3. si aucun ne le tue, gagne celui qui a infligé le plus de dégâts.

## L'entraînement

1. 50 boss, chacun avec son réseau, aux poids tirés au hasard au départ.
2. Chaque boss joue **2 combats** sans rendu contre le **joueur robot** (`scriptedPlayer.js`), un adversaire
   reproductible. Pour chaque technique du boss, il décide une fois, avec une probabilité fixe (40 % par
   défaut), s'il réagira bien :
   - hallebarde : roulade 0,12 s avant la frappe ;
   - ruée : il sort de la ligne, puis roule ;
   - souffle : il s'écarte.

   Il contourne toujours les nappes (évitement d'obstacles) et **boit ses fioles à l'abri** : boss loin, ou
   en longue récupération. Il punit la récupération du boss, se repose quand il est fatigué et attaque à
   intervalles réguliers.
3. **Fitness** : dégâts infligés (en % de la vie du joueur, brume comprise) − dégâts reçus (en % de la vie du
   boss), + 100 si le boss gagne, − 4 par attaque dans le vide (le souffle n'en compte pas).
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

`pretrainedBoss.js` contient un boss entraîné sous Node avec les réglages par défaut (40 générations,
graine 7) :

```bash
node tools/pretrain.mjs 40 7
```

L'entraînement dure environ 1 minute sous Node. Le script charge
les scripts dans le contexte principal de Node, car un contexte `vm` isolé était 15 fois plus lent. Il retient
le meilleur entre le champion et les 5 meilleurs de la dernière génération, mesuré sur 30 combats neufs.

Résultats sur les mêmes 50 combats, avec les réglages par défaut (robot à 40 %, 2 fioles) :

| Boss | Victoires | Durée moyenne |
|---|---|---|
| Boss écrit à la main | 22 % | 34 s |
| Boss pré-entraîné fourni (40 générations, graine 7) | 42 % | 37 s |

Ces chiffres sont reproductibles : mêmes graines, même résultat. Le résultat dépend aussi de la graine de
l'entraînement : 150 générations avec la graine 1 ont donné un boss à 36 %. Avec seulement 2 combats par boss,
le hasard pèse beaucoup, et plus de générations ne garantissent pas un meilleur boss. Dans la version 1, sans fioles ni nouvelles
techniques, le boss appris gagnait 64 % contre 30 % pour le boss à états.

### Sauvegarde

- **Automatique**, dans le navigateur : population, génération, courbe, champion. Elle se fait au plus toutes
  les 5 s, et aussi à la fermeture de la page.
- **Fichier JSON** : « Exporter » et « Importer ». Un fichier importé est entièrement vérifié.
- **Format version 2** : cerveau 12-16-5. Une sauvegarde de la version 1 (cerveau 8-16-3) est refusée avec un
  message clair.
- La **recette** de l'entraînement est sauvegardée. Une sauvegarde plus ancienne, sans recette, reprend avec
  celle du Gardien.
- Le **Panthéon** est sauvegardé à part (`gardienDuBrouillard.pantheon.v1`). Une entrée invalide est ignorée,
  avec un message.

## Scénarios

7 préréglages :
1. Référence
2. Joueur robot expert
3. Joueur robot débutant
4. Entraînement rapide
5. Mutation forte
6. Sans fiole d'Estus
7. Boss myope

Un scénario ne liste que ce qui change. Modifier un curseur à la main fait passer le menu sur « Personnalisé ».

## Fichiers

| Fichier | Rôle |
|---|---|
| `vehicle.js` | **Fourni, protégé** : copie intacte de `4-Wander/vehicle.js`. Un test vérifie son empreinte. |
| `steering.js` | `flee` de Reynolds, `evade`, `stayInside`, point de garde, **`avoidZones`** (évitement des nappes), `distanceToSegment`. |
| `combat.js` | Règles : vies, endurance, roulade, fioles, techniques du boss (préparation, frappe, récupération), cône de frappe. |
| `arena.js` | Arène : bords, rayons vers les murs, mur physique, sol et brouillard (décor). |
| `NeuralNetwork.js` | Copie du réseau de l'exemple 9b. |
| `campfire.js`, `mistPatch.js`, `bloodstain.js`, `player.js`, `boss.js` | Les entités : feu de camp, nappe de brume, tache de sang, chevalier, boss. Toutes `extends Vehicle`. |
| `bossBrain.js`, `handBoss.js`, `scriptedPlayer.js`, `humanController.js` | Cerveau du boss appris (12-16-5), boss à états, joueur robot, clavier. |
| `fight.js` | Un combat à pas fixe de 1/60 s, sans dessin : nappes, brûlure, cause de la mort. |
| `fitness.js`, `genetic.js`, `training.js`, `trainingStore.js` | Note, tournoi et élitisme, entraînement avec champion validé, sauvegarde. |
| `comparison.js`, `demo.js` | Comparaison sur 50 combats, démonstration côte à côte. |
| `settings.js`, `scenarios.js` | Plages des curseurs (`RangeError` hors plage) et préréglages. |
| `trials.js`, `doctrines.js` | Épreuves (réglages du joueur robot) et recettes d'entraînement (poids de la note et épreuve). |
| `pantheon.js`, `tournament.js` | Panthéon (boss fournis et ajoutés, plafond, sauvegarde) et tournoi croisé boss × épreuves. |
| `pretrainedBoss.js`, `pretrainedPantheon.js` | Données : le Gardien et les autres boss du Panthéon. |
| `fitnessChart.js`, `debugPanel.js`, `hud.js`, `camera.js`, `menuToggle.js` | Courbes, debug, interface et effets, caméra de verrouillage, menu masquable. |
| `sketch.js` | Câblage p5 : aucune règle de comportement. |
| `tools/pretrain.mjs`, `tools/pretrain-pantheon.mjs` | Pré-entraînement sous Node : le Gardien, puis un boss par autre recette, avec le tournoi affiché à la fin. |

Les scripts de `index.html` portent un numéro de version (`?v=9`) : après une mise à jour, le navigateur
recharge les nouveaux fichiers. Si un comportement semble ancien, faites **Ctrl + F5**.

## Tests

```bash
node --test tests/*.test.mjs
```

Aucune dépendance (Node 18 ou plus récent), aléatoire à graine fixe. 69 tests :

| Fichier | Ce qui est vérifié |
|---|---|
| `entities.test.mjs` | `vehicle.js` intact ; `flee`, `evade` et confinement ; télégraphe de 0,6 s ; cône de frappe ; endurance ; invulnérabilité de 0,3 s ; `arrive` près des bords ; boss (attentes, phase enragée, esquive, `wander`, `arrive`, `flee`). |
| `mechanics.test.mjs` | Fioles (soin exact à 0,6 s, interruption, charges) ; brume (brûlure, ralentissement, plafond, durée) ; `avoidZones` ; ruée (visée prédite, visée figée, contact unique, attente) ; souffle ; ordre des techniques ; boss à états ; joueur robot ; taches de sang ; combat complet reproductible. |
| `learning.test.mjs` | Cerveau 12-16-5 et ses entrées ; décisions ; mutation ; tournoi et élitisme ; fitness ; combats ; entraînement ; comparaison. |
| `saving.test.mjs` | Champion validé ; sauvegarde complète et reprise ; fichiers invalides, dont la version 1 ; stockage bloqué ; démonstration. |
| `pantheon.test.mjs` | Épreuves et recettes (plages, valeurs) ; note qui suit la recette, changement à la génération suivante, champion réexaminé ; recette sauvegardée ; boss fournis ; ajout, plafond, retrait, stockage invalide ; règles du duel ; tournoi (mêmes combats, budget, profil, rang). |
| `ui.test.mjs` | Identifiants HTML, plages des curseurs, ordre et version des scripts, scénarios, clavier, caméra, courbes, debug, menu, équilibre du boss fourni. |

Chaque règle importante a été cassée volontairement, sur une copie du dossier, pour vérifier qu'au moins un
test échoue.
