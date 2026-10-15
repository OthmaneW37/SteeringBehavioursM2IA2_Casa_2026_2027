// Sauvegarde complète de l'entraînement : population, génération, courbe, meilleur boss et champion.
//
// - Sauvegarde automatique dans le navigateur (localStorage) : la page la recharge à l'ouverture.
// - Export / import d'un fichier JSON, pour garder une copie ou changer d'ordinateur.
// Chaque accès au stockage est protégé (try/catch) : un navigateur peut le bloquer. Le stockage est injecté.
//
// Format du fichier :
// { format: "gardien-entrainement", version: 1, savedAt, seed, generation, validationFights, settings,
//   population: [cerveau, ...], history: [{ generation, best, mean, winRate, championWinRate }],
//   best: { fitness, generation, brain } | null,
//   champion: { winRate, fitness, generation, brain } | null }
// où « cerveau » vaut { sizes: [8, 16, 3], weights: [...], biases: [...] }.
const TrainingStore = {
    KEY: 'gardienDuBrouillard.training.v1',
    FORMAT: 'gardien-entrainement',
    VERSION: 1,

    snapshot(training, now = new Date()) {
        const brain = b => (b ? JSON.parse(JSON.stringify(b.toJSON())) : null);
        return {
            format: TrainingStore.FORMAT,
            version: TrainingStore.VERSION,
            savedAt: now.toISOString(),
            seed: training.seed,
            generation: training.generation,
            validationFights: Training.VALIDATION_FIGHTS,
            settings: Object.assign({}, training.settings),
            population: training.population.map(brain),
            history: training.history.map(h => Object.assign({}, h)),
            best: training.best.brain ? { fitness: training.best.fitness, generation: training.best.generation, brain: brain(training.best.brain) } : null,
            champion: training.champion ? {
                winRate: training.champion.winRate, fitness: training.champion.fitness,
                generation: training.champion.generation, brain: brain(training.champion.brain),
                // vrai si le champion doit repasser l'examen (réglages changés, examen d'une autre taille)
                stale: training.champion.key !== training.fightKey()
            } : null
        };
    },

    /** Vérifie un cerveau sauvegardé : architecture du boss obligatoire. */
    checkBrain(data) {
        const nn = NeuralNetwork.fromJSON(data);
        if (nn.sizes.join(',') !== BossBrain.SIZES.join(',')) {
            throw new RangeError("Cerveau d'architecture [" + nn.sizes.join(', ') + "] au lieu de [" + BossBrain.SIZES.join(', ') + "].");
        }
        return nn;
    },

    /** Reconstruit un entraînement à partir d'une sauvegarde validée (RangeError / TypeError sinon). */
    restore(data) {
        if (!data || typeof data !== 'object') throw new TypeError("Sauvegarde illisible.");
        if (data.format !== TrainingStore.FORMAT) throw new RangeError("Ce fichier n'est pas une sauvegarde d'entraînement du Gardien.");
        if (data.version !== TrainingStore.VERSION) throw new RangeError("Version de sauvegarde non prise en charge : " + data.version);
        const settings = Settings.validate(data.settings || {});
        if (!Number.isInteger(data.generation) || data.generation < 0) throw new RangeError("Numéro de génération invalide.");
        if (!Number.isInteger(data.seed) || data.seed < 1) throw new RangeError("Graine invalide.");
        if (!Array.isArray(data.population) || data.population.length < 1 || data.population.length > Settings.PARAMETERS.populationSize.max) {
            throw new RangeError("Population invalide.");
        }
        const brains = data.population.map(TrainingStore.checkBrain);
        if (!Array.isArray(data.history)) throw new TypeError("Historique absent.");
        for (const h of data.history) {
            for (const k of ['generation', 'best', 'mean', 'winRate']) {
                if (typeof h[k] !== 'number' || !Number.isFinite(h[k])) throw new RangeError("Historique invalide (" + k + ").");
            }
        }
        const t = new Training(Object.assign({}, settings, { populationSize: brains.length }), { seed: data.seed, initialBrains: brains });
        if (brains.length !== settings.populationSize) t.updateSettings(settings);
        t.generation = data.generation;
        t.rng = seededRandom(data.seed * 7919 + data.generation);
        t.history = data.history.map(h => Object.assign({}, h));
        if (data.best) t.best = { brain: TrainingStore.checkBrain(data.best.brain), fitness: data.best.fitness, generation: data.best.generation };
        if (data.champion) {
            t.champion = {
                brain: TrainingStore.checkBrain(data.champion.brain), winRate: data.champion.winRate,
                fitness: data.champion.fitness, generation: data.champion.generation,
                // Mesuré avec les réglages sauvegardés ; un examen d'une autre taille sera refait
                key: data.validationFights === Training.VALIDATION_FIGHTS && !data.champion.stale ? t.fightKey(settings) : 'à réexaminer'
            };
        }
        return t;
    },

    serialize(training) {
        return JSON.stringify(TrainingStore.snapshot(training));
    },

    parse(text) {
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new RangeError("Fichier JSON illisible : " + e.message);
        }
        return TrainingStore.restore(data);
    },

    save(storage, training) {
        if (!storage) return { ok: false, error: "Stockage local indisponible." };
        try {
            storage.setItem(TrainingStore.KEY, TrainingStore.serialize(training));
            return { ok: true, error: null };
        } catch (e) {
            return { ok: false, error: "Sauvegarde automatique impossible : " + e.message };
        }
    },

    /** → { training | null, error | null } ; jamais d'exception. */
    load(storage) {
        if (!storage) return { training: null, error: null };
        let text;
        try {
            text = storage.getItem(TrainingStore.KEY);
        } catch (e) {
            return { training: null, error: "Lecture du stockage impossible : " + e.message };
        }
        if (!text) return { training: null, error: null };
        try {
            return { training: TrainingStore.parse(text), error: null };
        } catch (e) {
            return { training: null, error: "Sauvegarde d'entraînement ignorée : " + e.message };
        }
    },

    clear(storage) {
        try {
            if (storage) storage.removeItem(TrainingStore.KEY);
            return true;
        } catch (e) {
            return false;
        }
    },

    fileName(training) {
        return 'gardien-entrainement-generation-' + training.generation + '.json';
    }
};
