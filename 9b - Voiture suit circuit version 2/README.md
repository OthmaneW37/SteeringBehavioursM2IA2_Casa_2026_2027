# 9b – Voiture suit circuit (version 2) : laboratoire de neuroévolution

Des voitures pilotées par un petit réseau de neurones apprennent à faire le tour d'un circuit.
Le réseau n'est entraîné **que par algorithme génétique** : sélection par tournoi puis mutation
gaussienne des poids, sans rétropropagation.

Sans rien toucher, l'application se comporte comme la version d'origine : réseau [6, 20, 2],
50 voitures « Berline », mutation 0,15, circuit généré par les curseurs, et arrêt quand 60 % de
la population termine le tour.

## Lancer

Ouvrir `index.html` via un serveur local (par exemple `python -m http.server` dans ce dossier), puis
aller sur `http://localhost:8000`. Seule bibliothèque utilisée : p5.js 1.9.0, chargée depuis un CDN.

## Tests

Les tests n'ont aucune dépendance : il faut seulement Node 18 ou plus récent. Depuis ce dossier :

```bash
node --test tests/*.test.mjs
```

Résultat attendu : 63 tests, 0 échec. Les tests exécutent les vrais fichiers `js/` dans un contexte `vm`
isolé, avec un adaptateur vectoriel minimal à la place de p5 et un aléatoire à graine fixe.

| Fichier | Ce qui est vérifié |
|---|---|
| `neuralNetwork.test.mjs` | tailles de couches, nombre de paramètres, [6, 20, 2] par défaut, initialisation Glorot, sorties dans [0, 1], copy / mutate indépendants, sérialisation |
| `termination.test.mjs` | `shouldStop` : chaque condition seule, les combinaisons, les seuils inclusifs, le suivi de la stagnation |
| `circuits.test.mjs` | chaque circuit (dans le canvas, boucle fermée, checkpoints ordonnés, murs sans croisement) ; curriculum (passage après un tour, retour au début) |
| `configStore.test.mjs` | aller-retour JSON, rejet des valeurs hors plage, stockage bloqué ou plein, renommer / supprimer |
| `car.test.mjs` | Berline identique à la formule d'origine, vitesse max / freinage / masse / adhérence / capteurs de chaque type ; entraînement court (invariants, passage de circuit, arrêt et population figée) ; course (aucune mutation, classement, points) |
| `controls.test.mjs` | chaque identifiant utilisé par le JS existe dans `index.html`, les curseurs ont les plages du JS, ordre des scripts, lecture et application des réglages, géométrie de l'affichage du réseau |

## Fichiers

Les fichiers sont chargés dans cet ordre par `index.html` ; `main.js` vient en dernier.

| Fichier | Rôle |
|---|---|
| `globals.js`, `utils.js`, `Ray.js` | Constantes et variables du circuit courant, distance point–segment, rayons des capteurs. |
| `settings.js` | `PARAMETERS` (min, max, step, initial, decimals) de chaque réglage, valeurs par défaut, validation (`RangeError`). |
| `NeuralNetwork.js` | Réseau dense sigmoïde à architecture `[entrées, cachées…, sorties]`, en JavaScript pur. |
| `carTypes.js` | Données des 5 types de voitures. |
| `trackGeometry.js` | Géométrie pure des circuits : générateur « LEGO » d'origine, spline, murs, checkpoints, validation. |
| `circuits.js` | Catalogue de circuits (données) et préréglages : généré, standards, tueurs, mélange. |
| `Track.js` | Construit le circuit courant (murs et checkpoints p5), tuiles. |
| `Car.js` | Voiture : capteurs, décision, steering, locomotion, checkpoints, tours, anti-blocage. |
| `Genetic.js` | Fitness, sélection par tournoi, nouvelle génération. |
| `termination.js` | `shouldStop(state, settings)` et le suivi du meilleur score (fonctions pures). |
| `curriculum.js` | `CircuitCurriculum` : enchaînement des circuits pendant l'entraînement. |
| `trainer.js` | Mode Entraînement : une étape de simulation, fin de génération, arrêt, population figée. |
| `race.js` | Mode Course : grille, enchaînement des circuits, classement, points. |
| `configStore.js` | Configurations : validation, `localStorage` protégé, import et export JSON. |
| `networkView.js` | Dessin du réseau de la voiture en tête. |
| `controls.js` | Lien entre les contrôles HTML et les réglages (document injecté, donc testable). |
| `main.js` | Câblage p5 et interface. Aucune règle de comportement. |

## Réglages (menu latéral, masquable avec le bouton ◀)

| Réglage | Identifiant | Défaut | Plage |
|---|---|---|---|
| Vitesse max de référence | `speedSlider` | 6 | 2 – 20 |
| Accélération (pas de simulation par image) | `simSpeed` | 1 | 1 – 20 |
| Complexité / largeur du circuit généré | `diffSlider` / `widthSlider` | 5 / 100 | 1 – 50 / 35 – 150 |
| Couches cachées | `hiddenLayerCount` | 1 | 1 – 5 |
| Neurones par couche | `neurons1` … `neurons5` | 20 | 1 – 64 |
| Frein appris (3e sortie) | `brakeOutput` | non | — |
| Population | `populationSize` | 50 | 10 – 200 |
| Taux de mutation | `mutationRate` | 0,15 | 0 – 1 |
| Tours par évaluation | `lapsPerRun` | 1 | 1 – 5 |
| Générations max | `termMaxGenerations` | 200 (inactif) | 1 – 2000 |
| Tours réussis sur chaque circuit | `termTargetLaps` | 1 (inactif) | 1 – 5 |
| Stagnation (générations) | `termStagnation` | 30 (inactif) | 1 – 500 |
| Temps max (s) | `termMaxTime` | 600 (inactif) | 10 – 7200 |
| Taux de réussite | `termSuccessRate` | 0,6 (**actif**) | 0,05 – 1 |
| Tours par circuit en course | `raceLaps` | 2 | 1 – 5 |

Note : le curseur « Complexité » affichait 10 alors que le programme utilisait 5. Le curseur indique
maintenant 5, la valeur réellement utilisée au démarrage.

## Décisions

- **Réseau en JavaScript pur, sans TensorFlow.js.** L'API est conservée (`predict`, `copy`, `mutate`,
  `dispose`) et l'initialisation reprend celle d'une couche dense TensorFlow.js : poids Glorot uniforme,
  biais nuls, sigmoïde, et même bruit de mutation (écart-type 0,1). Ce choix permet de tester le
  réseau sous Node sans dépendance et de lire les activations de chaque couche pour l'affichage sans
  rien recalculer. Pour des réseaux aussi petits, c'est aussi plus rapide que TensorFlow.js.
- **Changer d'architecture** se fait avec le bouton « Appliquer », pas à chaque mouvement de curseur. Le
  bouton crée une nouvelle population et repart de la génération 0. Population, mutation, terminaison,
  types et tours s'appliquent à la génération suivante, sans relancer.
- **Passage de circuit** : à la fin d'une génération, si au moins une voiture a fait un tour complet, on
  passe au circuit suivant avec la même population. **En fin de liste, on repart au premier circuit.**
  Avec un seul circuit dans la liste (le défaut), rien ne change.
- **Fonction de terminaison** : la première condition remplie, dans l'ordre « tours sur tous les
  circuits », « taux de réussite », « générations », « stagnation », « temps », donne la raison affichée.
  Les seuils sont inclusifs. Le temps est mesuré en secondes réelles, pauses exclues. Après l'arrêt, la
  population est **figée** : on rejoue les mêmes cerveaux, sans sélection ni mutation. On peut alors
  « Sauvegarder le meilleur cerveau ». Si l'on modifie le circuit généré, l'entraînement reprend, comme
  dans la version d'origine.
- **Frein appris** (option) : le réseau reçoit une 3e sortie. Au-dessus de 0,5, la poussée est coupée
  (le cap peut toujours changer) et la voiture décélère selon `brakeDecel` de son type. Par défaut,
  le réseau a 2 sorties.
- **Vitesse max d'un type** = `speedFactor` × curseur de vitesse de référence. Accélération max, virage
  max, freinage, adhérence, masse, taille, portée et champ des capteurs viennent tous de
  `carTypes.js`. La Berline reprend exactement les constantes d'origine.
- **Mode Course** : il n'entraîne rien, chaque voiture copie son cerveau. Les temps sont en secondes
  simulées, une étape valant 1/60 s, donc indépendants de l'accélération. Chaque circuit rapporte
  10-8-6-5-4-3-2-1 points aux voitures arrivées. Passer en course **suspend** l'entraînement. Au retour,
  le circuit d'entraînement est reconstruit et la génération en cours repart du départ, avec les mêmes
  cerveaux.
- **Format des configurations** : `{ format: "neuro-racing-config", version: 1, name, savedAt,
  settings, brain }`. `brain` vaut `null` ou `{ sizes, weights, biases }`. Un fichier importé est
  entièrement validé : plages, circuits et types connus, et cerveau compatible avec l'architecture.
- **Circuits** : ils sont définis en données (points de contrôle dans un canvas de référence 1000 × 700),
  avec une largeur locale possible pour les goulets. Le circuit généré garde l'algorithme d'origine.

## Écart avec les consignes générales du dépôt

Cet exemple ne contient pas de `vehicle.js` : `Car` n'étend donc pas `Vehicle`, comme dans la version
d'origine. Elle suit la même loi de pilotage : vitesse désirée → force = désirée − vitesse, limitée à
`maxForce`, puis `applyForce` et `update`.
