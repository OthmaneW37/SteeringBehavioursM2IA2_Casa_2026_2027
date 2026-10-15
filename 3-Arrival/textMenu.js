// Menu cliquable dessiné dans la scène avec font.textToPoints de p5. Chaque point des lettres
// est un véhicule LetterDot : les mots se forment par arrive(), se déforment quand la souris ou
// un serpent passe dedans (fuite à rayon limité) puis se reforment. Survoler un mot le fait
// onduler, cliquer dessus appelle onSelect(id). Fermer le menu éparpille les lettres.
// États : open → closing (CLOSE_TIME secondes) → closed ; open() les reforme depuis où elles sont.
// La police est injectée (en navigateur : loadFont ; dans les tests : une fausse police).
// Performances : un point au repos que rien ne dérange n'est pas recalculé, et chaque mot est
// rempli en un seul tracé (un appel fill() par mot au lieu d'un par point).
class TextMenu {
  static CLOSE_TIME = 0.7;
  static FADE_IN = 2.5; // opacité gagnée par seconde à l'ouverture
  static POINTER_RADIUS = 45;
  static WEIGHTS = { home: 1, pointer: 1.6, threat: 2.2, scatter: 1 };
  static PADDING = 12;

  static HINT = 'Cliquez sur un mot  ·  touche « m » pour rouvrir ce menu';

  // title : { label, colors: [gauche, droite] } ; items : [{ id, label, color }] ;
  // open : ouvert au départ ; hint : texte sous le menu, ou fonction qui le retourne
  constructor({ font, title, items, onSelect = () => {}, rng = Math.random, open = true, hint = TextMenu.HINT }) {
    this.font = font;
    this.title = title;
    this.items = items;
    this.onSelect = onSelect;
    this.rng = rng;
    this.dots = [];
    this.lines = [];
    this.state = open ? 'open' : 'closed';
    this.hint = hint;
    this.closeLeft = 0;
    this.hovered = null;
    this.alpha = 0;
    this.time = 0;
    this.width = 0;
    this.height = 0;
  }

  get visible() {
    return this.state !== 'closed';
  }

  get isOpen() {
    return this.state === 'open';
  }

  // tailles de police adaptées à la scène
  static sizes(w, h) {
    return { title: Math.min(w * 0.12, h * 0.16), item: Math.min(w * 0.06, h * 0.075) };
  }

  // calcule les lignes (titre puis entrées) et les points des lettres, centrés horizontalement ;
  // les points existants sont réutilisés (ils glissent vers leur nouvelle place)
  layout(w, h) {
    this.width = w;
    this.height = h;
    const sizes = TextMenu.sizes(w, h);
    const specs = [{ id: null, label: this.title.label, size: sizes.title, y: h * 0.25, sample: 0.1 }];
    this.items.forEach((item, i) => specs.push({
      id: item.id, label: item.label, color: item.color, size: sizes.item, y: h * 0.4 + i * sizes.item * 1.35, sample: 0.16,
    }));

    const homes = [];
    this.lines = specs.map((spec, index) => {
      const probe = this.font.textBounds(spec.label, 0, 0, spec.size);
      const x = w / 2 - probe.w / 2 - probe.x;
      const bounds = this.font.textBounds(spec.label, x, spec.y, spec.size);
      for (const point of this.font.textToPoints(spec.label, x, spec.y, spec.size, { sampleFactor: spec.sample })) {
        homes.push({ x: point.x, y: point.y, line: index });
      }
      return { ...spec, bounds };
    });

    while (this.dots.length < homes.length) {
      this.dots.push(new LetterDot(this.rng() * w, this.rng() * h));
    }
    this.dots.length = homes.length;
    this.byLine = this.lines.map(() => []);
    homes.forEach((home, i) => {
      this.dots[i].home.set(home.x, home.y);
      this.dots[i].line = home.line;
      this.byLine[home.line].push(this.dots[i]);
    });
    return this.lines;
  }

  // entrée cliquable sous le point (x, y), ou null (menu fermé, titre, vide)
  itemAt(x, y) {
    if (!this.isOpen) return null;
    const p = TextMenu.PADDING;
    for (const line of this.lines) {
      if (line.id === null) continue;
      const b = line.bounds;
      if (x >= b.x - p && x <= b.x + b.w + p && y >= b.y - p && y <= b.y + b.h + p) return line.id;
    }
    return null;
  }

  hover(x, y) {
    this.hovered = this.itemAt(x, y);
    return this.hovered;
  }

  // clic : déclenche l'entrée sous le pointeur ; retourne vrai si le clic a été pris par le menu
  click(x, y) {
    const id = this.itemAt(x, y);
    if (id === null) return false;
    this.onSelect(id);
    return true;
  }

  open() {
    this.state = 'open';
  }

  close() {
    if (this.state !== 'open') return;
    this.state = 'closing';
    this.closeLeft = TextMenu.CLOSE_TIME;
    this.hovered = null;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  // un point de chaque mot, au hasard : là où la nourriture peut tomber à la fermeture
  samplePoints(n) {
    if (!this.dots.length) return [];
    const points = [];
    for (let i = 0; i < n; i++) {
      const dot = this.dots[Math.floor(this.rng() * this.dots.length)];
      points.push({ x: dot.pos.x, y: dot.pos.y });
    }
    return points;
  }

  // threats : [{ pos, radius }] (têtes de serpent) ; pointer : position de la souris ou null
  step(dt, pointer, threats = []) {
    this.time += dt;
    if (this.state === 'closed') return;
    if (this.state === 'closing') {
      this.closeLeft -= dt;
      if (this.closeLeft <= 0) {
        this.state = 'closed';
        this.alpha = 0;
        return;
      }
      this.alpha = this.closeLeft / TextMenu.CLOSE_TIME;
    } else {
      this.alpha = Math.min(1, this.alpha + TextMenu.FADE_IN * dt);
    }
    const w = TextMenu.WEIGHTS;
    if (this.state === 'closing') {
      const center = createVector(this.width / 2, this.height / 2);
      for (const dot of this.dots) {
        dot.applyForce(dot.fleeFrom(center).mult(w.scatter));
        dot.update();
      }
      return;
    }
    // test rapide (carré englobant) avant de calculer une fuite
    const near = (dot, point, radius) => Math.abs(dot.pos.x - point.x) < radius && Math.abs(dot.pos.y - point.y) < radius;
    this.lines.forEach((line, index) => {
      const waving = line.id !== null && line.id === this.hovered;
      for (const dot of this.byLine[index]) {
        const pointerNear = pointer && near(dot, pointer, TextMenu.POINTER_RADIUS);
        const close = threats.filter(threat => near(dot, threat.pos, threat.radius));
        if (!waving && !pointerNear && close.length === 0 && dot.resting) continue;
        const wave = waving ? Math.sin(this.time * 8 + dot.home.x * 0.05) * 4 : 0;
        dot.applyForce(dot.homeForce(wave).mult(w.home));
        if (pointerNear) dot.applyForce(dot.fleeFrom(pointer, TextMenu.POINTER_RADIUS).mult(w.pointer));
        for (const threat of close) dot.applyForce(dot.fleeFrom(threat.pos, threat.radius).mult(w.threat));
        dot.update();
      }
    });
  }

  // couleur d'une entrée : plus claire quand elle est survolée
  lineColor(line) {
    return line.id === this.hovered ? Skins.mix(line.color, '#ffffff', 0.45) : line.color;
  }

  // couleur d'un point : titre en dégradé horizontal, entrée survolée plus claire
  dotColor(dot) {
    const line = this.lines[dot.line];
    if (!line) return '#ffffff';
    if (line.id === null) {
      const t = this.width ? dot.home.x / this.width : 0;
      return Skins.mix(this.title.colors[0], this.title.colors[1], t);
    }
    return this.lineColor(line);
  }

  // ctx : contexte 2D du canvas (drawingContext de p5)
  show(ctx, debug = false) {
    if (!this.visible || this.alpha <= 0) return;
    push();
    noStroke();
    // pastille derrière le mot survolé
    if (this.hovered !== null) {
      const line = this.lines.find(l => l.id === this.hovered);
      const p = TextMenu.PADDING;
      fill(255, 255, 255, 18);
      rect(line.bounds.x - p, line.bounds.y - p, line.bounds.w + 2 * p, line.bounds.h + 2 * p, 14);
    }
    ctx.globalAlpha = this.alpha;
    this.lines.forEach((line, index) => {
      if (line.id === null) {
        // titre : un dégradé horizontal pour tout le mot
        const gradient = ctx.createLinearGradient(line.bounds.x, 0, line.bounds.x + line.bounds.w, 0);
        gradient.addColorStop(0, this.title.colors[0]);
        gradient.addColorStop(1, this.title.colors[1]);
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = this.lineColor(line);
      }
      const size = (line.id === null ? 5 : 4.2) * (line.id !== null && line.id === this.hovered ? 1.3 : 1);
      ctx.beginPath();
      for (const dot of this.byLine[index]) dot.trace(ctx, size);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (this.isOpen) {
      fill(255, 255, 255, 150 * this.alpha);
      textAlign(CENTER, TOP);
      textSize(13);
      const last = this.lines[this.lines.length - 1];
      text(typeof this.hint === 'function' ? this.hint() : this.hint, this.width / 2, last.bounds.y + last.bounds.h + 28);
    }
    if (debug) {
      noFill();
      stroke('#ffd84d');
      for (const line of this.lines) rect(line.bounds.x, line.bounds.y, line.bounds.w, line.bounds.h);
    }
    pop();
  }
}
