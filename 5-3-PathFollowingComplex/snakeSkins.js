// Designs des serpents : des données et des calculs purs, sans dessin. Chaque touche « t » tire
// un design original (couleur, motif, forme de tête, yeux, nom) et des dimensions qui restent dans
// RANGES (longueur, taille, vitesse), pour ne jamais dépasser les limites de l'exemple.
// Les couleurs sont des chaînes CSS hsl() utilisables directement par le contexte 2D.
// Le rng est injecté (retourne un nombre dans [0, 1[) : les tests le fixent.
const SnakeSkins = (() => {
  const PATTERNS = ['gradient', 'bands', 'dots', 'rainbow', 'neon'];
  const PATTERN_LABELS = { gradient: 'Dégradé', bands: 'Bandes', dots: 'Pois', rainbow: 'Arc-en-ciel', neon: 'Néon' };
  const HEADS = ['round', 'horns', 'crest', 'ears'];
  const EYES = ['round', 'slit'];
  // limites : nombre d'anneaux, rayon de la tête (px), vitesse max de la tête (px / image)
  const RANGES = { length: [8, 28], size: [9, 20], speed: [1.2, 3.2] };
  const ANIMALS = ['Vipère', 'Couleuvre', 'Mamba', 'Naja', 'Python', 'Boa'];
  const ADJECTIVES = ['ambrée', 'safran', 'lagon', 'cendrée', 'mauve', 'corail', 'menthe', 'onyx', 'aurore', 'givre'];
  const BASE = { name: 'Classique', hue: 130, sat: 70, pattern: 'gradient', head: 'round', eye: 'round' };

  const wrapHue = hue => ((hue % 360) + 360) % 360;
  const hsl = (hue, sat, light) => `hsl(${Math.round(wrapHue(hue))}, ${Math.round(sat)}%, ${Math.round(light)}%)`;
  const pick = (list, rng) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  const between = ([min, max], rng) => min + (max - min) * rng();

  // style de l'anneau i (1 = derrière la tête) sur n : { fill, stroke, accent (point ou null) }
  function ringStyle(skin, i, n) {
    const t = n > 1 ? (i - 1) / (n - 1) : 0;
    const { hue, sat } = skin;
    let h = hue;
    let light = 52;
    let accent = null;
    switch (skin.pattern) {
      case 'gradient':
        h = hue + 50 * t;
        light = 56 - 24 * t;
        break;
      case 'bands':
        if (i % 2 === 0) {
          h = hue + 150;
          light = 64;
        } else {
          light = 48;
        }
        break;
      case 'dots':
        light = 44 + 10 * t;
        if (i % 3 === 0) accent = hsl(hue + 180, sat, 78);
        break;
      case 'rainbow':
        h = hue + i * 26;
        light = 54;
        break;
      case 'neon':
        return { fill: '#0f1320', stroke: hsl(hue, 100, 62), accent: i % 2 === 0 ? hsl(hue, 100, 72) : null };
      default:
        throw new RangeError(`Motif inconnu : ${skin.pattern}.`);
    }
    return { fill: hsl(h, sat, light), stroke: hsl(h, sat, Math.max(8, light - 26)), accent };
  }

  function headStyle(skin) {
    if (skin.pattern === 'neon') return { fill: '#0f1320', stroke: hsl(skin.hue, 100, 62), accent: hsl(skin.hue, 100, 72) };
    return { fill: hsl(skin.hue, skin.sat, 50), stroke: hsl(skin.hue, skin.sat, 24), accent: hsl(skin.hue + 180, skin.sat, 70) };
  }

  // design tiré au hasard : tout est choisi dans des listes ou des intervalles bornés
  function random(rng) {
    return {
      name: `${pick(ANIMALS, rng)} ${pick(ADJECTIVES, rng)}`,
      hue: rng() * 360,
      sat: 55 + rng() * 35,
      pattern: pick(PATTERNS, rng),
      head: pick(HEADS, rng),
      eye: pick(EYES, rng),
    };
  }

  // options d'un nouveau serpent : design + dimensions dans RANGES
  function randomOptions(rng) {
    return {
      skin: random(rng),
      length: Math.round(between(RANGES.length, rng)),
      size: Math.round(between(RANGES.size, rng)),
      maxSpeed: Math.round(between(RANGES.speed, rng) * 10) / 10,
    };
  }

  return { PATTERNS, PATTERN_LABELS, HEADS, EYES, RANGES, BASE, hsl, ringStyle, headStyle, random, randomOptions };
})();
