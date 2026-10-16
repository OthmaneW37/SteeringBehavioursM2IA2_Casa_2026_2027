// Recettes d'entraînement (« doctrines ») : CE QUE le boss apprend dépend de deux choix.
//   - weights : la note (fitness) qu'on lui donne. Mêmes termes que Fitness.WEIGHTS, poids différents :
//     récompenser surtout les dégâts infligés donne un boss agressif ; punir les dégâts reçus, un boss prudent.
//   - trial : l'épreuve (Trials) contre laquelle il s'entraîne. Un boss entraîné contre un joueur
//     expert n'apprend pas la même chose qu'un boss entraîné contre un débutant.
// Tout le reste est identique : même cerveau 12-16-5, même algorithme génétique, même arène.
// Le Panthéon garde un boss par recette ; son tournoi montre ce que chaque recette a produit.
const Doctrines = {
    LIST: [
        {
            id: 'gardien', name: "Le Gardien", color: [255, 190, 60],
            description: "Recette de référence : note équilibrée, joueur robot de référence.",
            weights: { dealt: 100, received: 100, win: 100, whiff: 4, drink: 0 },
            trial: 'reference'
        },
        {
            id: 'bourreau', name: "Le Bourreau", color: [230, 80, 55],
            description: "Note qui récompense surtout les dégâts infligés ; les coups reçus comptent peu.",
            weights: { dealt: 200, received: 30, win: 100, whiff: 1, drink: 0 },
            trial: 'reference'
        },
        {
            id: 'spectre', name: "Le Spectre", color: [150, 170, 235],
            description: "Note qui punit surtout les coups reçus : il apprend à ne pas se faire toucher.",
            weights: { dealt: 60, received: 220, win: 100, whiff: 8, drink: 0 },
            trial: 'reference'
        },
        {
            id: 'chasseur', name: "Le Chasseur", color: [120, 205, 110],
            description: "Note de référence, mais entraîné contre le joueur robot expert.",
            weights: { dealt: 100, received: 100, win: 100, whiff: 4, drink: 0 },
            trial: 'expert'
        },
        {
            id: 'opportuniste', name: "L'Opportuniste", color: [205, 140, 220],
            description: "Note de référence, mais entraîné contre le joueur robot débutant : la victoire est facile.",
            weights: { dealt: 100, received: 100, win: 100, whiff: 4, drink: 0 },
            trial: 'debutant'
        },
        {
            id: 'geolier', name: "Le Geôlier", color: [100, 210, 190],
            description: "Contre un joueur robot qui a 3 fioles, et chaque gorgée réussie du chevalier lui coûte : il doit l'empêcher de boire.",
            weights: { dealt: 100, received: 100, win: 100, whiff: 4, drink: 30 },
            trial: 'buveur'
        }
    ],

    get(id) {
        const d = Doctrines.LIST.find(x => x.id === id);
        if (!d) throw new RangeError("Recette d'entraînement inconnue : " + id);
        return d;
    },

    /** Réglages d'entraînement de la recette : `base` avec le joueur robot de son épreuve. */
    settings(id, base = Settings.defaults()) {
        return Trials.settings(Doctrines.get(id).trial, base);
    },

    /** Phrase qui résume la recette, pour le menu. */
    summary(id) {
        const d = Doctrines.get(id), t = Trials.get(d.trial), w = d.weights;
        return d.description + " Note : dégâts infligés × " + w.dealt + ", dégâts reçus × −" + w.received +
            ", victoire + " + w.win + ", coup dans le vide − " + w.whiff +
            (w.drink ? ", gorgée réussie du chevalier − " + w.drink : "") + ". Adversaire : " + t.label.toLowerCase() + " (" + t.description + ").";
    }
};
