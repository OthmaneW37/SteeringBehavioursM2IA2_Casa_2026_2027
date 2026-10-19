# Présenter le projet en 12 minutes

## Avant de commencer

1. Lancer le serveur dans ce dossier : `python -m http.server`, puis ouvrir `http://localhost:8000`.
2. Faire **Ctrl + F5** une fois, pour être sûr d'avoir la dernière version des fichiers.
3. Garder la fenêtre d'aide (Options → « Comment ça marche ? ») pour la fin ou pour les questions.
4. Le jeu s'ouvre sur l'écran titre. Les outils (Duels, Entraîner, Comparer, Panthéon) sont dans le
   **Laboratoire** ; **Échap** en combat ouvre la pause.

## Déroulé conseillé

### 1. L'idée, en une phrase (1 min)

« Le boss n'est pas programmé à la main. Il a un petit réseau de neurones : 16 informations entrent
(distance, angle, fatigue et vie du joueur, s'il boit ou attaque, les piliers, le danger du coin…),
6 décisions sortent (avancer ou reculer, hallebarde, esquive, ruée, souffle, tourner autour du joueur). Il a
appris à se battre par sélection naturelle. »

### 2. Jouer 1 minute contre le Gardien

« Nouvelle partie » commence la campagne par la meute. Pour montrer directement le Gardien : Échap, puis
l'adversaire « Champion de votre entraînement » dans le menu de pause.

- Montrer le télégraphe : le cône rouge se remplit pendant 0,6 s, puis la roulade (Espace) au bon moment.
- Frapper pendant la récupération du boss.
- Si possible, montrer la phase enragée à 30 % de vie (aura rouge, boss plus rapide).
- Montrer les nouvelles mécaniques :
  - la **ruée** : la ligne rouge vise l'endroit où vous allez être, comme `pursue`. On l'évite en changeant de
    direction au dernier moment ;
  - le **souffle** : une nappe de brume verte qui brûle et ralentit ;
  - une **fiole d'Estus** (E) : elle soigne, mais pendant 1 s on est une cible facile ;
  - les **piliers** : ils parent les coups, et une ruée qui en percute un étourdit le boss 1,6 s ;
  - la **tache de sang** laissée à l'endroit d'une mort, avec sa cause ;
  - la **parade** (U ou Maj) au moment où la hallebarde frappe : le boss est déséquilibré, et le coup suivant
    est une riposte critique (× 3).
- Appuyer sur **G** : on voit le « cerveau » en direct. Les barres d'entrées et de sorties bougent, et le
  trait blanc marque le seuil de 0,6 au-delà duquel le boss attaque ou esquive. On voit aussi le cercle de
  détection (rouge quand on est dedans), les rayons vers les murs et les piliers, et la ligne de vue.

### 3. Avant / après (Laboratoire → Duels, 2 min)

« À gauche, un boss avec un cerveau au hasard. À droite, le champion. Même adversaire, même graine : seul le
cerveau change. » Laisser tourner 2 ou 3 manches et montrer le score.

### 4. Comment il apprend (Entraîner, 3 min)

- Lancer l'entraînement. Expliquer : 50 boss, 2 combats chacun contre un joueur robot, une note, les meilleurs
  ont des enfants mutés.
- Courbe du haut : le champion. Il ne change que s'il est battu à un examen de 30 combats ; la courbe ne
  fait que monter.
- Courbe du bas : la note moyenne, lissée. Elle monte en dents de scie, car le hasard des combats compte.
- Montrer que tout est sauvegardé (message « ✔ Sauvegardé automatiquement ») et le bouton « Exporter ».

### 5. Le Panthéon (Panthéon, 2 min)

« Même cerveau, même algorithme, même départ : seule la recette d'entraînement change. » Lancer le tournoi
(une dizaine de secondes) et lire la grille :
- aucun boss appris ne meurt dans un coin, alors que le boss à états, qui ignore la règle, y meurt dans 16 %
  des combats : l'anti-camping a été appris ;
- les styles diffèrent : le Spectre ne charge ni ne souffle, le Chasseur charge et souffle le plus ;
- le boss à états reste le plus solide en moyenne : les boss appris se sont spécialisés.

Puis, dans l'onglet Duels, choisir deux boss du Panthéon (par exemple le Chasseur et le Bourreau) et l'épreuve
« Expert » : c'est un duel, le cadre de couleur montre le vainqueur de chaque manche.

### 6. La preuve chiffrée (Laboratoire → Comparer, 1 min)

Lancer les 50 combats (quelques secondes). Lire la phrase de conclusion et la ligne « Par combat », qui
montre les techniques choisies par chaque boss. Résultat de référence avec les réglages par défaut
(robot à 40 %, 2 fioles) :
- **boss écrit à la main** : 42 % de victoires sous Node, 40 % dans le navigateur (il tourne autour du joueur
  et esquive) ;
- **boss fourni** : 50 %.

### 6 bis. La meute des Creux (Laboratoire → Meute, 2 min)

- Montrer le joueur robot contre la meute apprise, puis appuyer sur **G** : cercle de perception de chaque Creux
  (jaune, rouge quand un voisin y est), ses forces (pursue, flanc, evade, flocking, séparation), et le cercle
  d'encerclement autour du chevalier, rouge quand il est encerclé.
- Expliquer : **un seul réseau** pour cinq Creux ; il choisit les poids des comportements, il ne calcule aucune
  force. Note collective : la meute est notée ensemble.
- « Comparer » : 40 combats identiques. Meute apprise 93 % de victoires et chevalier encerclé 7,2 % du temps ;
  meute écrite à la main 28 % et 0,2 %.

### 7. Ce que le projet montre (1 min)

- Les **steering behaviors** de Reynolds : `arrive` pour approcher sans foncer, `seek` vers un point en avance
  sur le cercle pour tourner autour du joueur, `flee` pour reculer, `evade` pour esquiver, `wander` pour errer
  quand le joueur est loin, l'évitement des piliers, plus le confinement contre les murs.
- La **neuroévolution** : pas de rétropropagation, seulement sélection et mutation.
- Une observation intéressante : **la stratégie apprise dépend de l'adversaire**.
  - Contre un robot moyen, le boss se contente de la hallebarde.
  - Contre un robot plus fort, il a combiné hallebarde et souffle.
  - Quand la ruée était trop sûre, il ne faisait plus que des ruées.

  Personne ne lui a dit quelle technique utiliser.
- Les pièges rencontrés et corrigés :
  - un joueur robot trop faible : le boss gagnait 100 % en attaquant sans arrêt ;
  - une stratégie passive : les boss n'attaquaient plus du tout, et tous les combats finissaient en match nul ;
  - un « meilleur » boss souvent chanceux, d'où l'examen sur 30 combats et la comparaison sur 50 combats neufs ;
  - un boss qui restait **planté 97 % du temps** (stratégie « tourelle ») : il rôde maintenant (16 %) ;
  - une **triche sur la récompense** : récompenser l'esquive a donné des boss qui esquivaient sans jamais
    chercher à gagner. Récompenser seulement la riposte qui touche ferme la faille… mais l'esquive n'émerge
    plus. L'évolution n'apprend que ce qui rapporte.
- Le rendu (éclairage, brouillard, particules, effets d'impact) est séparé de la simulation : un test dessine
  un combat entier et vérifie que son état n'a pas changé.
- Niveau 1, la meute des Creux : cinq Creux, un seul réseau partagé, une note collective. La meute apprise
  gagne 93 % de ses combats contre le joueur robot (meute écrite à la main : 28 %) et l'encercle 7,2 % du
  temps (0,2 %). Leçon : un champion qui gagnait 100 % de ses 20 combats de test n'en gagnait que 40 % sur des
  combats neufs.
- Campagne : la meute, un feu de camp, le Veilleur des cendres (feux follets qui poursuivent : `pursue`), un feu
  de camp, le Gardien renforcé (coups retardés contre les parades). La vie passe d'une étape à l'autre ; une
  mort fait recommencer l'étape avec les valeurs qu'on avait en y entrant. Les étapes sont des données : un
  niveau 2 s'ajoute sans code.
- Jouable à la **manette** (disposition des Souls : RB / RT attaques, LT parade, B roulade, X fiole, R3
  verrouillage), au choix du joueur dans les Options.
- **Son** : effets et musiques CC0 (épée, parade, cloche de la riposte, musique de boss), volumes dans les Options.
- **Vidéo de démonstration** : Laboratoire → Présentation (une partie complète jouée par un joueur automatique,
  puis 3 min d'explications : réseau en direct, chaque comportement dessiné),
  ou le fichier `gardien-du-brouillard-presentation.webm`.
- 160 tests automatiques. Chaque règle importante a été cassée volontairement pour vérifier qu'un test
  échoue.

## Questions probables

- **Pourquoi le boss n'esquive-t-il pas ?** Contre ce joueur robot, l'esquive ne rapporte pas assez : forcer
  l'esquive sur un boss entraîné faisait chuter ses victoires de 34 % à 10 %. Quand on l'a récompensée, les
  boss ont triché (esquiver au lieu de gagner). C'est un résultat, pas un bug.

- **Pourquoi les boss du Panthéon ne se battent-ils pas entre eux ?** Leur cerveau a appris à lire un chevalier
  (endurance, fioles, vulnérabilité). Face à un boss, ces entrées n'auraient pas de sens. Ils s'affrontent en
  duel : contre le même chevalier, le meilleur gagne la manche.

- **Pourquoi un joueur robot et pas un humain pour l'entraînement ?** Pour comparer 50 boss, il faut que tous
  affrontent exactement le même adversaire : le robot est reproductible.
- **Pourquoi pas 100 % de victoires ?** C'est voulu : un boss qui gagne toujours aurait appris à battre un
  adversaire trop faible. On vise un équilibre, autour de 50 %.
- **Combien de générations faut-il ?** Le gros du progrès se fait dans les 10 à 100 premières. Au-delà, la
  comparaison sur 50 combats montre que le gain est faible.
