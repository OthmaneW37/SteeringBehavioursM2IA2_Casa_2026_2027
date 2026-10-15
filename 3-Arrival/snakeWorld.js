// Le monde : les serpents, la nourriture, les étincelles et le repère de la souris. Il fait la
// SÉLECTION DE L'ACTION (quelle cible pour chaque tête, selon la formation), compose les forces
// de pilotage retournées par les entités (somme pondérée), puis laisse chaque entité appliquer
// sa locomotion. Il gère aussi l'aspiration et l'avalement de la nourriture.
// Formations :
//  - carrousel : les têtes se répartissent sur un cercle qui tourne autour de la souris ;
//  - conga : le premier suit la souris, chacun des autres arrive sur la queue du précédent ;
//  - chasse : le premier suit la souris, les autres visent la nourriture la plus proche de leur
//    bouche, et errent (wander) quand il n'y en a pas, sans sortir de la scène.
// Adversaires (SnakeWander) : ils errent avec wander et choisissent eux-mêmes leur action. Ils
// mangent aussi (la nourriture va à la bouche la plus proche, joueur ou adversaire).
// Partie (dès qu'il y a au moins un adversaire) :
//  - la tête du joueur touche le corps d'un adversaire : l'adversaire perd 1 point de vie ;
//    à 0, il est vaincu et se change en fruits ;
//  - la tête d'un adversaire touche le corps du joueur : le joueur perd BITE_LOSS anneaux
//    (puis BITE_COOLDOWN secondes de répit) ; mordu alors qu'il n'a plus que MIN_RINGS anneaux,
//    son serpent meurt ;
//  - victoire : tous les adversaires sont vaincus ; défaite (game over) : plus aucun serpent.
// game.state : 'free' (pas d'adversaire), 'playing', 'won', 'lost'. Une partie finie est figée.
class SnakeWorld {
  static MAX_SPARKLES = 240;
  static CAROUSEL_SPIN = 0.35; // radians par seconde
  static WEIGHTS = { arrive: 1, separation: 0.8, wander: 0.6, bounds: 1.5 };
  static BOUNDS_MARGIN = 60;
  static MAX_DT = 0.05;
  static BITE_LOSS = 2;
  static BITE_COOLDOWN = 1.2;
  // les premiers anneaux du joueur, collés à sa tête, ne comptent pas pour une morsure
  static BITE_SKIP = 3;

  constructor({ config, width, height, rng = Math.random }) {
    this.config = config;
    this.width = width;
    this.height = height;
    this.rng = rng;
    this.food = new FoodField();
    this.cursor = new MouseTarget(width / 2, height / 2);
    this.pointer = { x: width / 2, y: height / 2 };
    this.snakes = [];
    this.rivals = [];
    this.sparkles = [];
    this.sparklePool = [];
    this.reset();
  }

  reset() {
    this.snakes = [];
    this.rivals = [];
    this.food.clear();
    this.sparklePool.push(...this.sparkles);
    this.sparkles = [];
    this.stats = { eaten: 0, score: 0, stolen: 0, bites: 0, hits: 0 };
    this.time = 0;
    this.appliedLength = null;
    // serpents du joueur morts et adversaires vaincus : ils ne sont pas recréés par applyConfig
    this.fallen = 0;
    this.defeated = 0;
    this.game = { state: 'free', time: 0 };
    this.applyConfig();
    this.game.state = this.config.rivals > 0 ? 'playing' : 'free';
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.setPointer(this.pointer.x, this.pointer.y);
  }

  tuning() {
    const c = this.config;
    return { speed: c.speed, force: c.force, braking: c.braking, spacing: c.spacing, size: c.size };
  }

  // transmet les réglages : nombre de serpents (les existants sont conservés), designs, mouvement ;
  // la longueur n'est imposée que lorsque son réglage change (sinon on garde ce qu'ils ont mangé)
  applyConfig() {
    const c = this.config;
    const alive = Math.max(0, c.snakeCount - this.fallen);
    while (this.snakes.length < alive) {
      const i = this.snakes.length;
      const angle = (i / Math.max(1, c.snakeCount)) * Math.PI * 2;
      const x = this.width / 2 + Math.cos(angle) * Math.min(160, this.width / 4);
      const y = this.height / 2 + Math.sin(angle) * Math.min(160, this.height / 4);
      const snake = new Snake(x, y, Skins.forIndex(c.skin, i), { ...this.tuning(), length: c.length });
      snake.facing = angle + Math.PI / 2;
      this.snakes.push(snake);
    }
    this.snakes.length = alive;
    this.snakes.forEach((snake, i) => {
      snake.skin = Skins.forIndex(c.skin, i);
      snake.configure(this.tuning());
    });
    if (this.appliedLength !== c.length) {
      for (const snake of this.allSnakes()) snake.setLength(c.length);
      this.appliedLength = c.length;
    }
    this.applyRivals();
  }

  rivalTuning() {
    const c = this.config;
    return { ...this.tuning(), speed: c.rivalSpeed, health: c.rivalHealth,
      wanderRadius: c.wanderRadius, wanderDistance: c.wanderDistance, wanderJitter: c.wanderJitter };
  }

  // adversaires : créés dans les coins, avec une vitesse de départ pour que wander ait un cap
  applyRivals() {
    const c = this.config;
    const remaining = Math.max(0, c.rivals - this.defeated);
    while (this.rivals.length < remaining) {
      const i = this.rivals.length;
      const x = i % 2 === 0 ? this.width * 0.15 : this.width * 0.85;
      const y = i < 2 ? this.height * 0.2 : this.height * 0.8;
      const rival = new SnakeWander(x, y, Skins.ADVERSARY, { ...this.rivalTuning(), length: c.length });
      const angle = this.rng() * Math.PI * 2;
      rival.vel.set(Math.cos(angle) * 2, Math.sin(angle) * 2);
      rival.facing = angle;
      rival.biteCooldown = 0;
      this.rivals.push(rival);
    }
    this.rivals.length = remaining;
    for (const rival of this.rivals) {
      rival.configure(this.rivalTuning());
      rival.configureWander(this.rivalTuning());
      rival.setMaxHealth(c.rivalHealth);
    }
    // ajouter un adversaire pendant une partie en lance une ; tout retirer revient au jeu libre
    if (this.game.state === 'free' && remaining > 0) this.game.state = 'playing';
    if (this.game.state === 'playing' && c.rivals === 0) this.game.state = 'free';
  }

  // tous les serpents : ceux du joueur puis les adversaires
  allSnakes() {
    return this.rivals.length ? [...this.snakes, ...this.rivals] : this.snakes;
  }

  // position de la souris, ramenée dans la scène
  setPointer(x, y) {
    this.pointer = { x: Math.min(this.width, Math.max(0, x)), y: Math.min(this.height, Math.max(0, y)) };
  }

  // ---- sélection de l'action ----

  // { kind: 'arrive', target, offset, label } ou { kind: 'wander', label }
  plan(index) {
    const snake = this.snakes[index];
    const mouse = this.cursor.pos;
    const formation = this.config.formation;
    if (formation === 'carrousel') {
      const n = this.snakes.length;
      if (n === 1) return { kind: 'arrive', target: mouse.copy(), offset: 0, label: 'suit la souris' };
      const angle = (index / n) * Math.PI * 2 + this.time * SnakeWorld.CAROUSEL_SPIN;
      const radius = SnakeWorld.carouselRadius(n, this.config.size);
      return { kind: 'arrive', target: createVector(mouse.x + Math.cos(angle) * radius, mouse.y + Math.sin(angle) * radius),
        offset: 0, label: 'carrousel' };
    }
    if (index === 0) return { kind: 'arrive', target: mouse.copy(), offset: 0, label: 'suit la souris' };
    if (formation === 'conga') {
      const leader = this.snakes[index - 1];
      return { kind: 'arrive', target: leader.tail.pos.copy(), offset: this.config.spacing, label: `suit ${leader.skin.label}` };
    }
    const food = this.food.nearest(snake.mouth());
    if (food) return { kind: 'arrive', target: food.pos.copy(), offset: 0, label: `chasse : ${food.info.label.toLowerCase()}` };
    return { kind: 'wander', label: 'erre' };
  }

  static carouselRadius(n, size) {
    return 30 + 18 * n + size * 2;
  }

  // forces de la tête : arrive ou wander, + séparation entre têtes, + rester dans la scène
  steerHead(snake, plan) {
    const w = SnakeWorld.WEIGHTS;
    if (plan.kind === 'arrive') {
      snake.applyForce(snake.steerTo(plan.target, plan.offset).mult(w.arrive));
    } else {
      snake.target = null;
      snake.applyForce(snake.wander().mult(w.wander));
    }
    if (this.config.formation !== 'conga' && this.allSnakes().length > 1) {
      snake.applyForce(Steering.separation(snake, this.allSnakes(), this.config.size * 4).mult(w.separation));
    }
    if (plan.kind === 'wander' || this.config.formation === 'chasse') {
      snake.applyForce(Steering.stayInside(snake, 0, 0, this.width, this.height, SnakeWorld.BOUNDS_MARGIN).mult(w.bounds));
    }
    snake.label = snake.boost > 0 ? `${plan.label} · turbo` : plan.label;
  }

  get over() {
    return this.game.state === 'won' || this.game.state === 'lost';
  }

  step(dt) {
    const h = Math.min(SnakeWorld.MAX_DT, Math.max(0, dt));
    // partie finie : la scène est figée, seules les étincelles finissent leur vie
    if (this.over) {
      this.stepSparkles(h);
      return;
    }
    this.time += h;
    if (this.game.state === 'playing') this.game.time += h;
    this.cursor.applyForce(this.cursor.follow(createVector(this.pointer.x, this.pointer.y)));
    this.cursor.update(h);
    if (this.config.foodAuto) {
      this.food.spawn(h, this.config.foodRate, this.config.foodMax, this.width, this.height, this.rng);
    }
    // les cibles sont toutes choisies avant de bouger, pour que l'ordre des serpents ne compte pas
    const plans = this.snakes.map((_, i) => this.plan(i));
    this.snakes.forEach((snake, i) => this.steerHead(snake, plans[i]));
    for (const rival of this.rivals) {
      const head = this.nearestPlayerHead(rival.pos);
      rival.steerAlone(this.width, this.height, head ? head.pos : null);
    }
    for (const snake of this.allSnakes()) snake.update(h);
    this.feed(h);
    this.checkBites(h);
    this.updateGame();
    this.stepSparkles(h);
  }

  stepSparkles(h) {
    for (const sparkle of this.sparkles) sparkle.update(h);
    const dead = this.sparkles.filter(sparkle => !sparkle.alive);
    if (dead.length) {
      this.sparkles = this.sparkles.filter(sparkle => sparkle.alive);
      this.sparklePool.push(...dead);
    }
  }

  // serpent du joueur dont la tête est la plus proche d'un point (null s'il n'y en a plus)
  nearestPlayerHead(point) {
    let best = null;
    let bestDistance = Infinity;
    for (const snake of this.snakes) {
      const d = Math.hypot(snake.pos.x - point.x, snake.pos.y - point.y);
      if (d < bestDistance) {
        best = snake;
        bestDistance = d;
      }
    }
    return best;
  }

  // bouche la plus proche d'un point : { snake, distance } (snake null s'il n'y a aucun serpent)
  nearestMouth(point) {
    let best = { snake: null, distance: Infinity };
    for (const snake of this.allSnakes()) {
      const mouth = snake.mouth();
      const distance = Math.hypot(mouth.x - point.x, mouth.y - point.y);
      if (distance < best.distance) best = { snake, distance };
    }
    return best;
  }

  // aspiration et avalement : la nourriture choisit la bouche la plus proche
  feed(dt) {
    for (const snake of this.allSnakes()) snake.hungry = false;
    const radius = this.config.attraction;
    for (const food of [...this.food.items]) {
      if (food.state === 'swallowed') {
        food.applyForce(food.followMouth(food.eater.mouth()));
      } else {
        const { snake, distance } = this.nearestMouth(food.pos);
        if (snake && distance <= snake.mouthRadius) {
          food.beginSwallow(snake);
          this.swallowed(snake, food);
        } else if (snake && distance < radius) {
          food.applyForce(food.attractTo(snake.mouth(), 1 - distance / radius));
          snake.hungry = true;
        } else {
          food.applyForce(food.settle());
        }
      }
      food.update(dt);
    }
    this.food.collect();
  }

  swallowed(snake, food) {
    const info = snake.eat(food.kind);
    const mouth = snake.mouth();
    if (snake instanceof SnakeWander) {
      // un adversaire mange : c'est un fruit volé au joueur
      this.stats.stolen++;
      this.burst(mouth.x, mouth.y, '#ff4d4d', 'volé !');
      return;
    }
    this.stats.eaten++;
    this.stats.score += info.score;
    let label = info.grow >= 0 ? `+${info.grow}` : `−${-info.grow}`;
    if (info.boost) label = 'TURBO !';
    this.burst(mouth.x, mouth.y, info.color, label);
  }

  // point de contact entre une tête et le corps d'un autre serpent (à partir de l'anneau from),
  // ou null : la tête touche un anneau quand leurs disques se recouvrent
  static contact(head, body, from = 0) {
    for (let i = from; i < body.rings.length; i++) {
      const ring = body.rings[i];
      if (Math.hypot(ring.pos.x - head.pos.x, ring.pos.y - head.pos.y) < head.r * 0.8 + body.ringDiameter(i + 1) / 2) return ring.pos;
    }
    return null;
  }

  // morsures dans les deux sens (voir l'en-tête) ; un serpent mort ou un adversaire vaincu est
  // retiré tout de suite
  checkBites(dt) {
    for (const snake of [...this.snakes]) {
      snake.biteCooldown = Math.max(0, (snake.biteCooldown ?? 0) - dt);
      for (const rival of [...this.rivals]) {
        // le joueur mord le corps de l'adversaire
        const hit = SnakeWorld.contact(snake, rival);
        if (hit && rival.takeHit(1)) {
          this.stats.hits++;
          this.burst(hit.x, hit.y, '#7CFFB2', rival.defeated ? 'K.O. !' : `−1 ♥ (${rival.health}/${rival.maxHealth})`);
          if (rival.defeated) this.defeatRival(rival);
          continue;
        }
        // l'adversaire mord le corps du joueur
        if (snake.biteCooldown > 0) continue;
        // les anneaux collés à la tête sont protégés, mais la queue reste toujours vulnérable
        const where = SnakeWorld.contact(rival, snake, Math.min(SnakeWorld.BITE_SKIP, snake.length - 1));
        if (!where) continue;
        this.stats.bites++;
        if (snake.length <= Snake.MIN_RINGS) {
          this.killSnake(snake);
          break;
        }
        snake.grow(-SnakeWorld.BITE_LOSS);
        snake.biteCooldown = SnakeWorld.BITE_COOLDOWN;
        this.burst(where.x, where.y, '#ff4d4d', `Aïe ! −${SnakeWorld.BITE_LOSS}`);
      }
    }
  }

  // adversaire vaincu : retiré, et son corps se change en fruits
  defeatRival(rival) {
    this.rivals.splice(this.rivals.indexOf(rival), 1);
    this.defeated++;
    rival.rings.forEach((ring, i) => {
      if (i % 4 === 0) this.dropFood(ring.pos.x, ring.pos.y, i % 12 === 0 ? 'etoile' : 'pomme');
    });
    this.burst(rival.pos.x, rival.pos.y, '#ffd84d', 'Adversaire vaincu !');
  }

  killSnake(snake) {
    this.snakes.splice(this.snakes.indexOf(snake), 1);
    this.fallen++;
    for (const ring of snake.rings) this.burst(ring.pos.x, ring.pos.y, snake.skin.head[0], null);
    this.burst(snake.pos.x, snake.pos.y, '#ff4d4d', 'Dévoré !');
  }

  // fin de partie : victoire quand tous les adversaires sont vaincus, défaite sans serpent
  updateGame() {
    if (this.game.state !== 'playing') return this.game.state;
    if (this.snakes.length === 0) this.game.state = 'lost';
    else if (this.rivals.length === 0 && this.defeated > 0) this.game.state = 'won';
    return this.game.state;
  }

  // dépôt de nourriture (clic) ; kind « hasard » : tirage pondéré
  dropFood(x, y, kind = 'hasard') {
    return this.food.add(x, y, kind === 'hasard' ? Food.randomKind(this.rng) : kind);
  }

  burst(x, y, color, label) {
    const add = (vx, vy, life, text) => {
      if (this.sparkles.length >= SnakeWorld.MAX_SPARKLES) return;
      const sparkle = this.sparklePool.length ? this.sparklePool.pop() : new Sparkle(x, y);
      this.sparkles.push(sparkle.reset(x, y, vx, vy, color, life, text));
    };
    for (let i = 0; i < 10; i++) {
      const angle = this.rng() * Math.PI * 2;
      const speed = 2 + this.rng() * 3;
      add(Math.cos(angle) * speed, Math.sin(angle) * speed, 0.5 + this.rng() * 0.3, null);
    }
    if (label) add(0, -1.5, 0.9, label);
  }

  // têtes de serpent vues comme des menaces pour les lettres du menu
  threats() {
    return this.allSnakes().map(snake => ({ pos: snake.pos, radius: snake.r * 2.5 }));
  }

  summary() {
    const lengths = this.snakes.map(snake => snake.length);
    return {
      eaten: this.stats.eaten,
      score: this.stats.score,
      stolen: this.stats.stolen,
      bites: this.stats.bites,
      defeated: this.defeated,
      rivalsTotal: this.config.rivals,
      state: this.game.state,
      time: this.game.time,
      longest: lengths.length ? Math.max(...lengths) : 0,
      rings: lengths.reduce((a, b) => a + b, 0),
      food: this.food.count,
    };
  }

  foodNear(snake) {
    const mouth = snake.mouth();
    return this.food.items.some(food => Math.hypot(food.pos.x - mouth.x, food.pos.y - mouth.y) < this.config.attraction);
  }

  show(images, ctx, debug) {
    for (const food of this.food.items) food.show(images, ctx, this.time);
    for (const snake of this.allSnakes()) snake.show(images, ctx);
    for (const sparkle of this.sparkles) sparkle.show(ctx);
    this.cursor.show();
    if (!debug.enabled) return;
    const flags = {};
    for (const name of Object.keys(DebugOptions.LAYERS)) flags[name] = DebugOptions.visible(debug, name);
    for (const snake of this.allSnakes()) snake.showDebug(flags, this.config.attraction, this.foodNear(snake), ctx);
    if (flags.vectors) for (const food of this.food.items) food.showDebug();
  }
}
