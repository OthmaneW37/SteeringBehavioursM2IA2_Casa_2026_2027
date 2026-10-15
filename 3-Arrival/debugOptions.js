// Options du mode debug : un interrupteur général (touche « d ») et des calques indépendants.
// Un calque n'est dessiné que si le debug est actif ET si le calque est coché (visible()).
// Les cases à cocher sont injectées.
const DebugOptions = (() => {
  const LAYERS = {
    braking: { label: 'Cible et rayon de freinage', initial: true },
    perception: { label: 'Rayon d’attraction (jaune / rouge)', initial: true },
    vectors: { label: 'Vecteurs vitesse', initial: true },
    rings: { label: 'Anneaux et espacement', initial: false },
    labels: { label: 'État de chaque serpent', initial: true },
    wander: { label: 'Cercle de wander (adversaire)', initial: true },
    menu: { label: 'Zones cliquables du menu', initial: false },
  };

  function create() {
    const options = { enabled: false };
    for (const [name, layer] of Object.entries(LAYERS)) options[name] = layer.initial;
    return options;
  }

  const visible = (options, name) => Boolean(options.enabled && options[name]);

  function setLayer(options, name, value) {
    if (!Object.hasOwn(LAYERS, name)) throw new RangeError(`Calque de debug inconnu : ${name}.`);
    options[name] = Boolean(value);
  }

  // master : case générale ; layers : { nom: case } ; onChange appelé après chaque modification
  function bind(options, master, layers, onChange = () => {}) {
    master.checked = options.enabled;
    master.addEventListener('change', () => {
      options.enabled = Boolean(master.checked);
      onChange();
    });
    for (const [name, checkbox] of Object.entries(layers)) {
      checkbox.checked = options[name];
      checkbox.addEventListener('change', () => {
        setLayer(options, name, checkbox.checked);
        onChange();
      });
    }
    return {
      setEnabled(enabled) {
        options.enabled = Boolean(enabled);
        master.checked = options.enabled;
        onChange();
      },
      toggle() {
        this.setEnabled(!options.enabled);
      },
    };
  }

  return { LAYERS, create, visible, setLayer, bind };
})();
