// Le Panthéon : la collection des boss entraînés, chacun avec sa recette d'entraînement.
//   - Boss fournis : le Gardien (pretrainedBoss.js) et un boss par autre recette (pretrainedPantheon.js).
//     Ils ne peuvent pas être retirés.
//   - Boss ajoutés : le champion de votre entraînement, avec sa recette, sa génération et son examen.
//     Gardés dans le navigateur (localStorage), au plus MAX_SAVED : le plus ancien laisse sa place.
// Chaque boss du Panthéon peut être combattu, opposé à un autre en duel, ou mesuré dans le tournoi.
//
// Une entrée : { id, name, doctrine, trial (épreuve de son entraînement, ou null), generation,
//               winRate (examen), builtin, brain (NeuralNetwork) }
const Pantheon = {
    KEY: 'gardienDuBrouillard.pantheon.v1',   // les cerveaux 12-16-5 d'avant les piliers sont convertis
    MAX_SAVED: 6,
    MAX_NAME: 40,

    /** Boss fournis avec le jeu ; une donnée d'une autre architecture est ignorée. */
    builtins(gardien = PRETRAINED_BOSS, others = (typeof PRETRAINED_PANTHEON !== 'undefined' ? PRETRAINED_PANTHEON : { bosses: [] })) {
        const out = [];
        const add = (doctrine, data, winRate) => {
            let brain;
            try {
                brain = TrainingStore.checkBrain(data.brain, true);
            } catch (e) {
                return;
            }
            const d = Doctrines.get(doctrine);
            out.push({ id: 'fourni-' + doctrine, name: d.name, doctrine: doctrine, trial: d.trial, generation: data.generations,
                winRate: winRate, builtin: true, brain: brain });
        };
        if (gardien) add('gardien', gardien, gardien.validationWinRate);
        for (const b of others.bosses || []) if (b.doctrine !== 'gardien') add(b.doctrine, b, b.validationWinRate);
        return out;
    },

    /** Entrée pour le champion d'un entraînement (le meilleur boss s'il n'y a pas encore de champion). */
    fromTraining(training, now = Date.now()) {
        const c = training.champion;
        const brain = training.bestBrain();
        if (!brain) throw new RangeError("Pas encore de boss entraîné : lancez au moins une génération.");
        const d = Doctrines.get(training.doctrine);
        const generation = c ? c.generation : training.best.generation;
        return {
            id: 'ajout-' + now, name: d.name + " (gén. " + generation + ")", doctrine: d.id,
            trial: Trials.matching(training.settings), generation: generation,
            winRate: c ? c.winRate : null, builtin: false, brain: brain.copy()
        };
    },

    /** Ajoute une entrée ; au-delà de MAX_SAVED boss ajoutés, le plus ancien est retiré. → { list, removed } */
    add(list, entry) {
        const out = list.concat([entry]);
        let removed = null;
        const saved = out.filter(e => !e.builtin);
        if (saved.length > Pantheon.MAX_SAVED) {
            removed = saved[0];
            out.splice(out.indexOf(removed), 1);
        }
        return { list: out, removed: removed };
    },

    /** Retire un boss ajouté (les boss fournis restent). */
    remove(list, id) {
        return list.filter(e => e.builtin || e.id !== id);
    },

    find(list, id) {
        return list.find(e => e.id === id) || null;
    },

    toData(entry) {
        return { id: entry.id, name: entry.name, doctrine: entry.doctrine, trial: entry.trial, generation: entry.generation,
            winRate: entry.winRate, brain: JSON.parse(JSON.stringify(entry.brain.toJSON())) };
    },

    /** Vérifie une entrée sauvegardée (RangeError / TypeError sinon). */
    fromData(data) {
        if (!data || typeof data !== 'object') throw new TypeError("Entrée illisible.");
        if (typeof data.id !== 'string' || !data.id.startsWith('ajout-')) throw new RangeError("Identifiant invalide.");
        if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > Pantheon.MAX_NAME) throw new RangeError("Nom invalide.");
        Doctrines.get(data.doctrine);
        if (data.trial !== null) Trials.get(data.trial);
        if (!Number.isInteger(data.generation) || data.generation < 0) throw new RangeError("Génération invalide.");
        if (data.winRate !== null && !(typeof data.winRate === 'number' && data.winRate >= 0 && data.winRate <= 1)) throw new RangeError("Examen invalide.");
        return { id: data.id, name: data.name, doctrine: data.doctrine, trial: data.trial, generation: data.generation,
            winRate: data.winRate, builtin: false, brain: TrainingStore.checkBrain(data.brain, true) };
    },

    save(storage, list) {
        if (!storage) return { ok: false, error: "Stockage local indisponible : le boss ne sera gardé que jusqu'à la fermeture de la page." };
        try {
            storage.setItem(Pantheon.KEY, JSON.stringify(list.filter(e => !e.builtin).map(Pantheon.toData)));
            return { ok: true, error: null };
        } catch (e) {
            return { ok: false, error: "Panthéon non sauvegardé : " + e.message };
        }
    },

    /** Boss fournis + boss ajoutés lus dans le stockage. → { list, error } ; jamais d'exception. */
    load(storage, builtins = Pantheon.builtins()) {
        const list = builtins.slice();
        if (!storage) return { list, error: null };
        let text;
        try {
            text = storage.getItem(Pantheon.KEY);
        } catch (e) {
            return { list, error: "Lecture du Panthéon impossible : " + e.message };
        }
        if (!text) return { list, error: null };
        let data;
        try {
            data = JSON.parse(text);
            if (!Array.isArray(data)) throw new TypeError("liste attendue");
        } catch (e) {
            return { list, error: "Panthéon sauvegardé illisible : il est ignoré." };
        }
        let skipped = 0;
        for (const d of data.slice(-Pantheon.MAX_SAVED)) {
            try {
                list.push(Pantheon.fromData(d));
            } catch (e) {
                skipped++;
            }
        }
        return { list, error: skipped ? skipped + " boss du Panthéon ignoré(s) (données invalides)." : null };
    },

    /** Texte court qui décrit un boss du Panthéon. */
    describe(entry) {
        // Le nom porte déjà la recette (« Le Bourreau », « Le Bourreau (gén. 12) »)
        const trial = entry.trial ? "le joueur " + Trials.get(entry.trial).label.toLowerCase() : "un joueur robot personnalisé";
        return entry.name + " — entraîné contre " + trial + ", " + entry.generation + " générations" +
            (entry.winRate !== null && entry.winRate !== undefined ? ", examen " + Math.round(entry.winRate * 100) + " %" : "") +
            (entry.builtin ? " (fourni)." : " (ajouté par vous).");
    }
};
