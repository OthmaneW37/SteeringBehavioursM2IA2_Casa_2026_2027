# 11 – Le Gardien du Brouillard

Un combat de boss de type *Souls*, vu de dessus, dans une arène fermée. Vous jouez un chevalier ; face à vous,
le **Gardien du Brouillard**. Le boss n'est pas programmé à la main : ses décisions viennent d'un **réseau de
neurones** entraîné par **algorithme génétique**, c'est-à-dire par sélection naturelle. Le réseau choisit, et
les steering behaviors de Reynolds (`seek`, `arrive`, `flee`, `evade`, `wander`) exécutent ces choix.

## Lancer

Ouvrir `index.html` via un serveur local, par exemple `python -m http.server` dans ce dossier, puis aller sur
`http://localhost:8000`. p5.js est chargé en local depuis `libraries/` : aucune ressource externe.

Une **fenêtre d'aide** (« Comment ça marche ? ») s'ouvre à la première visite. Elle explique le jeu,
l'apprentissage et le vocabulaire sans prérequis.

| Touche | Action |
|---|---|
| ZQSD, WASD ou flèches | se déplacer (verrouillé : avancer vers le boss, reculer, tourner autour de lui) |
| J / K | attaque légère / attaque lourde (plus lente, plus forte, plus fatigante) |
| Espace | roulade : `evade` loin du boss, 0,3 s d'invulnérabilité |
| L ou Tab | verrouiller la caméra sur le boss (lock-on) |
| G | mode debug (aussi par la case des réglages avancés) |
| R / P | recommencer le combat / pause |

La touche D sert à se déplacer, d'où le choix de G pour le debug. Une action demandée pendant une autre est
gardée 0,25 s puis jouée, comme le tampon d'entrée des jeux Souls.

## Les quatre modes

| Mode | Ce qu'on voit |
|---|---|
| ⚔️ **Combattre** | Vous affrontez le champion de votre entraînement, le boss pré-entraîné fourni, ou le boss écrit à la main. Barres de vie et d'endurance, compteur de morts, réapparition au feu de camp, phase enragée à 30 %. |
| 🎬 **Démonstration** | Deux combats côte à côte contre le même joueur robot, avec la même graine : à gauche un boss qui n'a rien appris (réseau au hasard) ou le boss écrit à la main, à droite le champion. Le score des manches est compté. C'est l'écran le plus parlant pour un public. |
| 🧬 **Entraîner** | La population évolue génération par génération. Deux courbes : les victoires du champion à son examen, et la note moyenne et meilleure des boss (lissée). En direct, le champion affronte le joueur robot. |
| 📊 **Comparer** | Le boss écrit à la main et le champion jouent les mêmes 50 combats, sur des graines jamais utilisées pour l'entraînement. On obtient le taux de victoire, la durée moyenne, les dégâts et les coups dans le vide, et une phrase de conclusion. **C'est la mesure à retenir.** |

**Mode debug** :
- les entrées et sorties du réseau en direct, avec les seuils, et l'état du boss ;
- le cercle de détection : jaune, rouge quand le joueur est dedans ;
- la portée d'attaque, les deux rayons vers les murs et le vecteur vitesse ;
- quand le boss erre : le cercle et le point visé du `wander` de `vehicle.js`.

## Sauvegarde de l'entraînement

- **Automatique** : la population, la génération, la courbe, le meilleur boss et le champion sont enregistrés
  dans le navigateur (`localStorage`) au plus toutes les 5 s, et quand la page est fermée ou cachée. À la
  prochaine ouverture, l'entraînement reprend où il en était.
- **Fichier** : « Exporter » télécharge un fichier JSON (`gardien-entrainement-generation-N.json`), et
  « Importer » le recharge, par exemple sur un autre ordinateur. Un fichier importé est entièrement vérifié :
  format, réglages dans leurs plages, architecture 8-16-3 de chaque cerveau, historique numérique. Un fichier
  invalide est refusé avec un message clair.
- « Tout recommencer » efface l'entraînement et sa sauvegarde, après un second clic de confirmation.
- Le stockage est protégé : s'il est bloqué ou plein, la page le signale et propose d'exporter.

## Le boss

**Réseau** : 8 entrées → 16 neurones cachés sigmoïdes → 3 sorties sigmoïdes (`NeuralNetwork.js` de l'exemple 9b).

| Entrée (dans [0, 1]) | | Sortie | Effet |
|---|---|---|---|
| distance au joueur | | déplacement | > 0,5 approche (`arrive` à distance d'attaque), < 0,5 recul (`flee`), écart à 0,5 = vitesse |
| angle du joueur / cap du boss | | attaque | > 0,6 et attente finie → attaque télégraphiée |
| vitesse du joueur | | esquive | > 0,6 et le joueur attaque → `evade` pendant 0,35 s |
| endurance du joueur | | | |
| attente avant la prochaine attaque | | | |
| vie du boss | | | |
| rayons vers le mur à −45° et à +45° | | | |

**Sans décision du réseau** : `wander` quand le joueur est hors du rayon de détection (réglable), `arrive` vers
un point à distance d'attaque, confinement (`stayInside`) près des murs.

**Attaque télégraphiée** : 0,6 s de préparation visible (le cône rouge se remplit), 0,15 s de frappe, puis
1 s de récupération pendant laquelle le boss est vulnérable.

**Phase enragée** (vie ≤ 30 %) : aura rouge, vitesse × 1,35 et attente entre deux attaques × 0,55. C'est le
même réseau.

**Boss écrit à la main** (référence) : machine à états `attente` → `attaque` → `recul`.

## L'entraînement

1. 50 boss, chacun avec son réseau. À la première génération, les poids sont tirés au hasard.
2. Chaque boss joue **2 combats** sans rendu contre le **joueur robot** (`scriptedPlayer.js`). Ce n'est pas un
   humain : pour comparer les boss entre eux, il faut un adversaire reproductible. Il esquive 55 % des attaques
   (tirage une fois par attaque, roulade 0,12 s avant la frappe). Il punit la récupération du boss, se repose
   quand il est fatigué et attaque à intervalles réguliers. Il ne s'engage pas quand l'attaque du boss est
   prête, mais sa patience est limitée à 1,5 s.
3. **Fitness** : dégâts infligés (en % de la vie du joueur) − dégâts reçus (en % de la vie du boss), + 100 si
   le boss gagne, − 4 par attaque dans le vide. On prend la moyenne des combats du boss.
4. **Génération suivante** : 1 élite conservée, les autres boss sont des copies mutées (bruit gaussien
   d'écart-type 0,1, taux 0,1) de parents choisis par tournoi de 5.
5. **Champion validé** : avec 2 combats par boss, la meilleure note d'une génération tient souvent à la
   chance. Les 2 meilleurs de chaque génération passent donc un **examen de 30 combats**, toujours les mêmes
   et jamais utilisés pour l'entraînement. Le champion n'est remplacé que par un boss qui gagne plus souvent à
   cet examen : la courbe du champion ne peut que monter. Si les réglages du joueur robot changent, le
   champion repasse l'examen.

L'examen garde toujours le meilleur résultat : il est donc un peu optimiste. La comparaison sur 50 combats
neufs donne la mesure honnête. Dans nos essais, un champion à 94 % à l'examen sur 16 combats gagnait 66 % des
combats de la comparaison, d'où le passage à 30 combats d'examen.

Combien de générations ? Le gros du progrès se fait dans les 10 à 100 premières. Ensuite, la courbe des
générations oscille surtout à cause du hasard des combats. Des milliers de générations ne sont pas
nécessaires : ce qui compte est le résultat de la comparaison.

### Boss pré-entraîné

Pour que le mode Combat ait un vrai adversaire dès l'ouverture, `pretrainedBoss.js` contient un boss entraîné
sous Node avec les réglages par défaut :

```bash
node tools/pretrain.mjs 60 1
```

L'entraînement dure environ 7 minutes sous Node ; dans le navigateur, il est bien plus rapide. Le script
retient le meilleur parmi le champion et les 5 meilleurs de la dernière génération, mesuré sur 30 combats neufs,
puis écrit l'historique et le résultat de la comparaison dans le fichier.

### Équilibrage : « environ 50 % », pas 100 %

Si le joueur robot est trop faible, le boss apprend à battre un adversaire bête. Les essais l'ont confirmé :
- avec la première version du joueur robot, le boss gagnait 100 % en 2 générations, en restant planté et en
  attaquant sans arrêt ;
- une fois ce défaut corrigé, la population est tombée dans une stratégie passive : elle n'attaquait plus et
  tous les combats finissaient en match nul. La patience limitée du joueur robot corrige ce cas.

Avec les réglages actuels (esquive 55 %), sur 50 combats identiques :

| Boss | Victoires | Durée moyenne |
|---|---|---|
| Boss écrit à la main | 30 % | 33 s |
| Boss pré-entraîné fourni (`pretrainedBoss.js`, 60 générations) | 64 % | 39 s |
| Champion entraîné dans le navigateur (quelques générations) | 66 % | 40 s |

Ces chiffres sont reproductibles : mêmes graines, même résultat. Pour un boss plus proche de 50 %, augmentez
l'esquive du joueur robot (scénario « Joueur robot expert »). Un test vérifie que le boss pré-entraîné gagne
entre 30 % et 80 % et fait mieux que le boss écrit à la main.

## Scénarios

Le menu « Scénario » des réglages avancés propose 6 préréglages :
1. Référence
2. Joueur robot expert (esquive 85 %)
3. Joueur robot débutant
4. Entraînement rapide
5. Mutation forte
6. Boss myope (détection 180 px)

Un scénario ne liste que ce qui change par rapport à la référence. Modifier un curseur à la main fait passer
le menu sur « Personnalisé ».

## Fichiers

| Fichier | Rôle |
|---|---|
| `vehicle.js` | **Fourni, protégé** : copie intacte de `4-Wander/vehicle.js` (`seek`, `arrive`, `wander`, `applyForce`, `update`). Un test vérifie son empreinte. |
| `steering.js` | `flee` de Reynolds (vitesse désirée inversée), `evade` (position prédite), `stayInside`, point de garde. `flee` et `evade` de `vehicle.js` inversent la force finale : `Player` et `Boss` les redéfinissent pour déléguer ici. |
| `combat.js` | Règles : vies, endurance, roulade, attaques (préparation, frappe, récupération), cône de frappe. |
| `arena.js` | Arène : bords, rayons vers les murs, mur physique, sol et brouillard (décor). |
| `NeuralNetwork.js` | Copie du réseau de l'exemple 9b (JavaScript pur, sigmoïde, mutation gaussienne). |
| `campfire.js`, `player.js`, `boss.js` | `Campfire`, `Player` et `Boss`, tous `extends Vehicle`. |
| `bossBrain.js`, `handBoss.js`, `scriptedPlayer.js`, `humanController.js` | Cerveau du boss appris, boss à états, joueur robot, clavier. |
| `fight.js` | Un combat à pas fixe de 1/60 s, sans dessin : sert au jeu, à l'entraînement, à la démonstration et à la comparaison. |
| `fitness.js`, `genetic.js`, `training.js` | Note des boss, tournoi et élitisme, entraînement découpé avec champion validé. |
| `trainingStore.js` | Sauvegarde automatique, export et import de l'entraînement complet. |
| `comparison.js`, `demo.js` | Comparaison sur 50 combats, démonstration côte à côte. |
| `settings.js`, `scenarios.js` | Plages des curseurs (`RangeError` hors plage) et préréglages. |
| `fitnessChart.js`, `debugPanel.js`, `hud.js`, `camera.js`, `menuToggle.js` | Courbes, debug, interface et effets, caméra de verrouillage, menu masquable. |
| `sketch.js` | Câblage p5 : aucune règle de comportement. |
| `tools/pretrain.mjs` | Pré-entraînement sous Node. |

Les scripts de `index.html` portent un numéro de version (`?v=5`) : après une mise à jour, le navigateur charge
les nouveaux fichiers au lieu d'une ancienne copie en cache. Si un comportement semble ancien, faites
**Ctrl + F5**.

## Tests

```bash
node --test tests/*.test.mjs
```

Aucune dépendance (Node 18 ou plus récent). Les tests chargent les vrais fichiers dans un contexte `vm`, avec un
adaptateur vectoriel et un aléatoire à graine fixe. 44 tests :

| Fichier | Ce qui est vérifié |
|---|---|
| `entities.test.mjs` | `vehicle.js` intact ; steering (`flee`, `evade`, confinement) ; phases et télégraphe de 0,6 s ; cône de frappe ; endurance ; fenêtre d'esquive de 0,3 s ; `arrive` près des bords ; verrouillage ; attente entre deux attaques ; phase enragée ; esquive conditionnelle ; `wander`, `arrive` et `flee` du boss. |
| `learning.test.mjs` | Entrées et sorties du cerveau ; mutation ; tournoi et élitisme ; fitness ; combat reproductible avec invariants ; un coup ne touche qu'une fois ; roulade au bon moment ; entraînement ; comparaison ; boss à états ; joueur robot. |
| `saving.test.mjs` | Champion validé (courbe croissante, réexamen) ; sauvegarde complète et reprise ; fichiers invalides refusés ; stockage bloqué, plein ou corrompu ; démonstration. |
| `ui.test.mjs` | Identifiants HTML ; plages des curseurs ; ordre et version des scripts ; scénarios appliqués à de vrais objets ; clavier ; caméra ; courbes ; debug ; menu ; équilibre du boss pré-entraîné. |

Chaque règle importante a été cassée volontairement, sur une copie du dossier, pour vérifier qu'au moins un
test échoue : 18 règles, 18 détectées.
