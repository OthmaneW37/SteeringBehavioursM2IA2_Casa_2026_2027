# Architecture du dépôt

Ce dépôt regroupe de petits exemples autonomes de steering behaviors avec p5.js. Chaque dossier numéroté correspond à un exemple ou à sa correction. Les consignes de développement complètes sont dans [`AGENTS.md`](AGENTS.md).

## Frontières du code

### `vehicle.js` : code fourni et protégé

Les fichiers `vehicle.js` fournissent le modèle de véhicule utilisé par les exemples : état (position, vitesse, accélération), paramètres de vitesse et de force, comportements déjà disponibles, application des forces, locomotion et dessin.

**Ne pas modifier un fichier `vehicle.js` sans demander d'abord l'accord explicite de l'utilisateur.** Ce code a été fourni et doit en principe rester inchangé. Ne pas dupliquer ses comportements ni remplacer sa logique interne.

Pour étendre un exemple, créer une sous-classe distincte de `Vehicle` pour chaque entité identifiée (par exemple joueur, ennemi ou véhicule spécialisé). La sous-classe peut réutiliser les méthodes existantes et ajouter des comportements. Elle doit produire des forces avec la loi `steering = vitesseDésirée - vitesseActuelle`, respecter `maxForce`, puis utiliser `applyForce`; la mise à jour de la locomotion reste celle du véhicule de base.

### Classes d'entité

Créer un fichier séparé par type d'entité, dans le dossier de l'exemple concerné : par exemple `Player.js`, `Enemy.js` et `Target.js`. Ne pas regrouper plusieurs types d'entités dans un fichier. Toute entité visible, même si elle paraît statique, étend `Vehicle`; ne pas créer de classe d'objet visible indépendante de `Vehicle`.

### Comportements et composition

Garder chaque comportement indépendant, réutilisable et testable. Les entités ou le code de l'exemple combinent les forces avec une somme pondérée ou une règle de priorité. Distinguer l'objectif choisi, le calcul des forces de steering et l'application des forces par la locomotion.

## Exemple `1-Seek` : organisation des fichiers

Un fichier par entité ou par responsabilité, chargés dans cet ordre par `index.html` (une dépendance avant ce qui l'utilise, `sketch.js` en dernier).

| Fichier | Rôle |
|---|---|
| `vehicle.js` | **Fourni, protégé.** Modèle de véhicule (position, vitesse, forces, `seek`, `edges`, dessin). |
| `steering.js` | Pilotage partagé : `flee` de Reynolds (vitesse désirée inversée) et `wrapDelta` (écart le plus court sur un tore). |
| `follower.js` | `Follower extends Vehicle` : les vaisseaux. Poursuite, fuite avec rayon de fuite et freinage, visée de l'image la plus proche de la cible. |
| `population.js` | Création, arrivée, réapparition et réglages communs des véhicules ; `step` indique une capture. |
| `target.js` | **Fourni, à ne pas modifier.** `Target extends Vehicle` : mouvement aléatoire et rayon qui change. |
| `pointTarget.js` | `PointTarget extends Target` : point avec cercle, mouvement seule ou curseur, diamètre fixe possible. |
| `targetFuyante.js` | `TargetFuyante extends PointTarget` : fuit le vaisseau le plus proche (détection, endurance, barre, division). |
| `targetGroup.js` | Groupe de cibles : création, recyclage, division plafonnée, cible la plus proche, capture. |
| `targetControls.js` | Réglages des cibles et liaison aux contrôles. |
| `scenarios.js` | Préréglages du menu déroulant et suivi de « Personnalisé ». |
| `gradientBackground.js`, `fmSynth.js` | Fond animé par la modulation de fréquence et son FM. |
| `menuToggle.js` | Bouton qui affiche ou masque le menu. |
| `sketch.js` | Câblage p5 : lie les contrôles aux modules, boucle `draw`. Aucune règle de comportement ici. |

Hiérarchie des cibles : `Vehicle` → `Target` (fourni) → `PointTarget` → `TargetFuyante`. Chaque classe n'ajoute que ce qui lui est propre ; `flee()` est défini une fois, dans `PointTarget`, via `steering.js`.

Déroulement d'une image (`draw`) : les cibles se déplacent (`TargetGroup.update(dt)`) et se divisent si elles le peuvent, puis réapparaissent du côté opposé (`edges`) ; la position de la première cible règle le son FM et le dégradé ; chaque véhicule vise la cible la plus proche, `SeekPopulation.step` le déplace et signale une capture ; enfin tout est dessiné, avec le cercle de détection en mode debug.

L'écran est un tore : `edges()` téléporte un agent de `-r` à `largeur + r`. Le pilotage utilise donc toujours l'écart le plus court (`Steering.wrapDelta`).

### Ajouter un scénario

1. Ajouter une entrée dans `Scenarios.LIST` (identifiant, libellé, description, valeurs qui changent par rapport à `BASE`).
2. Si un nouveau réglage est nécessaire : l'ajouter à `BASE`, à `PARAMETERS` du module concerné, à `index.html` (mêmes attributs) et aux `setters` de `sketch.js`.
3. Les tests de `scenarios` vérifient les plages et appliquent le scénario à de vrais objets ; ajouter un test du comportement propre au scénario.

### Ajouter une entité

Créer `monEntite.js` avec une sous-classe de `Vehicle` (ou d'une entité existante), réutiliser `flee()` / `seek()` hérités, ajouter le script dans `index.html` avant `sketch.js`, puis les tests dans `1-Seek/tests/`. Si l'entité se reproduit, passer par `TargetGroup` (plafond et recyclage).

## Tests

Chaque nouvelle fonctionnalité d'un exemple doit être accompagnée de tests unitaires pertinents, exécutés avant de présenter la modification comme terminée. Consulter [`AGENTS.md`](AGENTS.md) pour les attentes de couverture, la reproductibilité de l'aléatoire et la communication du résultat des tests.

Dans `1-Seek`, les tests sont dans `tests/population.test.mjs` et se lancent avec `node --test tests/*.test.mjs` depuis le dossier `1-Seek`. Ils exécutent les vrais fichiers de l'exemple dans un contexte isolé, avec un adaptateur vectoriel minimal. Ils comprennent des contrôles de cohérence entre `index.html`, les modules et `sketch.js`, qui n'est pas exécutable sous Node.
