// Fond : un dégradé circulaire coloré, centré sur le curseur, animé par la modulation de
// fréquence du son (fmSynth.js). Un seul dégradé radial, sans formes ni symétrie :
// - le centre suit le curseur de la souris ;
// - la hauteur du son (position horizontale de la cible) décale la teinte ;
// - la profondeur de modulation (position verticale) ondule légèrement la teinte, avec le
//   même ratio que le son, et éclaircit les couleurs ;
// - le vibrato fait respirer le rayon.
// Le calcul est fait par des fonctions pures testées. Pour rester fluide, le dégradé est
// peint sur un canvas hors écran à 1/4 de résolution, puis agrandi : un dégradé lisse n'y
// perd rien et coûte ~16 fois moins de pixels.
const GradientBackground = (() => {
  const PARAMETERS = {
    speed: { min: 0, max: 3, step: 0.05, initial: 1, decimals: 2 },        // vitesse d'écoulement
    rings: { min: 1, max: 12, step: 1, initial: 1, decimals: 0 },          // cycles de couleurs
    reactivity: { min: 0, max: 1, step: 0.05, initial: 0.7, decimals: 2 }, // sensibilité à la FM
  };
  const RENDER_SCALE = 0.25;
  const STOPS_PER_RING = 12;
  const PHASE_SPEED = 1.2;         // degrés de teinte par image à la vitesse 1
  const SMOOTHING = 0.5;           // lissage de la hauteur et de la profondeur FM
  const FOCUS_SMOOTHING = 0.8;     // le centre rattrape presque immédiatement le curseur
  const MAX_WOBBLE = 40;           // degrés d'ondulation de la teinte à pleine profondeur

  function createSettings() {
    const settings = {};
    for (const [name, range] of Object.entries(PARAMETERS)) settings[name] = range.initial;
    return settings;
  }

  function setParameter(settings, name, value) {
    const range = PARAMETERS[name];
    if (!range) throw new RangeError(`Paramètre inconnu : ${name}.`);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < range.min || value > range.max) {
      throw new RangeError(`${name} doit être un nombre entre ${range.min} et ${range.max}.`);
    }
    settings[name] = value;
  }

  function bindSlider(input, output, name, settings) {
    const { decimals } = PARAMETERS[name];
    const synchronize = () => {
      setParameter(settings, name, Number(input.value));
      output.value = settings[name].toFixed(decimals);
    };
    input.addEventListener('input', synchronize);
    synchronize();
  }

  function createState() {
    return { time: 0, phase: 0, fx: 0.5, fy: 0.5, pitch: 0.5, depth: 0, ratio: 2, vibrato: 0, vibratoPhase: 0 };
  }

  // Position du curseur (en pixels du canvas) ramenée dans [0, 1] x [0, 1].
  function focusFrom(pointer, w, h) {
    const clamp01 = value => Math.min(1, Math.max(0, value));
    return { nx: w > 0 ? clamp01(pointer.x / w) : 0.5, ny: h > 0 ? clamp01(pointer.y / h) : 0.5 };
  }

  // Avance l'animation d'une image. fm est la sortie de FMSynth.modulationState, focus la
  // position du curseur normalisée ({ nx, ny }, voir focusFrom).
  function step(state, settings, fm, focus = { nx: 0.5, ny: 0.5 }) {
    state.fx += (focus.nx - state.fx) * FOCUS_SMOOTHING;
    state.fy += (focus.ny - state.fy) * FOCUS_SMOOTHING;
    state.pitch += (fm.nx - state.pitch) * SMOOTHING;
    state.depth += (fm.depth - state.depth) * SMOOTHING;
    state.ratio = fm.ratio;
    state.vibrato = fm.vibrato;
    state.vibratoPhase = fm.vibratoPhase;
    // une modulation plus profonde accélère l'écoulement des couleurs
    state.phase += PHASE_SPEED * settings.speed * (1 + settings.reactivity * state.depth * 2);
    state.time += 1;
    return state;
  }

  const wrapHue = degrees => ((degrees % 360) + 360) % 360;

  // Arrêts du dégradé radial : `rings` cycles de couleurs entre le centre et le bord.
  // La phase fait couler les teintes vers l'extérieur ; hueShift est la hauteur du son.
  // Modulation de fréquence de la teinte : wobble * sin(ratio * cycle + modPhase), où ratio
  // est celui du son et wobble vient de l'indice de modulation.
  function rainbowStops(phase, rings, options = {}) {
    const { hueShift = 0, wobble = 0, ratio = 2, modPhase = 0, brightness = 0 } = options;
    const count = rings * STOPS_PER_RING;
    const stops = [];
    for (let j = 0; j <= count; j++) {
      const offset = j / count;
      const cycle = offset * rings * Math.PI * 2;
      stops.push({
        offset,
        hue: wrapHue(offset * rings * 360 - phase + hueShift + wobble * Math.sin(ratio * cycle + modPhase)),
        saturation: 100,
        // la luminosité ondule doucement, et une modulation profonde l'éclaircit
        lightness: Math.min(75, Math.max(25, 50 + 8 * Math.sin(cycle * 2 + phase * 0.02) + 15 * brightness)),
      });
    }
    return stops;
  }

  // Paramètres de dessin de l'image courante, en coordonnées du canvas.
  function layers(state, settings, w, h) {
    const unit = Math.hypot(w, h) / 2;
    const react = settings.reactivity;
    return {
      a: {
        x: state.fx * w,
        y: state.fy * h,
        // le vibrato fait respirer le rayon, la profondeur le gonfle
        radius: unit * (0.9 + 0.05 * Math.sin(state.time * 0.02) + 0.05 * react * state.vibrato + 0.12 * react * state.depth),
        stops: rainbowStops(state.phase, settings.rings, {
          hueShift: state.pitch * 360,
          wobble: react * state.depth * MAX_WOBBLE,
          ratio: state.ratio,
          modPhase: state.vibratoPhase,
          brightness: react * state.depth,
        }),
      },
    };
  }

  const hsl = s => `hsl(${s.hue} ${s.saturation}% ${s.lightness}%)`;

  // Peint le dégradé sur ctx (w x h, en coordonnées du canvas principal).
  function paint(ctx, w, h, drawing) {
    const layer = drawing.a;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const gradient = ctx.createRadialGradient(layer.x, layer.y, 0, layer.x, layer.y, layer.radius);
    for (const stop of layer.stops) gradient.addColorStop(stop.offset, hsl(stop));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // makeCanvas(width, height) est injectable pour tester sans navigateur
  function createRenderer(makeCanvas) {
    let offscreen = null;
    let offContext = null;

    function draw(targetContext, w, h, drawing) {
      const offW = Math.max(1, Math.ceil(w * RENDER_SCALE));
      const offH = Math.max(1, Math.ceil(h * RENDER_SCALE));
      if (!offscreen || offscreen.width !== offW || offscreen.height !== offH) {
        offscreen = makeCanvas(offW, offH);
        offContext = offscreen.getContext('2d');
      }
      offContext.save();
      offContext.setTransform(offW / w, 0, 0, offH / h, 0, 0);
      paint(offContext, w, h, drawing);
      offContext.restore();
      targetContext.save();
      targetContext.imageSmoothingEnabled = true;
      targetContext.drawImage(offscreen, 0, 0, w, h);
      targetContext.restore();
    }

    return { draw };
  }

  const renderer = createRenderer((cw, ch) => {
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    return canvas;
  });

  function draw(state, settings, w, h) {
    renderer.draw(drawingContext, w, h, layers(state, settings, w, h));
  }

  return { PARAMETERS, RENDER_SCALE, STOPS_PER_RING, MAX_WOBBLE, createSettings, setParameter,
    bindSlider, createState, focusFrom, step, rainbowStops, layers, paint, createRenderer, draw };
})();
