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

## Les quatre modes

| Mode | Ce qu'on voit |
|---|---|
| ⚔️ **Combattre** | Vous affrontez le champion de votre entraînement, le boss pré-entraîné fourni, ou le boss écrit à la main. |
| 🎬 **Démonstration** | Deux combats côte à côte contre le même joueur robot, avec la même graine : à gauche un boss qui n'a rien appris ou le boss écrit à la main, à droite le champion. Le score des manches est compté. |
| 🧬 **Entraîner** | Évolution génération par génération. Deux courbes : les victoires du champion à son examen, et la note des boss, lissée. En direct, le champion affronte le joueur robot. |
| 📊 **Comparer** | Les deux boss jouent les mêmes 50 combats, sur des graines jamais vues à l'entraînement. Le résultat donne le taux de victoire, la durée, les dégâts, les techniques utilisées et les fioles bues. **C'est la mesure à retenir.** |

**Mode debug** :
- les 12 entrées et les 5 sorties du réseau en direct, avec leurs seuils ;
- l'état du boss et les attentes de ses trois techniques ;
- le cercle de détection : jaune, rouge quand le joueur est dedans ;
- la portée d'attaque, les rayons vers les murs, la vitesse, et le cercle du `wander` de `vehicle.js`.

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
| `fitnessChart.js`, `debugPanel.js`, `hud.js`, `camera.js`, `menuToggle.js` | Courbes, debug, interface et effets, caméra de verrouillage, menu masquable. |
| `sketch.js` | Câblage p5 : aucune règle de comportement. |
| `tools/pretrain.mjs` | Pré-entraînement sous Node. |

Les scripts de `index.html` portent un numéro de version (`?v=8`) : après une mise à jour, le navigateur
recharge les nouveaux fichiers. Si un comportement semble ancien, faites **Ctrl + F5**.

## Tests

```bash
node --test tests/*.test.mjs
```

Aucune dépendance (Node 18 ou plus récent), aléatoire à graine fixe. 59 tests :

| Fichier | Ce qui est vérifié |
|---|---|
| `entities.test.mjs` | `vehicle.js` intact ; `flee`, `evade` et confinement ; télégraphe de 0,6 s ; cône de frappe ; endurance ; invulnérabilité de 0,3 s ; `arrive` près des bords ; boss (attentes, phase enragée, esquive, `wander`, `arrive`, `flee`). |
| `mechanics.test.mjs` | Fioles (soin exact à 0,6 s, interruption, charges) ; brume (brûlure, ralentissement, plafond, durée) ; `avoidZones` ; ruée (visée prédite, visée figée, contact unique, attente) ; souffle ; ordre des techniques ; boss à états ; joueur robot ; taches de sang ; combat complet reproductible. |
| `learning.test.mjs` | Cerveau 12-16-5 et ses entrées ; décisions ; mutation ; tournoi et élitisme ; fitness ; combats ; entraînement ; comparaison. |
| `saving.test.mjs` | Champion validé ; sauvegarde complète et reprise ; fichiers invalides, dont la version 1 ; stockage bloqué ; démonstration. |
| `ui.test.mjs` | Identifiants HTML, plages des curseurs, ordre et version des scripts, scénarios, clavier, caméra, courbes, debug, menu, équilibre du boss fourni. |

Chaque règle importante a été cassée volontairement, sur une copie du dossier, pour vérifier qu'au moins un
test échoue.
