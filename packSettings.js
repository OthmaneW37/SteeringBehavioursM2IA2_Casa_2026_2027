// Réglages du niveau 1 (la meute des Creux) et de son entraînement : plages des curseurs, valeurs par
// défaut, validation. Chaque curseur de index.html a les mêmes min / max / step / value que son entrée
// (un test le vérifie). Une valeur hors plage lève une RangeError. Le joueur robot utilise les réglages
// « Esquive du joueur scripté » et « Intervalle d'attaque » de Settings.
const PackSettings = {
    PARAMETERS: {
        packSize: { min: 3, max: 8, step: 1, initial: 5, decimals: 0, label: "Taille de la meute" },
        packPerception: { min: 60, max: 300, step: 10, initial: 160, decimals: 0, label: "Perception des Creux (px)" },
        packPopulation: { min: 10, max: 100, step: 10, initial: 40, decimals: 0, label: "Population de meutes" },
        packFights: { min: 1, max: 4, step: 1, initial: 2, decimals: 0, label: "Combats par meute" },
        packMutation: { min: 0, max: 0.5, step: 0.01, initial: 0.1, decimals: 2, label: "Taux de mutation (meute)" }
    },

    // Combats de la comparaison (meute à la main contre meute apprise)
    COMPARISON_FIGHTS: 40,

    check(name, value) {
        const p = PackSettings.PARAMETERS[name];
        if (!p) throw new RangeError("Réglage inconnu : " + name);
        if (typeof value !== 'number' || !Number.isFinite(value) || value < p.min - 1e-9 || value > p.max + 1e-9) {
            throw new RangeError(p.label + " : " + value + " hors de [" + p.min + ", " + p.max + "]");
        }
        if (p.decimals === 0 && !Number.isInteger(value)) throw new RangeError(p.label + " : un entier est attendu");
        return value;
    },

    defaults() {
        const out = {};
        for (const name in PackSettings.PARAMETERS) out[name] = PackSettings.PARAMETERS[name].initial;
        return out;
    },

    validate(s) {
        const out = {};
        for (const name in PackSettings.PARAMETERS) out[name] = PackSettings.check(name, s[name]);
        return out;
    },

    format(name, value) {
        return Number(value).toFixed(PackSettings.PARAMETERS[name].decimals);
    }
};
