// Designs des serpents et de la nourriture : des icônes SVG originales, générées en texte à
// partir de données (couleurs, ornements). Ce module ne dessine rien lui-même : il produit les
// chaînes SVG, leurs URL « data: » et les couleurs des anneaux (calcul pur, testable sous Node).
// La fabrique d'images est injectée (buildImages), ce qui évite toute dépendance au DOM.
const Skins = (() => {
  // Chaque design : tête (dégradé clair → foncé), corps (dégradé ou bandes), yeux, ornement de
  // tête et icône répétée sur les anneaux (iconEvery anneaux), lueur éventuelle.
  const LIST = [
    { id: 'jade', label: 'Dragon de jade', head: ['#6ef0a0', '#1f7a4a'], body: ['#43d17a', '#0f4d2e'],
      eye: '#ffd166', ornament: 'horns', accent: '#ffe7a3', icon: 'leaf', iconColor: '#c9ffd9', iconEvery: 4 },
    { id: 'neon', label: 'Néon synthwave', head: ['#3cf2ff', '#6a2cff'], body: ['#1de9ff', '#ff3cac'],
      eye: '#ffffff', ornament: 'visor', accent: '#3cf2ff', icon: 'bolt', iconColor: '#fff6a8', iconEvery: 3, glow: '#3cf2ff' },
    { id: 'corail', label: 'Corail des récifs', head: ['#ff6b74', '#c81d2c'], bands: ['#ff4d5a', '#1b1b24', '#ffd23f', '#1b1b24'],
      eye: '#fff3c4', ornament: 'stripes', accent: '#1b1b24', icon: null, iconColor: null, iconEvery: 0 },
    { id: 'galaxie', label: 'Galaxie', head: ['#8b6cf0', '#1a1240'], body: ['#6a4bd8', '#0d0a26'],
      eye: '#9ff3ff', ornament: 'moon', accent: '#ffe9a8', icon: 'star', iconColor: '#fff4c2', iconEvery: 3, glow: '#a58bff' },
    { id: 'braise', label: 'Braise', head: ['#ffd36b', '#ff5e3a'], body: ['#ffcf5c', '#b3221a'],
      eye: '#2b0d00', ornament: 'crest', accent: '#fff07a', icon: 'flame', iconColor: '#fff3b0', iconEvery: 4, glow: '#ff8a3d' },
    { id: 'bonbon', label: 'Bonbon', head: ['#ffc2e2', '#ff7ab8'], bands: ['#ff9ecf', '#fff4fb', '#9ef0d4', '#fff4fb'],
      eye: '#3a1830', ornament: 'bow', accent: '#7be0c0', icon: 'heart', iconColor: '#ff5fa2', iconEvery: 4 },
  ];

  // design réservé aux serpents adverses (SnakeWander) : il n'apparaît pas dans la galerie
  const ADVERSARY = { id: 'vipere', label: 'Vipère adverse', head: ['#5a5a66', '#121218'], body: ['#3a3a46', '#0b0b10'],
    eye: '#ff2a2a', ornament: 'spikes', accent: '#ff3b3b', icon: 'spike', iconColor: '#ff4d4d', iconEvery: 2, glow: '#ff2a2a' };

  const find = id => LIST.find(skin => skin.id === id) ?? (id === ADVERSARY.id ? ADVERSARY : undefined);

  // design numéro i (les serpents suivants prennent les designs dans l'ordre, après le premier)
  function forIndex(firstId, index) {
    const start = Math.max(0, LIST.findIndex(skin => skin.id === firstId));
    return LIST[(start + index) % LIST.length];
  }

  // ---- couleurs ----
  function parseHex(hex) {
    const match = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!match) throw new RangeError(`Couleur invalide : ${hex}.`);
    const n = parseInt(match[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  const toHex = rgb => '#' + rgb.map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('');

  // interpolation linéaire entre deux couleurs, t borné dans [0, 1]
  function mix(a, b, t) {
    const k = Math.min(1, Math.max(0, t));
    const ca = parseHex(a);
    const cb = parseHex(b);
    return toHex(ca.map((c, i) => c + (cb[i] - c) * k));
  }

  // couleur de remplissage et de contour de l'anneau index (1 = juste derrière la tête) sur count
  function ringColors(skin, index, count) {
    const t = count > 1 ? (index - 1) / (count - 1) : 0;
    const fill = skin.bands ? skin.bands[(index - 1) % skin.bands.length] : mix(skin.body[0], skin.body[1], t);
    return { fill, stroke: mix(fill, '#000000', 0.38) };
  }

  const hasIcon = (skin, index) => Boolean(skin.icon) && skin.iconEvery > 0 && index % skin.iconEvery === 0;

  // ---- SVG ----
  const svg = (size, viewBox, body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${body}</svg>`;

  // contour de la tête, vue de dessus, museau vers la droite (+x)
  const HEAD_PATH = 'M8 50 C8 22 40 14 66 22 C86 28 96 40 96 50 C96 60 86 72 66 78 C40 86 8 78 8 50 Z';

  const ORNAMENTS = {
    horns: s => `<path d="M24 30 C14 22 8 14 3 7 C13 11 23 17 31 26 Z" fill="${s.accent}" stroke="#5c4310" stroke-width="2"/>`
      + `<path d="M24 70 C14 78 8 86 3 93 C13 89 23 83 31 74 Z" fill="${s.accent}" stroke="#5c4310" stroke-width="2"/>`
      + '<path d="M28 42 q6 -7 12 0 M28 58 q6 -7 12 0 M42 50 q6 -7 12 0" fill="none" stroke="#0c3d24" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>',
    visor: s => `<rect x="57" y="22" width="16" height="56" rx="8" fill="#0b0b1a" opacity=".85"/>`
      + `<path d="${HEAD_PATH}" fill="none" stroke="${s.accent}" stroke-width="3"/>`
      + `<path d="M22 50 H44 M44 50 L50 40 M44 50 L50 60" fill="none" stroke="${s.accent}" stroke-width="2" stroke-linecap="round" opacity=".8"/>`,
    stripes: s => `<g clip-path="url(#clip-${s.id})"><rect x="22" y="0" width="9" height="100" fill="${s.accent}"/>`
      + '<rect x="31" y="0" width="7" height="100" fill="#ffd23f"/>'
      + `<rect x="38" y="0" width="9" height="100" fill="${s.accent}"/></g>`,
    moon: s => `<path d="M40 38 a12 12 0 1 0 0 24 a9 9 0 1 1 0 -24 z" fill="${s.accent}"/>`
      + '<circle cx="22" cy="40" r="1.8" fill="#fff"/><circle cx="26" cy="62" r="1.4" fill="#fff"/>'
      + '<circle cx="52" cy="30" r="1.2" fill="#fff"/><circle cx="54" cy="70" r="1.6" fill="#fff"/><circle cx="16" cy="52" r="1.1" fill="#fff"/>',
    crest: s => '<path d="M6 50 C14 40 18 46 22 38 C26 46 30 42 34 34 C38 44 44 46 50 50 C44 54 38 56 34 66 C30 58 26 54 22 62 C18 54 14 60 6 50 Z" '
      + `fill="${s.accent}" stroke="#c2410c" stroke-width="2" stroke-linejoin="round"/>`,
    spikes: s => `<path d="M32 24 L22 4 L42 19 Z M32 76 L22 96 L42 81 Z M18 36 L2 26 L24 31 Z M18 64 L2 74 L24 69 Z" fill="${s.accent}" stroke="#2a0000" stroke-width="1.5" stroke-linejoin="round"/>`
      + `<path d="M55 21 L77 28 M55 79 L77 72" stroke="${s.accent}" stroke-width="4" stroke-linecap="round"/>`,
    bow: s => `<path d="M24 50 L9 37 Q4 50 9 63 Z M24 50 L39 37 Q44 50 39 63 Z" fill="${s.accent}" stroke="#2f8a6c" stroke-width="2" stroke-linejoin="round"/>`
      + '<circle cx="24" cy="50" r="4.5" fill="#fff4fb" stroke="#2f8a6c" stroke-width="2"/>'
      + '<circle cx="50" cy="32" r="3" fill="#fff" opacity=".8"/><circle cx="48" cy="68" r="3" fill="#fff" opacity=".8"/>',
  };

  function eye(skin, cy) {
    return `<ellipse cx="66" cy="${cy}" rx="9" ry="8" fill="${skin.eye}" stroke="#14141c" stroke-width="2"/>`
      + `<circle cx="69" cy="${cy}" r="3.6" fill="#101018"/><circle cx="70.6" cy="${cy - 1.6}" r="1.3" fill="#fff"/>`;
  }

  function headSvg(skin) {
    const outline = mix(skin.head[1], '#000000', 0.45);
    const ornament = ORNAMENTS[skin.ornament] ? ORNAMENTS[skin.ornament](skin) : '';
    return svg(100, '0 0 100 100',
      `<defs><linearGradient id="g-${skin.id}" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0" stop-color="${skin.head[0]}"/><stop offset="1" stop-color="${skin.head[1]}"/></linearGradient>`
      + `<clipPath id="clip-${skin.id}"><path d="${HEAD_PATH}"/></clipPath></defs>`
      + `<path d="${HEAD_PATH}" fill="url(#g-${skin.id})" stroke="${outline}" stroke-width="3"/>`
      + '<ellipse cx="46" cy="36" rx="24" ry="7" fill="#fff" opacity=".22"/>'
      + ornament + eye(skin, 32) + eye(skin, 68)
      + '<circle cx="90" cy="45" r="1.7" fill="#14141c"/><circle cx="90" cy="55" r="1.7" fill="#14141c"/>');
  }

  const ICON_PATHS = {
    leaf: 'M5 19C5 11 11 5 19 5C19 13 13 19 5 19Z M5 19L13 11',
    bolt: 'M13 2L4 14H11L10 22L19 10H12Z',
    star: 'M12 2L14.9 8.6L22 9.2L16.6 13.9L18.2 21L12 17.2L5.8 21L7.4 13.9L2 9.2L9.1 8.6Z',
    flame: 'M12 2C13 6 17 8 17 13A5 5 0 0 1 7 13C7 11 8 9.5 9 8.5C9 10.5 10 11.5 11 11.5C11 8.5 10 5.5 12 2Z',
    heart: 'M12 21C12 21 4 16 4 10A4.5 4.5 0 0 1 12 7.2A4.5 4.5 0 0 1 20 10C20 16 12 21 12 21Z',
    spike: 'M12 3L20 20H4Z',
  };

  function iconSvg(name, color) {
    const d = ICON_PATHS[name];
    if (!d) throw new RangeError(`Icône inconnue : ${name}.`);
    return svg(48, '0 0 24 24',
      `<path d="${d}" fill="${color}" stroke="${mix(color, '#000000', 0.55)}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`);
  }

  const FOOD_SVG = {
    pomme: '<path d="M32 18C22 10 8 16 8 32C8 48 20 58 32 54C44 58 56 48 56 32C56 16 42 10 32 18Z" fill="#ff4b55" stroke="#9e1b26" stroke-width="2.5"/>'
      + '<path d="M32 18C31 12 33 8 36 5" stroke="#6b3e1f" stroke-width="3" fill="none" stroke-linecap="round"/>'
      + '<path d="M35 12C40 4 50 4 54 8C48 14 40 15 35 12Z" fill="#5ed36a" stroke="#2f8a3a" stroke-width="2"/>'
      + '<ellipse cx="20" cy="28" rx="5" ry="8" fill="#fff" opacity=".45" transform="rotate(20 20 28)"/>',
    etoile: '<path d="M32 4L40 23L60 24L44 37L50 58L32 46L14 58L20 37L4 24L24 23Z" fill="#ffd23f" stroke="#c88a00" stroke-width="3" stroke-linejoin="round"/>'
      + '<circle cx="27" cy="32" r="2.6" fill="#5a3b00"/><circle cx="37" cy="32" r="2.6" fill="#5a3b00"/>'
      + '<path d="M27 39Q32 43 37 39" stroke="#5a3b00" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    piment: '<path d="M14 18C30 22 46 30 56 54C40 48 22 40 12 26C10 22 11 18 14 18Z" fill="#ff3b2f" stroke="#a3150c" stroke-width="2.5" stroke-linejoin="round"/>'
      + '<path d="M14 18C10 12 12 8 18 6" stroke="#3fae49" stroke-width="4" fill="none" stroke-linecap="round"/>'
      + '<path d="M10 20C12 14 18 14 20 20Z" fill="#3fae49"/>'
      + '<path d="M20 24C30 28 38 34 44 42" stroke="#fff" stroke-width="2.5" opacity=".5" fill="none" stroke-linecap="round"/>',
    champignon: '<path d="M22 36L42 36L40 56Q32 60 24 56Z" fill="#fff1dc" stroke="#b08b62" stroke-width="2.5"/>'
      + '<path d="M6 36C6 16 58 16 58 36Q32 42 6 36Z" fill="#9b5de5" stroke="#5a2a96" stroke-width="2.5"/>'
      + '<circle cx="20" cy="26" r="4" fill="#fff"/><circle cx="34" cy="20" r="3.4" fill="#fff"/><circle cx="46" cy="28" r="4.2" fill="#fff"/>',
  };

  function foodSvg(kind) {
    if (!FOOD_SVG[kind]) throw new RangeError(`Nourriture inconnue : ${kind}.`);
    return svg(64, '0 0 64 64', FOOD_SVG[kind]);
  }

  const dataUrl = text => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);

  // couleur hexadécimale + opacité -> chaîne rgba() pour le contexte 2D
  function rgba(hex, alpha) {
    const [r, g, b] = parseHex(hex);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  // Taille (en pixels) de la copie bitmap de chaque image : assez grande pour un écran haute densité.
  const RASTER = { head: 192, icon: 64, food: 128 };

  // makeImage(url, taille) -> image dessinable. Une image par tête, par icône d'anneau (couleur
  // propre au design) et par nourriture.
  function buildImages(makeImage) {
    const images = { heads: {}, icons: {}, food: {} };
    for (const skin of [...LIST, ADVERSARY]) {
      images.heads[skin.id] = makeImage(dataUrl(headSvg(skin)), RASTER.head);
      if (skin.icon) images.icons[skin.id] = makeImage(dataUrl(iconSvg(skin.icon, skin.iconColor)), RASTER.icon);
    }
    for (const kind of Object.keys(FOOD_SVG)) images.food[kind] = makeImage(dataUrl(foodSvg(kind)), RASTER.food);
    return images;
  }

  // Fabrique d'images « pré-rastérisées » : une image SVG est re-dessinée (vectoriellement) à
  // chaque drawImage, ce qui coûte cher. On la copie donc une fois, après chargement, dans un
  // canvas bitmap de la taille voulue ; c'est ce canvas qui est dessiné ensuite.
  // createImage() -> objet avec onload/src (new Image()), makeCanvas(w, h) -> canvas : injectés.
  function spriteFactory(createImage, makeCanvas) {
    return (url, size) => {
      const sprite = { complete: false, naturalWidth: 0, canvas: null };
      const image = createImage();
      image.onload = () => {
        const canvas = makeCanvas(size, size);
        canvas.getContext('2d').drawImage(image, 0, 0, size, size);
        Object.assign(sprite, { canvas, complete: true, naturalWidth: size });
      };
      image.src = url;
      return sprite;
    };
  }

  // dessine une image centrée sur l'origine courante (après translate/rotate de p5) si elle est chargée
  function drawCentered(ctx, image, size) {
    if (!image || image.complete === false || image.naturalWidth === 0) return false;
    ctx.drawImage(image.canvas ?? image, -size / 2, -size / 2, size, size);
    return true;
  }

  return { LIST, ADVERSARY, find, forIndex, mix, ringColors, hasIcon, headSvg, iconSvg, foodSvg, dataUrl, buildImages, drawCentered, rgba, spriteFactory, RASTER,
    FOOD_KINDS: Object.keys(FOOD_SVG), ICONS: Object.keys(ICON_PATHS) };
})();
