/**
 * Réglages du laboratoire : plages des curseurs, valeurs par défaut et validation.
 *
 * Chaque curseur de index.html a exactement les attributs min / max / step / value
 * de son entrée dans PARAMETERS (un test le vérifie). Une valeur hors plage lève
 * une RangeError : rien n'est corrigé en silence.
 *
 * Les valeurs par défaut reproduisent le comportement d'origine de l'exemple :
 * réseau [8, 20, 2], 50 voitures, mutation 0,15, Berline, circuit généré,
 * arrêt quand 60 % de la population termine le tour.
 */
const Settings = {
    PARAMETERS: {
        // Simulation et circuit généré (curseurs d'origine)
        speedLimit: { min: 2, max: 20, step: 1, initial: 6, decimals: 0, label: "Vitesse max de référence" },
        trackDifficulty: { min: 1, max: 50, step: 1, initial: 5, decimals: 0, label: "Complexité du circuit généré" },
        trackWidth: { min: 35, max: 150, step: 5, initial: 100, decimals: 0, label: "Largeur du circuit généré" },
        simSpeed: { min: 1, max: 20, step: 1, initial: 5, decimals: 0, label: "Cycles de décision par image" },

        // Architecture du cerveau
        hiddenLayerCount: { min: 1, max: 5, step: 1, initial: 1, decimals: 0, label: "Couches cachées" },
        neurons: { min: 1, max: 64, step: 1, initial: 20, decimals: 0, label: "Neurones par couche" },

        // Algorithme génétique
        populationSize: { min: 10, max: 200, step: 10, initial: 50, decimals: 0, label: "Population" },
        mutationRate: { min: 0, max: 1, step: 0.01, initial: 0.15, decimals: 2, label: "Taux de mutation" },
        lapsPerRun: { min: 1, max: 5, step: 1, initial: 1, decimals: 0, label: "Tours par évaluation" },

        // Fonction de terminaison
        maxGenerations: { min: 1, max: 2000, step: 1, initial: 200, decimals: 0, label: "Générations max" },
        targetLaps: { min: 1, max: 5, step: 1, initial: 1, decimals: 0, label: "Tours sur tous les circuits" },
        stagnation: { min: 1, max: 500, step: 1, initial: 30, decimals: 0, label: "Stagnation (générations)" },
        maxTime: { min: 10, max: 7200, step: 10, initial: 600, decimals: 0, label: "Temps max (s)" },
        successRate: { min: 0.05, max: 1, step: 0.05, initial: 0.6, decimals: 2, label: "Taux de réussite" },

        // Course
        raceLaps: { min: 1, max: 5, step: 1, initial: 2, decimals: 0, label: "Tours par circuit (course)" }
    },

    MAX_HIDDEN_LAYERS: 5,
    INPUTS: 8,          // 5 rayons en éventail + 2 rayons perpendiculaires + la vitesse
    OUTPUTS: 2,         // virage, poussée
    OUTPUTS_BRAKE: 3,   // virage, poussée, frein

    // Conditions de la fonction de terminaison : clé du réglage → paramètre de plage
    TERMINATION_KEYS: ['maxGenerations', 'targetLaps', 'stagnation', 'maxTime', 'successRate'],

    /** Vérifie une valeur de curseur et la retourne ; RangeError si hors plage ou non numérique. */
    check(name, value) {
        const p = Settings.PARAMETERS[name];
        if (!p) throw new RangeError("Réglage inconnu : " + name);
        if (typeof value !== 'number' || !Number.isFinite(value) || value < p.min || value > p.max) {
            throw new RangeError(p.label + " : " + value + " hors de [" + p.min + ", " + p.max + "]");
        }
        if (p.decimals === 0 && !Number.isInteger(value)) {
            throw new RangeError(p.label + " : un entier est attendu (" + value + ")");
        }
        return value;
    },

    /** Réglages complets par défaut (objet neuf à chaque appel). */
    defaults() {
        const P = Settings.PARAMETERS;
        const termination = {};
        for (const key of Settings.TERMINATION_KEYS) {
            // Seul le taux de réussite est actif par défaut : c'est la règle d'origine (60 %).
            termination[key] = { enabled: key === 'successRate', value: P[key].initial };
        }
        return {
            speedLimit: P.speedLimit.initial,
            trackDifficulty: P.trackDifficulty.initial,
            trackWidth: P.trackWidth.initial,
            hiddenLayers: [P.neurons.initial],
            brake: false,
            populationSize: P.populationSize.initial,
            mutationRate: P.mutationRate.initial,
            lapsPerRun: P.lapsPerRun.initial,
            termination: termination,
            circuits: ['genere'],
            carTypes: { mode: 'unique', ids: ['berline'] }
        };
    },

    /** Tailles du réseau [entrées, cachées..., sorties] pour des réglages donnés. */
    networkSizes(settings) {
        const outputs = settings.brake ? Settings.OUTPUTS_BRAKE : Settings.OUTPUTS;
        return [Settings.INPUTS].concat(settings.hiddenLayers, [outputs]);
    },

    /**
     * Valide des réglages complets (par exemple issus d'un fichier importé) et en
     * retourne une copie propre. `knownCircuits` et `knownCarTypes` sont les identifiants
     * acceptés. Lève RangeError / TypeError avec un message lisible.
     */
    validate(s, knownCircuits, knownCarTypes) {
        if (!s || typeof s !== 'object') throw new TypeError("Réglages absents.");
        const out = {};
        for (const key of ['speedLimit', 'trackDifficulty', 'trackWidth', 'populationSize', 'mutationRate', 'lapsPerRun']) {
            out[key] = Settings.check(key, s[key]);
        }
        if (!Array.isArray(s.hiddenLayers)) throw new TypeError("hiddenLayers doit être un tableau.");
        Settings.check('hiddenLayerCount', s.hiddenLayers.length);
        out.hiddenLayers = s.hiddenLayers.map(n => Settings.check('neurons', n));
        if (typeof s.brake !== 'boolean') throw new TypeError("brake doit valoir true ou false.");
        out.brake = s.brake;

        if (!s.termination || typeof s.termination !== 'object') throw new TypeError("termination absent.");
        out.termination = {};
        for (const key of Settings.TERMINATION_KEYS) {
            const c = s.termination[key];
            if (!c || typeof c.enabled !== 'boolean') throw new TypeError("Condition d'arrêt invalide : " + key);
            out.termination[key] = { enabled: c.enabled, value: Settings.check(key, c.value) };
        }
        if (out.termination.targetLaps.enabled && out.termination.targetLaps.value > out.lapsPerRun) {
            throw new RangeError("Objectif de " + out.termination.targetLaps.value +
                " tours inatteignable avec " + out.lapsPerRun + " tour(s) par évaluation.");
        }

        if (!Array.isArray(s.circuits) || s.circuits.length === 0) throw new RangeError("Au moins un circuit est requis.");
        for (const id of s.circuits) {
            if (knownCircuits && !knownCircuits.includes(id)) throw new RangeError("Circuit inconnu : " + id);
        }
        out.circuits = s.circuits.slice();

        const ct = s.carTypes;
        if (!ct || (ct.mode !== 'unique' && ct.mode !== 'melange') || !Array.isArray(ct.ids) || ct.ids.length === 0) {
            throw new RangeError("Types de voitures invalides.");
        }
        if (ct.mode === 'unique' && ct.ids.length !== 1) throw new RangeError("Le mode « unique » attend un seul type.");
        for (const id of ct.ids) {
            if (knownCarTypes && !knownCarTypes.includes(id)) throw new RangeError("Type de voiture inconnu : " + id);
        }
        out.carTypes = { mode: ct.mode, ids: ct.ids.slice() };
        return out;
    }
};
