// Combat aérien : crée et fait évoluer les chasseurs (FighterJet), l'avion rapide (AvionRapide),
// les missiles (Missile), les leurres (Flare) et les effets (Spark, Shockwave, Callout).
// Les entités décident de leurs actions ; AirBattle applique les règles qui les relient :
//   - tir : un chasseur verrouillé (wantsToFire) tire un missile ;
//   - leurres : l'avion qui le demande (wantsToDropFlare) en lâche un derrière lui ;
//   - missile : il explose sur la source de chaleur qu'il touche. Sur l'avion, celui-ci est
//     abattu ; sur un leurre, le missile est trompé ; sans carburant, il s'autodétruit ;
//   - contact : un chasseur à moins de CONTACT_RADIUS de l'avion le détruit ;
//   - réapparition : un avion abattu revient après respawnDelay secondes, avec un bouclier.
// La simulation avance par pas de temps fixe (STEP) : advance(secondes) accumule le temps réel
// multiplié par config.timeScale, donc les durées en secondes ne dépendent pas de la cadence
// d'affichage. Les événements (tir, leurre, explosion…) sont envoyés aux listeners, qui s'en
// servent pour les sons et les compteurs. Le canvas est un tore (Vehicle.edges).
class AirBattle {
  static STEP = 1 / 60;
  static MAX_STEPS_PER_FRAME = 5;
  static MAX_EFFECTS = 500;
  static CONTACT_RADIUS = 30;
  static CALLOUT_COOLDOWN = 1.2;
  static EXPLOSION_COLORS = [[255, 200, 80], [255, 140, 40], [255, 245, 200], [150, 150, 160]];

  // config : réglages du menu (voir BattleControls) ; rng et size sont injectables pour les tests
  constructor({ config, rng = Math.random, size = () => ({ width, height }) }) {
    this.config = config;
    this.rng = rng;
    this.size = size;
    this.fighters = [];
    this.missiles = [];
    this.flares = [];
    this.effects = [];
    this.callouts = [];
    this.listeners = [];
    this.calloutTimers = {};
    this.plane = new AvionRapide(0, 0);
    this.plane.rng = rng;
    this.paused = false;
    this.accumulator = 0;
    this.time = 0;
    this.shake = 0;
    this.pilotPoint = null;
    this.resetStats();
    this.applyConfig(config);
    this.reset();
  }

  resetStats() {
    this.stats = { shots: 0, flares: 0, decoyed: 0, kills: 0, expired: 0 };
  }

  // position sur l'un des quatre bords du canvas
  edgePoint() {
    const { width: w, height: h } = this.size();
    const side = Math.floor(this.rng() * 4);
    const along = this.rng();
    if (side === 0) return { x: 0, y: along * h };
    if (side === 1) return { x: w, y: along * h };
    if (side === 2) return { x: along * w, y: 0 };
    return { x: along * w, y: h };
  }

  // Remet le combat à zéro : avion au centre droit, chasseurs répartis sur le bord gauche.
  reset() {
    const { width: w, height: h } = this.size();
    this.missiles.length = 0;
    this.flares.length = 0;
    this.effects.length = 0;
    this.callouts.length = 0;
    this.accumulator = 0;
    this.time = 0;
    this.shake = 0;
    this.resetStats();
    this.plane.respawn(w * 0.7, h * 0.5, this.rng() * Math.PI * 2);
    this.plane.shield = 0;
    const count = this.fighters.length;
    this.fighters.forEach((fighter, i) => {
      fighter.pos.set(w * 0.1, (h * (i + 1)) / (count + 1));
      fighter.vel.set(fighter.baseSpeed, 0);
      fighter.acc.set(0, 0);
      fighter.ammo = fighter.maxAmmo;
      fighter.fuel = FighterJet.FUEL_MAX;
      fighter.fuelEmpty = false;
      fighter.boost = 0;
      fighter.lockProgress = 0;
      fighter.cooldown = 0;
    });
  }

  // Applique les réglages du menu aux entités existantes ; ceux des missiles et des leurres
  // servent aux prochains tirs et largages.
  applyConfig(config = this.config) {
    this.config = config;
    this.setFighterCount(config.fighterCount);
    for (const fighter of this.fighters) {
      fighter.configure({
        speed: config.fighterSpeed, afterburner: config.afterburner, missiles: config.missiles,
        ammo: config.ammo, lockRange: config.lockRange, lockTime: config.lockTime,
      });
    }
    this.plane.configure({
      speed: config.planeSpeed, detection: config.detection, flares: config.flares,
      flareStock: config.flareStock, flareTrigger: config.flareTrigger,
    });
    this.missileConfig = {
      speed: config.missileSpeed,
      agility: config.missileAgility,
      fuel: config.missileFuel,
      seekerAngleDegrees: config.seekerAngle,
      // le chercheur voit au moins aussi loin que la portée de verrouillage
      seekerRange: Math.max(450, config.lockRange * 1.2),
    };
    this.plane.pilotAt = config.planeControl === 'mouse' ? (this.pilotPoint ?? this.centerPoint()) : null;
  }

  centerPoint() {
    const { width: w, height: h } = this.size();
    return { x: w / 2, y: h / 2 };
  }

  setFighterCount(count) {
    while (this.fighters.length > count) this.fighters.pop();
    while (this.fighters.length < count) {
      const point = this.edgePoint();
      const fighter = new FighterJet(point.x, point.y);
      const heading = this.rng() * Math.PI * 2;
      fighter.vel.set(Math.cos(heading) * fighter.baseSpeed, Math.sin(heading) * fighter.baseSpeed);
      this.fighters.push(fighter);
    }
  }

  // le pilote vise (x, y) avec l'avion ; ignoré quand l'avion est automatique
  pilotTo(x, y) {
    this.pilotPoint = { x, y };
    if (this.plane.pilotAt) this.plane.pilotAt = this.pilotPoint;
  }

  // le pilote demande un leurre
  pilotFlare() {
    this.plane.requestFlare();
  }

  onEvent(listener) {
    this.listeners.push(listener);
  }

  emit(name, data = {}) {
    const { width: w } = this.size();
    const detail = { ...data };
    if (detail.x !== undefined) detail.pan = Math.min(1, Math.max(-1, (detail.x / w) * 2 - 1));
    for (const listener of this.listeners) listener(name, detail);
  }

  // ---- effets -------------------------------------------------------------------------

  addEffect(effect) {
    this.effects.push(effect);
    if (this.effects.length > AirBattle.MAX_EFFECTS) this.effects.shift();
  }

  // Explosion : éclair et onde de choc, plus des étincelles dont le nombre et la vitesse
  // suivent scale (0,5 : leurre, 1 : missile, 2,4 : avion).
  explode(x, y, scale) {
    this.addEffect(new Shockwave(x, y, 45 * scale, 0.45 + 0.15 * scale));
    const count = Math.round(10 + 14 * scale);
    for (let i = 0; i < count; i++) {
      const angle = this.rng() * Math.PI * 2;
      const speed = (1 + this.rng() * 5) * Math.sqrt(scale);
      const colors = AirBattle.EXPLOSION_COLORS;
      this.addEffect(new Spark(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, {
        life: 0.5 + this.rng() * 0.7 * Math.sqrt(scale),
        size: 3 + this.rng() * 4 * scale,
        color: colors[Math.floor(this.rng() * colors.length)],
      }));
    }
    this.emit('explosion', { x, y, scale });
  }

  // texte flottant ; un même type n'apparaît pas plus d'une fois par CALLOUT_COOLDOWN
  callout(type, text, x, y, color) {
    if ((this.calloutTimers[type] ?? 0) > 0) return;
    this.calloutTimers[type] = AirBattle.CALLOUT_COOLDOWN;
    this.callouts.push(new Callout(x, y - 30, text, color));
  }

  // ---- actions ------------------------------------------------------------------------

  launch(fighter) {
    const heading = fighter.heading();
    const nose = fighter.r + 4;
    const x = fighter.pos.x + Math.cos(heading) * nose;
    const y = fighter.pos.y + Math.sin(heading) * nose;
    const missile = new Missile(x, y, heading, fighter);
    missile.configure(this.missileConfig);
    missile.seekerRange = this.missileConfig.seekerRange;
    // le missile garde au moins la vitesse du chasseur qui le tire
    missile.vel.setMag(Math.max(missile.vel.mag(), Math.min(fighter.vel.mag(), missile.maxSpeed)));
    this.missiles.push(missile);
    fighter.registerShot();
    this.stats.shots += 1;
    this.addEffect(new Shockwave(x, y, 16, 0.2));
    this.callout('launch', 'FOX 2', fighter.pos.x, fighter.pos.y, [255, 210, 90]);
    this.emit('launch', { x, y });
  }

  dropFlare() {
    const plane = this.plane;
    const length = Math.hypot(plane.vel.x, plane.vel.y) || 1;
    const dirX = plane.vel.x / length;
    const dirY = plane.vel.y / length;
    // le leurre part derrière l'avion, avec un peu de dispersion sur le côté
    const spread = (this.rng() - 0.5) * 4;
    const flare = new Flare(
      plane.pos.x - dirX * (plane.r + 6), plane.pos.y - dirY * (plane.r + 6),
      plane.vel.x * 0.6 - dirY * spread, plane.vel.y * 0.6 + dirX * spread);
    flare.life = this.config.flareLife;
    flare.baseHeat = this.config.flareHeat;
    this.flares.push(flare);
    plane.registerFlare();
    this.stats.flares += 1;
    this.callout('flare', 'LEURRES', plane.pos.x, plane.pos.y, [255, 170, 60]);
    this.emit('flare', { x: flare.pos.x, y: flare.pos.y });
  }

  destroyPlane(cause) {
    const plane = this.plane;
    const { x, y } = plane.pos;
    plane.die();
    this.stats.kills += 1;
    this.explode(x, y, 2.4);
    this.callout('kill', cause === 'contact' ? 'TOUCHÉ !' : 'ABATTU !', x, y, [255, 80, 70]);
    this.shake = 1;
    this.emit('kill', { x, y, cause });
  }

  respawnPlane() {
    const { width: w, height: h } = this.size();
    const point = this.edgePoint();
    // l'avion revient par un bord, en direction du centre
    const heading = Math.atan2(h / 2 - point.y, w / 2 - point.x) + (this.rng() - 0.5);
    this.plane.respawn(point.x, point.y, heading);
  }

  // Un missile touche une source de chaleur, ou s'autodétruit faute de carburant.
  resolveMissile(missile, sources, w, h) {
    let hit = null;
    let hitDistance = Infinity;
    for (const source of sources) {
      if (source.heat() <= 0 || !missile.contacts(source, w, h)) continue;
      if (source === this.plane && this.plane.shield > 0) continue;
      const distance = Steering.distance(missile.pos, source.pos, w, h, missile.r);
      if (distance < hitDistance) {
        hit = source;
        hitDistance = distance;
      }
    }
    if (hit === this.plane) {
      this.missiles.splice(this.missiles.indexOf(missile), 1);
      this.destroyPlane('missile');
    } else if (hit) {
      // le missile est trompé : il explose sur le leurre, qui s'éteint
      hit.age = hit.life;
      this.missiles.splice(this.missiles.indexOf(missile), 1);
      this.stats.decoyed += 1;
      this.explode(hit.pos.x, hit.pos.y, 0.8);
      this.callout('decoyed', 'MISSILE LEURRÉ', hit.pos.x, hit.pos.y, [130, 230, 255]);
      this.emit('decoyed', { x: hit.pos.x, y: hit.pos.y });
    } else if (missile.expired) {
      this.missiles.splice(this.missiles.indexOf(missile), 1);
      this.stats.expired += 1;
      this.explode(missile.pos.x, missile.pos.y, 0.6);
    }
  }

  // ---- simulation ---------------------------------------------------------------------

  // un pas de temps fixe de STEP secondes
  step() {
    const { width: w, height: h } = this.size();
    const dt = AirBattle.STEP;
    const plane = this.plane;
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    for (const type of Object.keys(this.calloutTimers)) {
      this.calloutTimers[type] = Math.max(0, this.calloutTimers[type] - dt);
    }

    if (plane.alive) {
      plane.think(this.fighters, this.missiles, dt, w, h);
      if (plane.wantsToDropFlare) this.dropFlare();
      plane.update();
      plane.edges();
    } else {
      plane.respawnTimer -= dt;
      if (plane.respawnTimer <= 0) this.respawnPlane();
    }

    for (const fighter of this.fighters) {
      fighter.think(plane, this.fighters, dt, w, h);
      if (fighter.wantsToFire) this.launch(fighter);
      fighter.update();
      fighter.edges();
    }

    // contact : un chasseur qui touche l'avion le détruit
    if (plane.alive && plane.shield <= 0) {
      for (const fighter of this.fighters) {
        if (Steering.distance(fighter.pos, plane.pos, w, h, fighter.r) <= AirBattle.CONTACT_RADIUS) {
          this.destroyPlane('contact');
          break;
        }
      }
    }

    const sources = (plane.alive ? [plane] : []).concat(this.flares);
    for (const missile of [...this.missiles]) {
      missile.think(dt, sources, w, h);
      missile.update();
      missile.edges();
      this.resolveMissile(missile, sources, w, h);
    }

    for (const flare of this.flares) {
      flare.step(dt);
      flare.edges();
    }
    this.flares = this.flares.filter(flare => !flare.dead);
    for (const effect of this.effects) effect.step(dt);
    this.effects = this.effects.filter(effect => !effect.dead);
    for (const callout of this.callouts) callout.step(dt);
    this.callouts = this.callouts.filter(callout => !callout.dead);
  }

  // Avance de `seconds` secondes réelles (à l'échelle de temps config.timeScale), en pas fixes.
  // Renvoie le nombre de pas effectués ; 0 en pause.
  advance(seconds) {
    if (this.paused) return 0;
    this.accumulator += Math.min(Math.max(seconds, 0), 0.25) * this.config.timeScale;
    let steps = 0;
    while (this.accumulator >= AirBattle.STEP && steps < AirBattle.MAX_STEPS_PER_FRAME) {
      this.step();
      this.accumulator -= AirBattle.STEP;
      steps++;
    }
    if (steps === AirBattle.MAX_STEPS_PER_FRAME) this.accumulator = 0;
    return steps;
  }

  // un seul pas, pour avancer image par image en pause
  stepOnce() {
    this.step();
  }

  // ---- état pour les sons et l'affichage ------------------------------------------------

  // Valeurs de 0 à 1 qui pilotent les sons : régime des moteurs, post-combustion, alarme de
  // missile (monte quand un missile verrouillé sur l'avion approche), ton de verrouillage.
  soundState() {
    const { width: w, height: h } = this.size();
    const plane = this.plane;
    const clamp01 = value => Math.min(1, Math.max(0, value));
    let speedSum = 0;
    let afterburner = 0;
    let lock = 0;
    let locked = false;
    for (const fighter of this.fighters) {
      speedSum += Math.hypot(fighter.vel.x, fighter.vel.y);
      afterburner = Math.max(afterburner, fighter.boost);
      lock = Math.max(lock, fighter.lockProgress);
      locked = locked || fighter.locked;
    }
    let warning = 0;
    if (plane.alive) {
      for (const missile of this.missiles) {
        if (missile.lock !== plane) continue;
        const distance = Steering.distance(plane.pos, missile.pos, w, h, plane.r);
        warning = Math.max(warning, 1 - clamp01(distance / 600));
      }
    }
    return {
      fighterSpeed: this.fighters.length ? clamp01(speedSum / this.fighters.length / 12) : 0,
      afterburner,
      planeSpeed: plane.alive ? clamp01(Math.hypot(plane.vel.x, plane.vel.y) / 14) : 0,
      warning,
      lock,
      locked,
    };
  }

  // ---- affichage ----------------------------------------------------------------------

  // traits de verrouillage : ambre pendant la montée, rouge une fois verrouillé
  showLocks() {
    const plane = this.plane;
    if (!plane.alive) return;
    push();
    noFill();
    for (const fighter of this.fighters) {
      if (fighter.lockProgress <= 0) continue;
      const progress = fighter.lockProgress;
      const [lockRed, lockGreen, lockBlue] = fighter.locked ? [255, 60, 60] : [255, 190, 60];
      stroke(lockRed, lockGreen, lockBlue, 90 + 120 * progress);
      strokeWeight(fighter.locked ? 2 : 1);
      line(fighter.pos.x, fighter.pos.y, plane.pos.x, plane.pos.y);
      // réticule qui se resserre autour de l'avion
      strokeWeight(2);
      circle(plane.pos.x, plane.pos.y, plane.r * (4.5 - 2.5 * progress));
    }
    pop();
    if (this.fighters.some(fighter => fighter.locked) && Math.floor(this.time * 6) % 2 === 0) {
      push();
      textAlign(CENTER, CENTER);
      textSize(12);
      noStroke();
      fill(255, 70, 70);
      text('VERROUILLÉ', plane.pos.x, plane.pos.y + plane.r + 24);
      pop();
    }
  }

  show({ debug = false } = {}) {
    for (const flare of this.flares) flare.show();
    for (const missile of this.missiles) missile.show({ debug });
    for (const fighter of this.fighters) fighter.show({ debug });
    this.plane.show({ debug });
    this.showLocks();
    for (const effect of this.effects) effect.show();
    for (const callout of this.callouts) callout.show();
  }
}
