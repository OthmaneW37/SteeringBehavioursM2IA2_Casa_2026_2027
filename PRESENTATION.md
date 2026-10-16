# Présenter le projet en 12 minutes

## Avant de commencer

1. Lancer le serveur dans ce dossier : `python -m http.server`, puis ouvrir `http://localhost:8000`.
2. Faire **Ctrl + F5** une fois, pour être sûr d'avoir la dernière version des fichiers.
3. Garder la fenêtre d'aide (« Comment ça marche ? ») pour la fin ou pour les questions.

## Déroulé conseillé

### 1. L'idée, en une phrase (1 min)

« Le boss n'est pas programmé à la main. Il a un petit réseau de neurones : 12 informations entrent
(distance, angle, fatigue et vie du joueur, s'il est en train de boire…), 5 décisions sortent (avancer ou
reculer, hallebarde, esquive, ruée, souffle). Il a appris à se battre par sélection naturelle. »

### 2. Jouer 1 minute (mode ⚔️ Combattre)

- Montrer le télégraphe : le cône rouge se remplit pendant 0,6 s, puis la roulade (Espace) au bon moment.
- Frapper pendant la récupération du boss.
- Si possible, montrer la phase enragée à 30 % de vie (aura rouge, boss plus rapide).
- Montrer les nouvelles mécaniques :
  - la **ruée** : la ligne rouge vise l'endroit où vous allez être, comme `pursue`. On l'évite en changeant de
    direction au dernier moment ;
  - le **souffle** : une nappe de brume verte qui brûle et ralentit ;
  - une **fiole d'Estus** (E) : elle soigne, mais pendant 1 s on est une cible facile ;
  - la **tache de sang** laissée à l'endroit d'une mort, avec sa cause.
- Appuyer sur **G** : on voit le « cerveau » en direct. Les barres d'entrées et de sorties bougent, et le
  trait blanc marque le seuil de 0,6 au-delà duquel le boss attaque ou esquive. On voit aussi le cercle de
  détection (rouge quand on est dedans) et les rayons vers les murs.

### 3. Avant / après (mode 🎬 Démonstration, 2 min)

« À gauche, un boss avec un cerveau au hasard. À droite, le champion. Même adversaire, même graine : seul le
cerveau change. » Laisser tourner 2 ou 3 manches et montrer le score.

### 4. Comment il apprend (mode 🧬 Entraîner, 3 min)

- Lancer l'entraînement. Expliquer : 50 boss, 2 combats chacun contre un joueur robot, une note, les meilleurs
  ont des enfants mutés.
- Courbe du haut : le champion. Il ne change que s'il est battu à un examen de 30 combats ; la courbe ne
  fait que monter.
- Courbe du bas : la note moyenne, lissée. Elle monte en dents de scie, car le hasard des combats compte.
- Montrer que tout est sauvegardé (message « ✔ Sauvegardé automatiquement ») et le bouton « Exporter ».

### 5. Le Panthéon (mode 🏛️ Panthéon, 2 min)

« Même cerveau, même algorithme, même départ : seule la recette d'entraînement change. » Lancer le tournoi
(une dizaine de secondes) et lire la grille :
- chaque colonne est gagnée par le boss entraîné contre ce joueur robot (case encadrée et ★) ;
- deux styles sont apparus : le Spectre et le Chasseur soufflent la brume, les autres frappent sans arrêt ;
- le Spectre, puni surtout quand il est touché, a appris à ne pas s'exposer… et gagne rarement : la note
  décide de ce que le boss apprend.

Puis, en mode 🎬, choisir deux boss du Panthéon (par exemple le Chasseur et le Bourreau) et l'épreuve
« Expert » : c'est un duel, le cadre de couleur montre le vainqueur de chaque manche.

### 6. La preuve chiffrée (mode 📊 Comparer, 1 min)

Lancer les 50 combats (quelques secondes). Lire la phrase de conclusion et la ligne « Par combat », qui
montre les techniques choisies par chaque boss. Résultat de référence avec les réglages par défaut
(robot à 40 %, 2 fioles) :
- **boss écrit à la main** : 22 % de victoires ;
- **boss fourni** : 42 %, soit presque 2 fois plus.

### 7. Ce que le projet montre (1 min)

- Les **steering behaviors** de Reynolds : `arrive` pour approcher sans foncer, `flee` pour reculer, `evade`
  pour esquiver, `wander` pour errer quand le joueur est loin, plus le confinement contre les murs.
- La **neuroévolution** : pas de rétropropagation, seulement sélection et mutation.
- Une observation intéressante : **la stratégie apprise dépend de l'adversaire**.
  - Contre un robot moyen, le boss se contente de la hallebarde.
  - Contre un robot plus fort, il a combiné hallebarde et souffle.
  - Quand la ruée était trop sûre, il ne faisait plus que des ruées.

  Personne ne lui a dit quelle technique utiliser.
- Les pièges rencontrés et corrigés :
  - un joueur robot trop faible : le boss gagnait 100 % en attaquant sans arrêt ;
  - une stratégie passive : les boss n'attaquaient plus du tout, et tous les combats finissaient en match nul ;
  - un « meilleur » boss souvent chanceux, d'où l'examen sur 30 combats et la comparaison sur 50 combats neufs.
- 69 tests automatiques. Chaque règle importante a été cassée volontairement pour vérifier qu'un test
  échoue.

## Questions probables

- **Pourquoi les boss du Panthéon ne se battent-ils pas entre eux ?** Leur cerveau a appris à lire un chevalier
  (endurance, fioles, vulnérabilité). Face à un boss, ces entrées n'auraient pas de sens. Ils s'affrontent en
  duel : contre le même chevalier, le meilleur gagne la manche.

- **Pourquoi un joueur robot et pas un humain pour l'entraînement ?** Pour comparer 50 boss, il faut que tous
  affrontent exactement le même adversaire : le robot est reproductible.
- **Pourquoi pas 100 % de victoires ?** C'est voulu : un boss qui gagne toujours aurait appris à battre un
  adversaire trop faible. On vise un équilibre, autour de 50 %.
- **Combien de générations faut-il ?** Le gros du progrès se fait dans les 10 à 100 premières. Au-delà, la
  comparaison sur 50 combats montre que le gain est faible.
