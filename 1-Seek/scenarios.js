// Scénarios : des préréglages choisis dans un menu déroulant. Un scénario règle d'un coup
// le comportement des vaisseaux (fuite ou poursuite), le type de cible (normale ou fuyante),
// son mouvement, son diamètre, sa vitesse, son agilité, sa détection, son endurance, sa
// reproduction, ainsi que le rayon de fuite, la vitesse et la force des vaisseaux. Chaque
// scénario part de BASE et ne liste que ce qui change, donc passer de l'un à l'autre ne laisse
// aucun réglage résiduel. Si l'utilisateur modifie ensuite un réglage à la main, le menu passe
// sur « Personnalisé ». Les contrôles sont réglés par des fonctions injectées (setters).
const Scenarios = (() => {
  // réglages d'origine, identiques aux valeurs initiales des contrôles
  const BASE = {
    fleeing: false,          // true : les vaisseaux fuient la cible
    targetKind: 'target',    // 'target' : PointTarget ; 'fleeing' : TargetFuyante
    targetMotion: 'wander',  // 'wander' : se déplace seule ; 'cursor' : suit le curseur
    randomSize: true,        // true : le rayon de la cible change au hasard
    diameter: 100,           // diamètre de la cible (si randomSize est faux)
    targetSpeed: 4,
    targetForce: 0.3,
    detection: 200,          // cible fuyante : cercle de détection
    endurance: 2.5,          // cible fuyante : durée de fuite maximale (s)
    reproduction: false,     // cible fuyante : se divise après avoir fui
    splitAfter: 3,           // cible fuyante : secondes de fuite avant division
    fleeRadius: 300,         // vaisseaux en fuite : distance de fuite
    maxSpeed: 4,             // vaisseaux
    maxForce: 0.1,
  };

  const LIST = [
    { id: 'chase', label: '1. Poursuite classique', values: {},
      description: 'Les vaisseaux suivent la cible et réapparaissent au hasard quand ils la touchent.' },
    { id: 'target-flees', label: '2. La cible fuit le vaisseau le plus proche',
      values: { targetKind: 'fleeing', randomSize: false, diameter: 60, maxSpeed: 5, maxForce: 0.2 },
      description: 'Quand un vaisseau entre dans son cercle de détection, la cible fuit en accélérant jusqu’à 300 px, tant que son endurance le permet (touche « d » : cercle de détection).' },
    { id: 'reproduction', label: '3. Reproduction : la cible se divise',
      values: { targetKind: 'fleeing', reproduction: true, randomSize: false, diameter: 50,
        maxSpeed: 5, maxForce: 0.2 },
      description: 'Après plusieurs secondes de fuite, la cible se divise en deux cibles qui fuient à leur tour ; une cible capturée disparaît.' },
    { id: 'flee', label: 'Les vaisseaux fuient la cible', values: { fleeing: true },
      description: 'Chaque vaisseau s’écarte de la cible dès qu’il entre dans le cercle pointillé, puis freine.' },
    { id: 'race', label: 'Course-poursuite',
      values: { targetKind: 'fleeing', randomSize: false, diameter: 30, targetSpeed: 5, targetForce: 1,
        detection: 300, endurance: 5, maxSpeed: 9, maxForce: 1 },
      description: 'Une cible petite, endurante et agile contre une meute rapide : le canvas est un tore, la chasse ne s’arrête jamais.' },
    { id: 'mutual', label: 'Fuite mutuelle',
      values: { fleeing: true, targetKind: 'fleeing', randomSize: false, diameter: 80, detection: 250,
        endurance: 4, fleeRadius: 250, maxSpeed: 5, maxForce: 0.3 },
      description: 'Tout le monde fuit tout le monde : la cible s’écarte des vaisseaux qui s’écartent d’elle.' },
    { id: 'cursor', label: 'La cible suit le curseur',
      values: { targetMotion: 'cursor', randomSize: false, diameter: 50 },
      description: 'Guidez la cible à la souris, les vaisseaux la suivent.' },
    { id: 'scarecrow', label: 'Le curseur épouvantail',
      values: { fleeing: true, targetMotion: 'cursor', randomSize: false, diameter: 40, fleeRadius: 350,
        maxSpeed: 8, maxForce: 0.5 },
      description: 'Le curseur est un épouvantail : les vaisseaux se dispersent dès que vous approchez.' },
    { id: 'giant', label: 'Appât géant',
      values: { randomSize: false, diameter: 200, maxSpeed: 5 },
      description: 'Une cible énorme : les vaisseaux l’atteignent vite et les captures s’enchaînent.' },
    { id: 'tiny', label: 'Appât minuscule',
      values: { randomSize: false, diameter: 20, maxSpeed: 6, maxForce: 0.4 },
      description: 'Une cible minuscule : il faut la viser pile pour la capturer.' },
  ];

  const CUSTOM = {
    id: 'custom',
    label: 'Personnalisé',
    description: 'Réglages personnalisés : choisissez un scénario pour revenir à un préréglage.',
  };

  const find = id => LIST.find(scenario => scenario.id === id);

  // tous les réglages d'un scénario : BASE complétée par ses valeurs propres
  function valuesFor(id) {
    const scenario = find(id);
    if (!scenario) throw new RangeError(`Scénario inconnu : ${id}.`);
    return { ...BASE, ...scenario.values };
  }

  // Règle chaque contrôle avec la valeur du scénario. setters : { clé: valeur => ... }.
  function apply(id, setters) {
    const values = valuesFor(id);
    for (const [key, value] of Object.entries(values)) {
      if (typeof setters[key] !== 'function') throw new Error(`Aucun réglage pour : ${key}.`);
      setters[key](value);
    }
  }

  // Remplit le menu déroulant, applique le premier scénario et suit les modifications manuelles.
  // controls : éléments du menu qui font partie des réglages (leur modification passe le menu
  // sur « Personnalisé »). makeOption est injectable ; par défaut un vrai <option>.
  function bindSelect({ select, description, controls = [], setters, onApply = () => {},
    makeOption = (value, label) => new Option(label, value) }) {
    const show = id => {
      description.textContent = id === CUSTOM.id ? CUSTOM.description : find(id).description;
    };
    // Les réglages déclenchent les événements des contrôles, ce qui passe le menu sur
    // « Personnalisé » pendant l'application : on rétablit ensuite le scénario choisi.
    const applyScenario = id => {
      apply(id, setters);
      select.value = id;
      show(id);
      onApply(id);
    };
    const markCustom = () => {
      if (select.value === CUSTOM.id) return;
      select.value = CUSTOM.id;
      show(CUSTOM.id);
    };

    select.appendChild(makeOption(CUSTOM.id, CUSTOM.label));
    for (const scenario of LIST) select.appendChild(makeOption(scenario.id, scenario.label));
    select.addEventListener('change', () => {
      if (select.value === CUSTOM.id) show(CUSTOM.id);
      else applyScenario(select.value);
    });
    for (const control of controls) {
      control.addEventListener('input', markCustom);
      control.addEventListener('change', markCustom);
    }
    applyScenario(LIST[0].id);
    return { apply: applyScenario, isCustom: () => select.value === CUSTOM.id };
  }

  return { BASE, LIST, CUSTOM, valuesFor, apply, bindSelect };
})();
