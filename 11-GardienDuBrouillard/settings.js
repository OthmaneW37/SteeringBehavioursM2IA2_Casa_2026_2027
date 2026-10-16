// Réglages du jeu et de l'entraînement : plages des curseurs, valeurs par défaut, validation.
// Chaque curseur de index.html a les mêmes min / max / step / value que son entrée (un test le vérifie).
// Une valeur hors plage lève une RangeError.
const Settings = {
    PARAMETERS: {
        populationSize: { min: 10, max: 200, step: 10, initial: 50, decimals: 0, label: "Population de boss" },
        mutationRate: { min: 0, max: 0.5, step: 0.01, initial: 0.1, decimals: 2, label: "Taux de mutation" },
        fightsPerBoss: { min: 1, max: 4, step: 1, initial: 2, decimals: 0, label: "Combats par boss" },
        elites: { min: 0, max: 5, step: 1, initial: 1, decimals: 0, label: "Élites conservées" },
        dodgeProbability: { min: 0, max: 1, step: 0.05, initial: 0.4, decimals: 2, label: "Esquive du joueur scripté" },
        attackInterval: { min: 0.4, max: 2, step: 0.1, initial: 0.9, decimals: 1, label: "Intervalle d'attaque du scripté (s)" },
        detectRadius: { min: 150, max: 600, step: 10, initial: 350, decimals: 0, label: "Rayon de détection du boss" },
        estusCharges: { min: 0, max: 5, step: 1, initial: 2, decimals: 0, label: "Fioles d'Estus du chevalier" },
        pillarCount: { min: 0, max: 6, step: 1, initial: 4, decimals: 0, label: "Piliers dans l'arène" },
        maxFightTime: { min: 20, max: 120, step: 5, initial: 90, decimals: 0, label: "Durée max d'un combat (s)" },
        trainingBudget: { min: 500, max: 30000, step: 500, initial: 6000, decimals: 0, label: "Pas de simulation par image" }
    },

    // Nombre de combats de la comparaison (boss à états contre boss appris)
    COMPARISON_FIGHTS: 50,

    check(name, value) {
        const p = Settings.PARAMETERS[name];
        if (!p) throw new RangeError("Réglage inconnu : " + name);
        if (typeof value !== 'number' || !Number.isFinite(value) || value < p.min - 1e-9 || value > p.max + 1e-9) {
            throw new RangeError(p.label + " : " + value + " hors de [" + p.min + ", " + p.max + "]");
        }
        if (p.decimals === 0 && !Number.isInteger(value)) throw new RangeError(p.label + " : un entier est attendu");
        return value;
    },

    defaults() {
        const out = {};
        for (const name in Settings.PARAMETERS) out[name] = Settings.PARAMETERS[name].initial;
        return out;
    },

    validate(s) {
        const out = {};
        for (const name in Settings.PARAMETERS) out[name] = Settings.check(name, s[name]);
        return out;
    },

    format(name, value) {
        return Number(value).toFixed(Settings.PARAMETERS[name].decimals);
    }
};
