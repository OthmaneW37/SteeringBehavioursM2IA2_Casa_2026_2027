// Préréglages du menu déroulant « Scénario ». Un scénario part des réglages d'origine
// (Settings.defaults) et ne liste que ce qui change : rien ne reste d'un scénario à l'autre.
// Choisir un scénario règle les curseurs comme le ferait l'utilisateur ; une modification à la main
// fait passer le menu sur « Personnalisé ».
const Scenarios = {
    LIST: [
        {
            id: 'reference', label: "1. Référence",
            description: "Réglages d'origine : 50 boss, 2 combats chacun, joueur scripté qui esquive 55 % des attaques.",
            changes: {}
        },
        {
            id: 'expert', label: "2. Joueur scripté expert",
            description: "Le joueur esquive 85 % des attaques et frappe souvent : le boss doit apprendre à choisir son moment.",
            changes: { dodgeProbability: 0.85, attackInterval: 0.6 }
        },
        {
            id: 'debutant', label: "3. Joueur scripté débutant",
            description: "Le joueur esquive 35 % des attaques et frappe rarement : un boss qui frappe sans réfléchir suffit, il apprend mal.",
            changes: { dodgeProbability: 0.35, attackInterval: 1.5 }
        },
        {
            id: 'rapide', label: "4. Entraînement rapide",
            description: "30 boss, un seul combat de 60 s au plus : les générations s'enchaînent vite, la fitness est plus bruitée.",
            changes: { populationSize: 30, fightsPerBoss: 1, maxFightTime: 60 }
        },
        {
            id: 'mutation', label: "5. Mutation forte",
            description: "Mutation à 30 % et 2 élites : exploration plus large, progression plus irrégulière.",
            changes: { mutationRate: 0.3, elites: 2 }
        },
        {
            id: 'myope', label: "6. Boss myope",
            description: "Rayon de détection de 180 px : au-delà, le boss erre (wander) sans décider ; il doit apprendre à rester proche.",
            changes: { detectRadius: 180 }
        }
    ],

    get(id) {
        const sc = Scenarios.LIST.find(s => s.id === id);
        if (!sc) throw new RangeError("Scénario inconnu : " + id);
        return sc;
    },

    /** Réglages complets d'un scénario (validés). */
    settings(id) {
        return Settings.validate(Object.assign(Settings.defaults(), Scenarios.get(id).changes));
    },

    /** Scénario dont les réglages sont exactement ceux donnés, sinon 'personnalise'. */
    matching(settings) {
        for (const sc of Scenarios.LIST) {
            const target = Scenarios.settings(sc.id);
            if (Object.keys(target).every(k => Math.abs(target[k] - settings[k]) < 1e-9)) return sc.id;
        }
        return 'personnalise';
    }
};
