# Consignes de développement — exemples de steering behaviors

Ces consignes s'appliquent à tous les exemples du dépôt. Avant toute modification, lire aussi [`ARCHITECTURE.md`](ARCHITECTURE.md), qui précise les frontières entre le code de base fourni et le code à développer.

## Référence

S'appuyer sur l'article de Craig W. Reynolds, « Steering Behaviors for Autonomous Characters » (GDC 1999), fourni dans [`ARTICLE_CRAIG_REYNOLDS/Steering Behaviors For Autonomous Characters.pdf`](ARTICLE_CRAIG_REYNOLDS/Steering%20Behaviors%20For%20Autonomous%20Characters.pdf). Les exemples illustrent des règles locales et réactives; ils ne doivent pas remplacer le pilotage par des trajectoires codées à la main.

## Modèle de mouvement

- Utiliser `p5.Vector` pour les positions, vitesses, accélérations et forces.
- Le mouvement d'un véhicule est déterminé par sa vitesse et son accélération; un comportement de pilotage calcule une force, puis la locomotion existante l'applique et met à jour le véhicule.
- Pour un comportement de direction, construire une vitesse désirée à partir d'une direction et de `maxSpeed`, puis calculer `steering = desiredVelocity - currentVelocity`. Limiter la force résultante à `maxForce`.
- Ne pas déplacer directement une entité dans un comportement. Ne pas contourner `applyForce` ni dupliquer la mise à jour de la locomotion.
- Respecter la séparation conceptuelle décrite par Reynolds : sélection de l'action (objectif), steering (force de pilotage), locomotion (application de la force et déplacement). Garder le périmètre de chaque petit exemple simple et explicite.

## `vehicle.js` et réutilisation

- Ne jamais modifier un fichier `vehicle.js` sans demander d'abord l'accord explicite de l'utilisateur. Il contient du code fourni qui doit en principe rester intact.
- Ne pas recopier dans une nouvelle classe le code déjà présent dans `vehicle.js`.
- Ajouter les nouveaux comportements sous forme de sous-classes de `Vehicle`, ou de fonctions/modules de comportement indépendants selon l'organisation de l'exemple. Une sous-classe peut réutiliser les comportements existants et en ajouter de nouveaux; elle doit déléguer les forces à `applyForce` et la locomotion à l'implémentation existante.
- Si une modification de `vehicle.js` semble nécessaire, arrêter cette partie du travail et demander l'accord de l'utilisateur avant de l'effectuer.

## Entités et organisation des fichiers

- Garder un fichier distinct par entité identifiée dans l'exemple : par exemple `Player.js`, `Enemy.js`, `Target.js` ou `Obstacle.js`. Ne pas regrouper plusieurs classes d'entités dans un même fichier.
- Toute entité visible doit étendre `Vehicle`, y compris une entité qui paraît statique. Ne créer aucune classe d'objet visible indépendante de `Vehicle`.
- Garder chaque exemple autonome dans son dossier existant. Placer les nouvelles classes d'entité et les comportements dans des fichiers séparés et nommés clairement; éviter les grandes fonctions qui mélangent perception, décision, calcul des forces, mise à jour et dessin.
- Les noms de fichiers déjà en minuscules dans un exemple peuvent conserver cette convention; ne pas renommer les fichiers existants sans nécessité.

## Comportements composables

- Concevoir chaque comportement comme une unité réutilisable qui retourne une force ou un résultat clairement défini.
- Composer les comportements au niveau du contrôleur ou de l'entité avec une somme pondérée, un système de priorités, ou une combinaison adaptée à l'exemple. Garder les comportements eux-mêmes indépendants.
- Exemples de règles : `seek` dirige vers une cible, `flee` s'en éloigne, `arrive` réduit la vitesse désirée près de la cible, `pursue` et `evade` anticipent une position future, `wander` conserve une variation directionnelle continue plutôt qu'un nouveau tirage aléatoire brutal à chaque image.
- Pour le flocking, garder séparation, alignement et cohésion distincts avant de les combiner.
- Limiter la perception au voisinage utile de l'agent et expliquer les paramètres qui influencent le résultat.

## Scénarios et menu déroulant

- Quand un exemple propose plusieurs variantes, ajouter un **menu déroulant de scénarios**. Le scénario 1 est le comportement de référence déjà en place : ne pas le casser. Les scénarios suivants s'ajoutent à côté.
- Un scénario est un **préréglage (donnée)** dans un fichier dédié (`scenarios.js`), pas une branche de code dans `sketch.js`. Il part des réglages d'origine et ne liste que ce qui change, pour qu'aucun réglage ne reste d'un scénario à l'autre. Chaque scénario a un libellé et une description lisibles.
- Changer de scénario règle les contrôles du menu comme le ferait l'utilisateur. Si l'utilisateur modifie ensuite un réglage à la main, le menu passe sur « Personnalisé ».
- Les valeurs d'un scénario doivent rester dans les plages des curseurs ; un test le vérifie et applique chaque scénario à de vrais objets.

## Entités à comportement propre (exemple : TargetFuyante)

- Une entité qui a son propre comportement est une **sous-classe de `Vehicle`** (directement ou via une sous-classe existante) dans **son propre fichier**, nommé comme la classe avec une minuscule initiale (`TargetFuyante` dans `targetFuyante.js`). Elle **réutilise les méthodes héritées** (`flee()`, `seek()`, `applyForce()`) au lieu de les recopier.
- Son comportement est un **état explicite** (calme, fuite, fatigue…). Quand le déclencheur disparaît, elle **reprend le comportement par défaut de sa classe parente** (par exemple celui de `Target`).
- Les durées sont en **secondes**, jamais en nombre d'images : `update(dt)` reçoit le temps écoulé (`deltaTime` de p5, borné) et les tests fournissent des `dt` fixes.
- La perception a un **rayon réglable par curseur**. En **mode debug** (touche `d`, case du menu), la zone de perception est dessinée : **jaune par défaut, rouge quand un autre agent est à l'intérieur**.
- Une ressource limitée (endurance, énergie…) a un **réglage** et une **barre dessinée au-dessus de l'entité**, dont la couleur dépend de l'état. La géométrie et la couleur de la barre sont calculées par une méthode pure testable, séparée du dessin.
- Une **reproduction** ou **division** d'entités passe par un gestionnaire (`TargetGroup`), pas par l'entité elle-même. Il impose un **plafond** du nombre d'entités et **recycle** celles qui sont retirées : la `Target` fournie lance un `setInterval` qui n'est jamais arrêté, donc créer des cibles sans fin accumulerait des minuteries.
- Quand plusieurs cibles existent, chaque véhicule vise la **plus proche** ; une cible capturée disparaît tant qu'il en reste une autre.

## Steering sur un écran torique

- Si `Vehicle.edges()` fait réapparaître un agent de l'autre côté du canvas, l'écran est un **tore**. Calculer la direction vers une cible, ou pour la fuir, avec **l'écart le plus court** (`Steering.wrapDelta`, période = largeur + 2 × rayon), pas avec la différence brute. Sinon un agent qui fuit vers le bord se téléporte d'un côté à l'autre à chaque image.
- Toute **fuite a une condition d'arrêt** : distance de sécurité, endurance ou rayon de fuite. Jamais de fuite infinie.
- Pour `flee`, **inverser la vitesse désirée puis recalculer la force** (`steering = désirée − vitesse`, limitée à `maxForce`). Ne pas inverser la force finale de `seek` (certains `vehicle.js` le font) : utiliser `Steering.flee` (`steering.js`). Comme `vehicle.js` est protégé, la sous-classe redéfinit `flee` pour déléguer à ce module.

## Interface et réglages

- Chaque réglage est une entrée de `PARAMETERS` (`min`, `max`, `step`, `initial`, `decimals`) dans son module, avec validation (`RangeError` hors plage) et un curseur HTML qui a **les mêmes attributs**. Un test compare `index.html` aux modules.
- Garder la logique dans des **modules testables** : `sketch.js` ne fait que câbler et n'est pas exécutable sous Node. Un test vérifie que chaque identifiant utilisé par `sketch.js` existe dans `index.html` et que les scripts sont chargés dans l'ordre des dépendances.
- Le DOM, les contextes audio et canvas sont **injectés** dans les modules pour pouvoir les remplacer dans les tests.
- Le menu des paramètres doit pouvoir être **masqué** (bouton), le canvas reprenant la place libérée.

## Tests automatisés obligatoires

- Chaque nouvelle fonctionnalité ajoutée à un exemple doit avoir des tests unitaires couvrant ses règles essentielles et ses cas limites. Ajouter ou mettre à jour les tests dans le dossier de l'exemple concerné.
- Vérifier au minimum les valeurs et effets des forces, leurs limites (`maxForce`), les cas proches/éloignés pertinents, et la composition avec les autres comportements concernés. Injecter ou fixer l'aléatoire pour rendre les tests reproductibles.
- Repérer le lanceur de tests déjà utilisé par le dépôt ou l'exemple et exécuter la suite pertinente après les modifications. Si aucun lanceur adapté n'existe, ajouter une configuration légère et une commande reproductible à l'exemple; ne pas installer de moteur physique ou de dépendance inutile.
- Corriger tout échec avant de présenter le travail comme terminé. Ne proposer ni demander à l'utilisateur de tester une fonctionnalité avant d'avoir exécuté les tests automatisés pertinents et confirmé leur réussite. Si les tests ne peuvent pas être exécutés, expliquer précisément le blocage et ne pas prétendre qu'ils sont passés.
- Après avoir écrit les tests d'une règle, vérifier qu'ils **échouent quand on la casse volontairement** (inverser un signe, ignorer un rayon…) puis restaurer le code ; un test qui reste vert ne protège rien.
- Les tests d'une entité couvrent aussi ses **états et transitions** (déclenchement, arrêt, épuisement, reprise), avec des `dt` fixes, et des **simulations courtes** vérifiant les invariants (valeurs finies, positions dans le canvas, plafond d'entités).

## Présentation d'une modification

Indiquer les fichiers créés et modifiés, le comportement ajouté et la commande de tests exécutée avec son résultat. Confirmer que les fichiers `vehicle.js` sont restés inchangés, sauf accord préalable explicite de l'utilisateur.

## Scénarios, perception et endurance

- Toute entité graphique du monde simulé est un `Vehicle` ou une sous-classe, même initialement immobile. Son mouvement autonome utilise des steering behaviors, `applyForce()` et la locomotion héritée. Le fond, les contrôles DOM et les diagnostics sont du rendu ou de l'interface, pas des entités du monde.
- Une nouvelle cible spécialisée possède son propre fichier et peut étendre `Target` si cette classe hérite déjà de `Vehicle`. Réutiliser les méthodes héritées, notamment `super.flee(threat.pos)`, lorsque leur contrat convient ; ne pas recopier leurs formules dans le sketch. La protection de `vehicle.js` reste applicable.
- Le contrôleur sélectionne le scénario et fournit véhicules et temps écoulé. L'entité porte sa perception, son état normal/fuite/épuisement, ses limites temporaires et son endurance.
- Distinguer rayon de déclenchement et distance de sécurité. Pendant une fuite, mesurer les distances réelles au-delà du rayon initial : être hors du cercle de détection ne suffit pas à atteindre la distance de sortie.
- À la sortie ou à l'épuisement, restaurer exactement les limites normales. Après épuisement, ne pas réarmer à l'image suivante : prévoir une condition explicite de retour en sécurité. Une transition de scénario réinitialise la fuite sans recréer la population.
- Ne pas créer de timer permanent par entité pour modifier directement sa vitesse. Utiliser le temps écoulé et des forces de steering ; les scénarios inactifs doivent pouvoir être suspendus proprement.
- Le debug affiche les données de perception sans recalculer les forces. Synchroniser touche D et case à cocher, sans intercepter les frappes dans les contrôles.
- Tester les seuils inclusifs, le prédateur le plus proche, la poursuite de la fuite entre détection et sortie, la durée exacte, l'endurance, la restauration des limites et le réarmement. Compléter les tests par une validation du vrai p5.js dans le navigateur.
