// Scénarios : des préréglages choisis dans un menu déroulant. Un scénario règle d'un coup les
// chasseurs, l'avion, les missiles, les leurres et la vitesse du temps. Chaque scénario part de
// BASE et ne liste que ce qui change, donc passer de l'un à l'autre ne laisse aucun réglage
// résiduel. Les premiers sont des scénarios de jeu ; ceux qui commencent par « Test » ralentissent
// le temps et isolent une action pour la voir en détail. Si l'utilisateur modifie ensuite un
// réglage à la main, le menu passe sur « Personnalisé ». Les contrôles sont réglés par des
// fonctions injectées (setters).
const Scenarios = (() => {
  // réglages d'origine, identiques aux valeurs initiales des contrôles
  const BASE = {
    fighterCount: 3, fighterSpeed: 6.5, afterburner: true, missiles: true, ammo: 4,
    lockRange: 380, lockTime: 0.8,
    planeSpeed: 7, detection: 240, flares: true, flareStock: 6, flareTrigger: 260,
    flareLife: 3.5, flareHeat: 3,
    missileSpeed: 13, missileAgility: 0.9, missileFuel: 5, seekerAngle: 70,
    planeControl: 'auto', timeScale: 1,
  };

  const LIST = [
    { id: 'simple', label: '1. Poursuite simple',
      values: { fighterCount: 1, fighterSpeed: 8, missiles: false, flares: false },
      description: 'Un chasseur poursuit l’avion, qui s’évade dès que le chasseur entre dans son cercle de détection (touche « d »). La post-combustion lui permet de le rattraper : au contact, l’avion est abattu.' },
    { id: 'squadron', label: '2. Escadrille',
      values: { fighterCount: 4, fighterSpeed: 7.5, missiles: false, flares: false },
      description: 'Quatre chasseurs se partagent la poursuite et s’écartent les uns des autres : l’avion ne peut plus fuir dans une seule direction.' },
    { id: 'missiles', label: '3. Missiles sans leurres',
      values: { fighterCount: 3, flares: false },
      description: 'Les chasseurs verrouillent l’avion puis tirent des missiles à tête chercheuse. Sans leurres, l’avion finit abattu : explosion, débris et réapparition.' },
    { id: 'flares', label: '4. Missiles et leurres',
      values: { fighterCount: 3 },
      description: 'Quand un missile approche, l’avion fait un dégagement et largue des leurres plus chauds que lui : les missiles se trompent de cible.' },
    { id: 'saturation', label: '5. Saturation',
      values: { fighterCount: 6, ammo: 8, missileSpeed: 15, missileAgility: 1.4, flareStock: 20, flareLife: 4 },
      description: 'Six chasseurs, des missiles rapides et agiles contre un avion qui a beaucoup de leurres : la course à l’armement.' },
    { id: 'pilot', label: '6. Vous pilotez l’avion',
      values: { fighterCount: 3, planeControl: 'mouse' },
      description: 'L’avion suit votre souris. Cliquez ou appuyez sur espace pour larguer un leurre quand un missile approche.' },
    { id: 'test-afterburner', label: 'Test : post-combustion',
      values: { fighterCount: 2, fighterSpeed: 5, missiles: false, flares: false, planeSpeed: 9, detection: 120, timeScale: 0.6 },
      description: 'Ralenti. Les chasseurs sont plus lents que l’avion : la flamme et la barre bleue montrent la post-combustion qui s’allume de loin et se vide.' },
    { id: 'test-lock', label: 'Test : verrouillage et tir',
      values: { fighterCount: 2, ammo: 2, lockTime: 1.5, flares: false, planeSpeed: 4, missileSpeed: 10, timeScale: 0.5 },
      description: 'Ralenti. Voyez la ligne ambre et le réticule se resserrer pendant le verrouillage, puis « VERROUILLÉ », « FOX 2 » et le missile qui part.' },
    { id: 'test-flares', label: 'Test : leurres',
      values: { fighterCount: 1, ammo: 8, lockTime: 0.4, planeSpeed: 5, flareStock: 20, flareTrigger: 350,
        flareLife: 5, flareHeat: 5, missileSpeed: 11, timeScale: 0.5 },
      description: 'Ralenti. Un chasseur tire sans cesse : l’avion largue des leurres très chauds, et les missiles qui s’en détournent explosent en « MISSILE LEURRÉ » (touche « d » : cône du chercheur).' },
    { id: 'test-explosion', label: 'Test : explosion',
      values: { fighterCount: 1, lockTime: 0.3, flares: false, planeSpeed: 3, missileSpeed: 14, timeScale: 0.4 },
      description: 'Ralenti. Un avion lent et sans leurres : le missile le touche et l’on voit l’éclair, l’onde de choc, les débris, le tremblement d’écran et le texte « ABATTU ! ».' },
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
