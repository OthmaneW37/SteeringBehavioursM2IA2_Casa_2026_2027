// Qualité graphique (réglage d'affichage, pas de simulation) : trois préréglages stockés comme données.
//   lightScale : résolution du calque d'obscurité, en fraction de l'arène (plus bas = plus flou, plus rapide) ;
//   particles  : plafond de particules (au-delà, les plus anciennes sont recyclées) ;
//   fogEvery   : le brouillard est recalculé une image sur `fogEvery` ;
//   fogCells   : largeur de la grille du brouillard, en cellules ;
//   glow       : lueurs colorées additives autour des sources de lumière.
// Le choix est gardé dans le navigateur (stockage injecté, accès protégés).
const Quality = {
    KEY: 'gardienDuBrouillard.quality.v1',
    DEFAULT: 'moyen',
    LEVELS: {
        bas: { label: "Bas", lightScale: 0.25, particles: 120, fogEvery: 4, fogCells: 56, glow: false },
        moyen: { label: "Moyen", lightScale: 0.5, particles: 320, fogEvery: 3, fogCells: 84, glow: true },
        haut: { label: "Haut", lightScale: 0.6, particles: 600, fogEvery: 2, fogCells: 120, glow: true }
    },
    // Bornes de chaque réglage (vérifiées par un test)
    RANGES: { lightScale: [0.1, 1], particles: [0, 1000], fogEvery: [1, 10], fogCells: [16, 200] },

    get(id) {
        const q = Quality.LEVELS[id];
        if (!q) throw new RangeError("Qualité graphique inconnue : " + id);
        return q;
    },

    load(storage) {
        try {
            const id = storage ? storage.getItem(Quality.KEY) : null;
            return Quality.LEVELS[id] ? id : Quality.DEFAULT;
        } catch (e) {
            return Quality.DEFAULT;
        }
    },

    save(storage, id) {
        Quality.get(id);
        try {
            if (!storage) return false;
            storage.setItem(Quality.KEY, id);
            return true;
        } catch (e) {
            return false;
        }
    }
};
