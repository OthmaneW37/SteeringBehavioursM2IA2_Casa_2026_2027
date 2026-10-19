/**
 * Lien entre les contrôles HTML et les réglages (document injecté : testable sous Node).
 *
 * readSettings(doc) lit tous les contrôles et retourne des réglages validés
 * (RangeError si une valeur est hors plage). applySettings(doc, settings) règle les
 * contrôles comme le ferait l'utilisateur (chargement d'une configuration).
 */
const Controls = {
    // Curseur → réglage de Settings.PARAMETERS et affichage de sa valeur
    SLIDERS: {
        speedSlider: { param: 'speedLimit', display: 'speedVal' },
        simSpeed: { param: 'simSpeed', display: 'simSpeedVal' },
        diffSlider: { param: 'trackDifficulty', display: 'diffVal' },
        widthSlider: { param: 'trackWidth', display: 'widthVal' },
        hiddenLayerCount: { param: 'hiddenLayerCount', display: 'hiddenLayerCountVal' },
        neurons1: { param: 'neurons', display: 'neurons1Val' },
        neurons2: { param: 'neurons', display: 'neurons2Val' },
        neurons3: { param: 'neurons', display: 'neurons3Val' },
        neurons4: { param: 'neurons', display: 'neurons4Val' },
        neurons5: { param: 'neurons', display: 'neurons5Val' },
        populationSize: { param: 'populationSize', display: 'populationSizeVal' },
        mutationRate: { param: 'mutationRate', display: 'mutationRateVal' },
        lapsPerRun: { param: 'lapsPerRun', display: 'lapsPerRunVal' },
        termMaxGenerations: { param: 'maxGenerations', display: 'termMaxGenerationsVal' },
        termTargetLaps: { param: 'targetLaps', display: 'termTargetLapsVal' },
        termStagnation: { param: 'stagnation', display: 'termStagnationVal' },
        termMaxTime: { param: 'maxTime', display: 'termMaxTimeVal' },
        termSuccessRate: { param: 'successRate', display: 'termSuccessRateVal' },
        raceLaps: { param: 'raceLaps', display: 'raceLapsVal' }
    },

    // Identifiant du curseur et de la case de chaque condition d'arrêt
    termId(key) {
        return 'term' + key.charAt(0).toUpperCase() + key.slice(1);
    },

    // Tous les autres identifiants utilisés par le JavaScript (vérifiés par un test)
    OTHER_IDS: ['ui', 'canvas-container', 'panelToggle', 'modeSelect', 'pauseBtn', 'restartBtn', 'statusMsg',
        'showNetwork', 'circuitSet', 'circuitList', 'circuitInfo', 'brakeOutput', 'archInfo', 'applyArchBtn',
        'carTypeMode', 'carTypeUnique', 'carTypeMix', 'carTypeUniqueGroup', 'carTypeMixGroup', 'carTypeInfo',
        'saveBestBtn', 'configName', 'includeBrain', 'saveConfigBtn', 'configList', 'loadConfigBtn',
        'renameConfigBtn', 'deleteConfigBtn', 'exportConfigBtn', 'importConfigInput', 'configMsg',
        'raceSection', 'raceBrainSelect', 'raceTypeSelect', 'addEntrantBtn', 'addAllTypesBtn', 'clearEntrantsBtn',
        'entrantList', 'raceCircuitSet', 'raceCircuitList', 'startRaceBtn', 'raceResults'],

    allIds() {
        const ids = [];
        for (const id in Controls.SLIDERS) ids.push(id, Controls.SLIDERS[id].display);
        for (const key of Settings.TERMINATION_KEYS) ids.push(Controls.termId(key) + 'On');
        return ids.concat(Controls.OTHER_IDS);
    },

    el(doc, id) {
        const e = doc.getElementById(id);
        if (!e) throw new Error("Contrôle introuvable dans index.html : #" + id);
        return e;
    },

    format(param, value) {
        return Number(value).toFixed(Settings.PARAMETERS[param].decimals);
    },

    /** Met à jour le texte affiché à côté d'un curseur. */
    showValue(doc, sliderId) {
        const s = Controls.SLIDERS[sliderId];
        Controls.el(doc, s.display).textContent = Controls.format(s.param, Controls.el(doc, sliderId).value);
    },

    /** Valeur validée d'un curseur (RangeError si hors plage). */
    sliderValue(doc, sliderId) {
        return Settings.check(Controls.SLIDERS[sliderId].param, Number(Controls.el(doc, sliderId).value));
    },

    setSlider(doc, sliderId, value) {
        Settings.check(Controls.SLIDERS[sliderId].param, value);
        Controls.el(doc, sliderId).value = String(value);
        Controls.showValue(doc, sliderId);
    },

    // --- Listes déroulantes ---
    fillSelect(doc, id, options) {
        const select = Controls.el(doc, id);
        select.innerHTML = '';
        for (const o of options) {
            const opt = doc.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            if (o.title) opt.title = o.title;
            select.appendChild(opt);
        }
        return select;
    },

    selectedValues(select) {
        return Array.from(select.options).filter(o => o.selected).map(o => o.value);
    },

    setSelected(select, values) {
        for (const o of Array.from(select.options)) o.selected = values.includes(o.value);
    },

    /** Remplit les listes de circuits et de types à partir des données. */
    init(doc) {
        const circuitOptions = Circuits.LIST.map(c => ({
            value: c.id, label: (c.kind === 'tueur' ? '☠ ' : '') + c.name, title: c.description
        }));
        const setOptions = Object.keys(Circuits.SETS).map(k => ({ value: k, label: Circuits.SETS[k].label }))
            .concat([{ value: 'personnalise', label: "Personnalisé" }]);
        for (const [setId, listId] of [['circuitSet', 'circuitList'], ['raceCircuitSet', 'raceCircuitList']]) {
            Controls.fillSelect(doc, setId, setOptions);
            Controls.fillSelect(doc, listId, circuitOptions);
        }
        const typeOptions = CarTypes.LIST.map(t => ({ value: t.id, label: t.label, title: t.description }));
        for (const id of ['carTypeUnique', 'carTypeMix', 'raceTypeSelect']) Controls.fillSelect(doc, id, typeOptions);
        Controls.setCircuits(doc, 'circuitSet', 'circuitList', ['genere']);
        Controls.setCircuits(doc, 'raceCircuitSet', 'raceCircuitList', Circuits.SETS.standards.ids);
        for (const id in Controls.SLIDERS) Controls.showValue(doc, id);
    },

    /** Liste de circuits d'une paire (préréglage, liste) : ordre du préréglage, sinon ordre du catalogue. */
    readCircuits(doc, setId, listId) {
        const set = Controls.el(doc, setId).value;
        if (Circuits.SETS[set]) return Circuits.SETS[set].ids.slice();
        return Controls.selectedValues(Controls.el(doc, listId));
    },

    setCircuits(doc, setId, listId, ids) {
        Controls.el(doc, setId).value = Circuits.setFor(ids);
        Controls.setSelected(Controls.el(doc, listId), ids);
    },

    /** Choix d'un préréglage : sélectionne ses circuits. */
    applyCircuitSet(doc, setId, listId) {
        const set = Controls.el(doc, setId).value;
        if (Circuits.SETS[set]) Controls.setSelected(Controls.el(doc, listId), Circuits.SETS[set].ids);
    },

    /** Modification manuelle de la liste : le préréglage passe sur « Personnalisé » si besoin. */
    onCircuitListChanged(doc, setId, listId) {
        Controls.el(doc, setId).value = Circuits.setFor(Controls.selectedValues(Controls.el(doc, listId)));
    },

    /** Affiche seulement les curseurs des couches cachées utilisées. */
    showLayers(doc) {
        const count = Number(Controls.el(doc, 'hiddenLayerCount').value);
        for (let i = 1; i <= Settings.MAX_HIDDEN_LAYERS; i++) {
            const group = Controls.el(doc, 'neurons' + i).parentElement;
            if (group && group.classList) group.classList.toggle('inactive', i > count);
        }
    },

    showCarTypeMode(doc) {
        const mix = Controls.el(doc, 'carTypeMode').value === 'melange';
        Controls.el(doc, 'carTypeUniqueGroup').style.display = mix ? 'none' : '';
        Controls.el(doc, 'carTypeMixGroup').style.display = mix ? '' : 'none';
    },

    /** Lit tous les réglages de l'entraînement ; RangeError si une valeur est invalide. */
    readSettings(doc) {
        const v = id => Number(Controls.el(doc, id).value);
        const count = v('hiddenLayerCount');
        const hidden = [];
        for (let i = 1; i <= count; i++) hidden.push(v('neurons' + i));
        const termination = {};
        for (const key of Settings.TERMINATION_KEYS) {
            const id = Controls.termId(key);
            termination[key] = { enabled: Controls.el(doc, id + 'On').checked === true, value: v(id) };
        }
        const mode = Controls.el(doc, 'carTypeMode').value;
        const ids = mode === 'melange'
            ? Controls.selectedValues(Controls.el(doc, 'carTypeMix'))
            : [Controls.el(doc, 'carTypeUnique').value];
        return Settings.validate({
            speedLimit: v('speedSlider'),
            trackDifficulty: v('diffSlider'),
            trackWidth: v('widthSlider'),
            hiddenLayers: hidden,
            brake: Controls.el(doc, 'brakeOutput').checked === true,
            populationSize: v('populationSize'),
            mutationRate: v('mutationRate'),
            lapsPerRun: v('lapsPerRun'),
            termination: termination,
            circuits: Controls.readCircuits(doc, 'circuitSet', 'circuitList'),
            carTypes: { mode: mode, ids: ids }
        }, Circuits.ids(), CarTypes.ids());
    },

    /** Règle les contrôles à partir de réglages validés. */
    applySettings(doc, s) {
        Controls.setSlider(doc, 'speedSlider', s.speedLimit);
        Controls.setSlider(doc, 'diffSlider', s.trackDifficulty);
        Controls.setSlider(doc, 'widthSlider', s.trackWidth);
        Controls.setSlider(doc, 'hiddenLayerCount', s.hiddenLayers.length);
        for (let i = 1; i <= Settings.MAX_HIDDEN_LAYERS; i++) {
            Controls.setSlider(doc, 'neurons' + i, s.hiddenLayers[i - 1] || Settings.PARAMETERS.neurons.initial);
        }
        Controls.el(doc, 'brakeOutput').checked = s.brake;
        Controls.setSlider(doc, 'populationSize', s.populationSize);
        Controls.setSlider(doc, 'mutationRate', s.mutationRate);
        Controls.setSlider(doc, 'lapsPerRun', s.lapsPerRun);
        for (const key of Settings.TERMINATION_KEYS) {
            const id = Controls.termId(key);
            Controls.el(doc, id + 'On').checked = s.termination[key].enabled;
            Controls.setSlider(doc, id, s.termination[key].value);
        }
        Controls.setCircuits(doc, 'circuitSet', 'circuitList', s.circuits);
        Controls.el(doc, 'carTypeMode').value = s.carTypes.mode;
        if (s.carTypes.mode === 'melange') {
            Controls.setSelected(Controls.el(doc, 'carTypeMix'), s.carTypes.ids);
        } else {
            Controls.el(doc, 'carTypeUnique').value = s.carTypes.ids[0];
        }
        Controls.showLayers(doc);
        Controls.showCarTypeMode(doc);
    }
};
