// Épreuves : différentes façons de jouer du joueur robot (préréglages, comme les scénarios).
// Elles servent à deux choses :
//   - une recette d'entraînement (Doctrines) dit contre quelle épreuve le boss s'entraîne ;
//   - le tournoi du Panthéon fait affronter chaque épreuve à chaque boss, pour voir qui s'adapte.
// Une épreuve part des réglages donnés et ne change que le comportement du joueur robot.
const Trials = {
    LIST: [
        {
            id: 'debutant', label: "Débutant",
            description: "réagit bien à 35 % des techniques, frappe toutes les 1,5 s",
            changes: { dodgeProbability: 0.35, attackInterval: 1.5 }
        },
        {
            id: 'reference', label: "Référence",
            description: "le joueur robot d'origine : 40 % de bonnes réactions, 2 fioles",
            changes: {}
        },
        {
            id: 'expert', label: "Expert",
            description: "réagit bien à 60 % des techniques et frappe toutes les 0,7 s",
            changes: { dodgeProbability: 0.6, attackInterval: 0.7 }
        },
        {
            id: 'buveur', label: "Buveur",
            description: "comme la référence, mais avec 3 fioles d'Estus",
            changes: { estusCharges: 3 }
        }
    ],

    // Réglages qui décrivent le joueur robot (ceux que les épreuves modifient)
    ROBOT_KEYS: ['dodgeProbability', 'attackInterval', 'estusCharges'],

    get(id) {
        const t = Trials.LIST.find(x => x.id === id);
        if (!t) throw new RangeError("Épreuve inconnue : " + id);
        return t;
    },

    /** Réglages complets de l'épreuve : `base` (réglages d'origine par défaut) avec le joueur robot de l'épreuve. */
    settings(id, base = Settings.defaults()) {
        const robot = {};
        for (const k of Trials.ROBOT_KEYS) robot[k] = Settings.PARAMETERS[k].initial;
        return Settings.validate(Object.assign({}, base, robot, Trials.get(id).changes));
    },

    /** Épreuve dont le joueur robot a exactement ces réglages, sinon null. */
    matching(settings) {
        for (const t of Trials.LIST) {
            const target = Trials.settings(t.id);
            if (Trials.ROBOT_KEYS.every(k => Math.abs(target[k] - settings[k]) < 1e-9)) return t.id;
        }
        return null;
    }
};
