// Génération du circuit : des calculs purs, sans dessin. Un circuit est une boucle de points
// autour du centre du canvas, définie par une FORME (une fonction du rayon selon l'angle), un
// nombre de segments, une irrégularité (le rayon de chaque point varie un peu, lissé sur les
// voisins pour éviter les angles trop durs) et une graine : la même graine redonne le même
// circuit. Comme le rayon dépend de l'angle, la boucle ne se croise jamais.
// La taille est une part (en %) de la zone disponible : le circuit est mis à l'échelle pour
// tenir dans le canvas en laissant la place du menu à gauche.
const Circuit = (() => {
  // ax et ay étirent la forme horizontalement et verticalement ; radius(angle) la déforme
  const SHAPES = {
    cercle: { label: 'Cercle', ax: 1, ay: 1, radius: () => 1 },
    ovale: { label: 'Ovale', ax: 1, ay: 0.62, radius: () => 1 },
    trefle: { label: 'Trèfle', ax: 1, ay: 1, radius: a => 1 + 0.2 * Math.cos(3 * a) },
    haricot: { label: 'Haricot', ax: 1, ay: 0.8, radius: a => 1 + 0.18 * Math.cos(a) - 0.3 * Math.max(0, Math.sin(a)) ** 4 },
    fleur: { label: 'Fleur', ax: 1, ay: 1, radius: a => 1 + 0.26 * Math.cos(5 * a) },
  };
  const MENU_CLEARANCE = 270; // largeur réservée au menu, à gauche
  const MARGIN = 30;
  const JITTER = 0.18; // variation maximale du rayon quand l'irrégularité vaut 1

  // aléatoire reproductible (mulberry32) : la graine du circuit
  function seededRandom(seed) {
    let a = (Math.floor(seed) * 2654435761 + 12345) >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // settings : { shape, circuitSize (%), circuitSegments, circuitIrregularity (0..1), roadWidth
  // (demi-largeur de la route), circuitSeed } ; retourne { points: [{ x, y }], radius }
  function build(settings, width, height) {
    const shape = SHAPES[settings.shape];
    if (!shape) throw new RangeError(`Forme inconnue : ${settings.shape}.`);
    const n = settings.circuitSegments;
    const rng = seededRandom(settings.circuitSeed);
    const noise = Array.from({ length: n }, () => rng() * 2 - 1);
    const raw = [];
    for (let i = 0; i < n; i++) {
      const smooth = (noise[(i + n - 1) % n] + 2 * noise[i] + noise[(i + 1) % n]) / 4;
      const angle = (i / n) * Math.PI * 2;
      const r = shape.radius(angle) * (1 + settings.circuitIrregularity * JITTER * smooth);
      raw.push({ x: Math.cos(angle) * r * shape.ax, y: Math.sin(angle) * r * shape.ay });
    }
    const extentX = Math.max(...raw.map(p => Math.abs(p.x)));
    const extentY = Math.max(...raw.map(p => Math.abs(p.y)));
    const halfW = Math.max(1, width / 2 - MENU_CLEARANCE - settings.roadWidth);
    const halfH = Math.max(1, height / 2 - MARGIN - settings.roadWidth);
    const scale = Math.min(halfW / extentX, halfH / extentY) * (settings.circuitSize / 100);
    const points = raw.map(p => ({ x: width / 2 + p.x * scale, y: height / 2 + p.y * scale }));
    return { points, radius: settings.roadWidth };
  }

  function segmentDistance(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lengthSq = abx * abx + aby * aby;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
    return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
  }

  // distance d'un point à la boucle fermée
  function distanceToPath(points, p) {
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      best = Math.min(best, segmentDistance(p, points[i], points[(i + 1) % points.length]));
    }
    return best;
  }

  // vrai si les segments [a,b] et [c,d] se croisent (strictement)
  function segmentsCross(a, b, c, d) {
    const side = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
  }

  return { SHAPES, MENU_CLEARANCE, MARGIN, seededRandom, build, distanceToPath, segmentsCross };
})();
