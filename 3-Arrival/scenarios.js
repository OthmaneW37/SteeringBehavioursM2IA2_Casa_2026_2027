// Scénarios : des préréglages choisis dans un menu déroulant. Chaque scénario part de BASE et ne
// liste que ce qui change, donc passer de l'un à l'autre ne laisse aucun réglage résiduel. Le
// scénario 1 est la référence : un serpent qui suit la souris. Ceux qui commencent par « Test »
// isolent une règle pour la voir en détail (avec le debug, touche « d »). Si l'utilisateur
// modifie ensuite un réglage à la main, le menu passe sur « Personnalisé ». Les contrôles sont
// réglés par des fonctions injectées (setters).
const Scenarios = (() => {
  // réglages d'origine, identiques aux valeurs initiales des contrôles
  const BASE = {
    snakeCount: 1, length: 18, size: 14,
    speed: 6, force: 0.35, braking: 120, spacing: 14,
    foodMax: 8, foodRate: 0.8, attraction: 120, foodAuto: true,
    rivals: 0, rivalSpeed: 4, rivalHealth: 4, wanderRadius: 50, wanderDistance: 150, wanderJitter: 0.3,
    formation: 'carrousel', skin: 'jade', clickFood: 'hasard',
  };

  const LIST = [
    { id: 'reference', label: '1. Le serpent suit la souris', values: {},
      description: 'La tête est un véhicule qui arrive sur la souris ; chaque anneau arrive sur le précédent en gardant son espacement. Approchez la bouche d’un fruit : il est aspiré.' },
    { id: 'carrousel', label: '2. Carrousel de serpents',
      values: { snakeCount: 5, length: 14, size: 12, skin: 'neon' },
      description: 'Cinq serpents aux designs différents : chaque tête vise sa place sur un cercle qui tourne autour de la souris, et s’écarte des autres têtes.' },
    { id: 'conga', label: '3. À la queue leu leu',
      values: { snakeCount: 6, formation: 'conga', length: 10, size: 11, speed: 7, skin: 'corail' },
      description: 'Le premier serpent suit la souris ; chaque autre tête arrive sur la queue du serpent qui la précède : une farandole.' },
    { id: 'festin', label: '4. Festin',
      values: { snakeCount: 4, formation: 'chasse', foodMax: 24, foodRate: 3, attraction: 150, skin: 'braise' },
      description: 'La nourriture tombe en abondance. Vous guidez le premier serpent ; les autres chassent le fruit le plus proche de leur bouche, ou errent s’il n’y en a plus.' },
    { id: 'geant', label: '5. Serpent géant',
      values: { length: 60, size: 24, spacing: 22, speed: 4, force: 0.2, braking: 200, skin: 'galaxie' },
      description: 'Un très long serpent, lent et lourd : faible force maximale et grand rayon de freinage, il prend ses virages au large.' },
    { id: 'adversaire', label: '6. Serpent adverse (wander)',
      values: { rivals: 1, foodMax: 14, foodRate: 1.5 },
      description: 'Partie : une vipère erre avec wander (point qui glisse sur un cercle devant elle). Mordez son corps 4 fois pour gagner ; si sa tête mord votre corps, vous perdez 2 anneaux. Plus d’anneaux : game over.' },
    { id: 'arene', label: '7. Arène',
      values: { rivals: 3, rivalSpeed: 5, rivalHealth: 3, foodMax: 20, foodRate: 2.5, skin: 'neon' },
      description: 'Partie : trois vipères se disputent la nourriture avec vous. Battez-les toutes (3 morsures chacune) avant qu’elles ne vous dévorent.' },
    { id: 'test-arrive', label: 'Test : freinage (arrive)',
      values: { length: 8, braking: 300, speed: 8, foodAuto: false, foodMax: 0 },
      description: 'Activez le debug (« d ») : le cercle pointillé est le rayon de freinage. Hors du cercle la tête va à pleine vitesse, dedans sa vitesse désirée diminue jusqu’à zéro sur la cible.' },
    { id: 'test-aspiration', label: 'Test : aspiration de la nourriture',
      values: { speed: 2.5, attraction: 250, foodMax: 30, foodRate: 5, clickFood: 'pomme', skin: 'bonbon' },
      description: 'Un serpent lent et un grand rayon d’attraction : le cercle jaune devient rouge quand un fruit y entre, et le fruit accélère vers la bouche (seek de plus en plus fort).' },
    { id: 'test-wander', label: 'Test : wander',
      values: { rivals: 1, rivalSpeed: 2.5, wanderRadius: 80, wanderDistance: 200, wanderJitter: 0.15, foodAuto: false, foodMax: 0 },
      description: 'Activez le debug (« d ») : cercle blanc devant la vipère, point rouge au centre, point vert sur le cercle. La force va vers le point vert, qui ne bouge que d’un petit angle à chaque image (« Variation »).' },
    { id: 'test-anneaux', label: 'Test : espacement des anneaux',
      values: { length: 30, spacing: 30, size: 10, speed: 12, force: 1.2 },
      description: 'Anneaux très espacés et tête rapide : chaque anneau freine à « espacement » pixels du précédent, et recule s’il en est plus près (vitesse désirée négative).' },
  ];

  const CUSTOM = {
    id: 'custom',
    label: 'Personnalisé',
    description: 'Réglages personnalisés : choisissez un scénario pour revenir à un préréglage.',
  };

  const find = id => LIST.find(scenario => scenario.id === id);

  function valuesFor(id) {
    const scenario = find(id);
    if (!scenario) throw new RangeError(`Scénario inconnu : ${id}.`);
    return { ...BASE, ...scenario.values };
  }

  // identifiant du scénario qui suit id (le dernier revient au premier ; Personnalisé → premier)
  function next(id) {
    const index = LIST.findIndex(scenario => scenario.id === id);
    return LIST[(index + 1) % LIST.length].id;
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
  function bindSelect({ select, description, controls = [], setters, onApply = () => {},
    makeOption = (value, label) => new Option(label, value) }) {
    const show = id => {
      description.textContent = id === CUSTOM.id ? CUSTOM.description : find(id).description;
    };
    // les setters déclenchent les événements des contrôles, ce qui passe le menu sur
    // « Personnalisé » pendant l'application : on rétablit ensuite le scénario choisi
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
    return {
      apply: applyScenario,
      next: () => applyScenario(next(select.value)),
      current: () => select.value,
      isCustom: () => select.value === CUSTOM.id,
    };
  }

  return { BASE, LIST, CUSTOM, valuesFor, next, apply, bindSelect };
})();
