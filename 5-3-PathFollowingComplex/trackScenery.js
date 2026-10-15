// Fond du circuit : décor, route, bordures et ligne de départ, dessinés UNE FOIS dans une couche
// en cache (le canvas hors écran est injecté), puis simplement recopiés à chaque image. Ce sont
// du rendu et non des entités : rien ne bouge. Quatre thèmes (prairie, désert, nuit, neige) ont
// chacun leur palette et leur décor. Les décorations sont tirées avec un aléatoire reproductible
// et ne tombent jamais sur la route (decorations() est un calcul pur, testé).
const TrackScenery = (() => {
  const CURB = 6; // largeur de la bordure de chaque côté de la route
  const MAX_DECOR = 170;
  const REFERENCE_AREA = 1200 * 800;

  // facteur de surface : le décor et le grain suivent la taille du canvas (entre 0,5 et 4 fois)
  const areaScale = (width, height) => Math.max(0.5, Math.min(4, (width * height) / REFERENCE_AREA));

  const THEMES = {
    prairie: { label: 'Prairie', ground: ['#86d46f', '#4a9a4f'], speck: '#b3ec98', tuft: '#2f7d3a', road: '#5b6068',
      curb: ['#f4f4f4', '#d8453b'], line: '#f7d44a', decor: ['flower', 'tuft', 'tuft', 'flower', 'rock'] },
    desert: { label: 'Désert', ground: ['#f2d9a6', '#d6a064'], speck: '#fbebc8', tuft: '#9a7b3d', road: '#7a5a45',
      curb: ['#f6e8d0', '#c96a32'], line: '#fff1c9', decor: ['cactus', 'rock', 'tuft', 'cactus'] },
    nuit: { label: 'Nuit', ground: ['#1b2a4a', '#070c1a'], speck: '#33477a', tuft: '#2d5a7a', road: '#1f2433',
      curb: ['#3cf2ff', '#ff3cac'], line: '#e8f6ff', decor: ['star', 'glow', 'glow', 'rock', 'star'] },
    neige: { label: 'Neige', ground: ['#f6faff', '#c6daf0'], speck: '#ffffff', tuft: '#8fb0d4', road: '#6b7684',
      curb: ['#ffffff', '#4b88d9'], line: '#ffffff', decor: ['pine', 'snowball', 'pine', 'rock'] },
  };

  // décorations { x, y, kind, size, rot } : density en % (0..100), rng() dans [0, 1[. Aucune ne
  // chevauche la route, sa bordure ni le bord du canvas.
  function decorations({ points, roadRadius, width, height, density, kinds, rng }) {
    const wanted = Math.round((density / 100) * MAX_DECOR * areaScale(width, height));
    const result = [];
    for (let tries = 0; result.length < wanted && tries < wanted * 12; tries++) {
      const size = 5 + rng() * 9;
      const x = size + rng() * (width - 2 * size);
      const y = size + rng() * (height - 2 * size);
      if (Circuit.distanceToPath(points, { x, y }) < roadRadius + CURB + size + 4) continue;
      result.push({ x, y, size, kind: kinds[Math.min(kinds.length - 1, Math.floor(rng() * kinds.length))], rot: rng() * Math.PI * 2 });
    }
    return result;
  }

  const DRAW = {
    flower(ctx, d) {
      const hue = Math.round((d.rot / (Math.PI * 2)) * 360);
      ctx.fillStyle = `hsl(${hue}, 85%, 68%)`;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d.size * 0.5, Math.sin(a) * d.size * 0.5, d.size * 0.36, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(0, 0, d.size * 0.26, 0, Math.PI * 2);
      ctx.fill();
    },
    tuft(ctx, d, theme) {
      ctx.strokeStyle = theme.tuft;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const a of [-0.5, 0, 0.5]) {
        ctx.moveTo(0, d.size * 0.5);
        ctx.lineTo(Math.sin(a) * d.size * 0.7, -d.size * 0.6);
      }
      ctx.stroke();
    },
    cactus(ctx, d) {
      ctx.fillStyle = '#4f9a4a';
      ctx.strokeStyle = '#2f6a33';
      ctx.lineWidth = 1.5;
      const w = d.size * 0.5;
      for (const [x, y, ww, hh] of [[-w / 2, -d.size, w, d.size * 1.8], [-w * 1.6, -d.size * 0.4, w * 0.8, d.size * 0.35], [w * 0.8, -d.size * 0.7, w * 0.8, d.size * 0.35]]) {
        ctx.beginPath();
        ctx.roundRect(x, y, ww, hh, ww / 2);
        ctx.fill();
        ctx.stroke();
      }
    },
    rock(ctx, d) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.beginPath();
      ctx.ellipse(2, 3, d.size * 0.8, d.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8d939c';
      ctx.beginPath();
      ctx.ellipse(0, 0, d.size * 0.8, d.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(-d.size * 0.25, -d.size * 0.2, d.size * 0.3, d.size * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    star(ctx, d) {
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, d.size * 0.9);
      gradient.addColorStop(0, 'rgba(255, 250, 210, 0.95)');
      gradient.addColorStop(1, 'rgba(255, 250, 210, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, d.size * 0.9, 0, Math.PI * 2);
      ctx.fill();
    },
    glow(ctx, d) {
      const hue = 150 + Math.round((d.rot / (Math.PI * 2)) * 150);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, d.size * 1.6);
      gradient.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.75)`);
      gradient.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, d.size * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsl(${hue}, 100%, 82%)`;
      ctx.beginPath();
      ctx.arc(0, 0, d.size * 0.28, 0, Math.PI * 2);
      ctx.fill();
    },
    pine(ctx, d) {
      ctx.fillStyle = '#2f6a4a';
      for (const [y, scale] of [[0.2, 1], [-0.35, 0.78], [-0.85, 0.55]]) {
        ctx.beginPath();
        ctx.moveTo(0, -d.size * (y + 0.55));
        ctx.lineTo(d.size * 0.7 * scale, d.size * (0.5 - (0.2 - y) * 0.2));
        ctx.lineTo(-d.size * 0.7 * scale, d.size * (0.5 - (0.2 - y) * 0.2));
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(0, -d.size * 1.1, d.size * 0.18, 0, Math.PI * 2);
      ctx.fill();
    },
    snowball(ctx, d) {
      ctx.fillStyle = 'rgba(90, 120, 160, 0.25)';
      ctx.beginPath();
      ctx.ellipse(2, 3, d.size * 0.6, d.size * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, d.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    },
  };

  function tracePath(ctx, points) {
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  }

  // damier de départ, en travers de la route, au premier point (dans le sens de la route)
  function drawStartLine(ctx, points, roadRadius) {
    const a = points[0];
    const b = points[1];
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
    const cell = roadRadius / 2.5;
    for (let row = 0; row < 2; row++) {
      for (let col = -Math.ceil(roadRadius / cell); col < Math.ceil(roadRadius / cell); col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? '#ffffff' : '#101018';
        ctx.fillRect(row * cell - cell, col * cell, cell, cell);
      }
    }
    ctx.restore();
  }

  // dessine tout le fond : spec = { width, height, points, roadRadius, theme, seed, density }
  function render(ctx, spec) {
    const theme = THEMES[spec.theme];
    if (!theme) throw new RangeError(`Thème inconnu : ${spec.theme}.`);
    const { width, height, points, roadRadius } = spec;
    ctx.save();
    // sol : dégradé du centre vers les bords
    const ground = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.hypot(width, height) / 2);
    ground.addColorStop(0, theme.ground[0]);
    ground.addColorStop(1, theme.ground[1]);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, width, height);
    const rng = Circuit.seededRandom(spec.seed * 31 + Object.keys(THEMES).indexOf(spec.theme));
    // grain du sol
    ctx.fillStyle = theme.speck;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < Math.round(380 * areaScale(width, height)); i++) ctx.fillRect(rng() * width, rng() * height, 2, 2);
    ctx.globalAlpha = 1;
    // décor
    for (const d of decorations({ points, roadRadius, width, height, density: spec.density, kinds: theme.decor, rng })) {
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.kind !== 'pine' && d.kind !== 'cactus') ctx.rotate(d.rot);
      DRAW[d.kind](ctx, d, theme);
      ctx.restore();
    }
    // route : bordure rayée, asphalte, ligne centrale pointillée
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    tracePath(ctx, points);
    ctx.strokeStyle = theme.curb[0];
    ctx.lineWidth = roadRadius * 2 + CURB * 2;
    ctx.stroke();
    ctx.setLineDash([16, 16]);
    ctx.strokeStyle = theme.curb[1];
    ctx.stroke();
    ctx.setLineDash([]);
    tracePath(ctx, points);
    ctx.strokeStyle = theme.road;
    ctx.lineWidth = roadRadius * 2;
    ctx.stroke();
    ctx.setLineDash([14, 16]);
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    drawStartLine(ctx, points, roadRadius);
    ctx.restore();
  }

  // arène sans circuit : même sol et même décor, entourés d'une bordure à l'écart du bord du
  // canvas. spec = { width, height, theme, seed, density, inset }
  function renderArena(ctx, spec) {
    const theme = THEMES[spec.theme];
    if (!theme) throw new RangeError(`Thème inconnu : ${spec.theme}.`);
    const { width, height, inset } = spec;
    // le décor évite le contour de l'arène exactement comme il évite une route
    const outline = [{ x: inset, y: inset }, { x: width - inset, y: inset }, { x: width - inset, y: height - inset }, { x: inset, y: height - inset }];
    ctx.save();
    const ground = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.hypot(width, height) / 2);
    ground.addColorStop(0, theme.ground[0]);
    ground.addColorStop(1, theme.ground[1]);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, width, height);
    const rng = Circuit.seededRandom(spec.seed * 31 + 5 + Object.keys(THEMES).indexOf(spec.theme));
    ctx.fillStyle = theme.speck;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < Math.round(380 * areaScale(width, height)); i++) ctx.fillRect(rng() * width, rng() * height, 2, 2);
    ctx.globalAlpha = 1;
    for (const d of decorations({ points: outline, roadRadius: 4, width, height, density: spec.density, kinds: theme.decor, rng })) {
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.kind !== 'pine' && d.kind !== 'cactus') ctx.rotate(d.rot);
      DRAW[d.kind](ctx, d, theme);
      ctx.restore();
    }
    // bordure : double trait rayé, comme les bords de route
    ctx.lineJoin = 'round';
    tracePath(ctx, outline);
    ctx.strokeStyle = theme.curb[0];
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.setLineDash([16, 16]);
    ctx.strokeStyle = theme.curb[1];
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // debug : la ligne centrale du chemin que Vehicle.follow() suit
  function drawCenterLine(ctx, points) {
    ctx.save();
    tracePath(ctx, points);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  return { THEMES, CURB, MAX_DECOR, areaScale, decorations, render, renderArena, drawCenterLine };
})();
