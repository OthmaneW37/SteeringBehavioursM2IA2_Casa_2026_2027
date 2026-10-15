/**
 * Enchaînement des circuits pendant l'entraînement (sans p5 ni DOM).
 *
 * Règle de passage : à la fin d'une génération, si au moins une voiture a réussi
 * un tour complet, on passe au circuit suivant. Le cerveau n'est pas réinitialisé :
 * la même population continue sur le nouveau circuit (test de généralisation).
 *
 * Fin de liste : on repart au premier circuit (boucle). Avec un seul circuit dans
 * la liste, rien ne change : c'est le comportement d'origine.
 *
 * Le curriculum garde aussi, pour chaque circuit, le meilleur nombre de tours
 * réussis : la condition d'arrêt « N tours sur tous les circuits » s'en sert.
 */
class CircuitCurriculum {
    constructor(circuitIds) {
        if (!Array.isArray(circuitIds) || circuitIds.length === 0) {
            throw new RangeError("La liste de circuits est vide.");
        }
        this.ids = circuitIds.slice();
        this.index = 0;
        this.passed = 0;        // circuits validés depuis le début (un tour complet)
        this.loops = 0;         // nombre de fois où la liste a été parcourue en entier
        this.bestLaps = {};     // identifiant → meilleur nombre de tours en une évaluation
        for (const id of this.ids) this.bestLaps[id] = 0;
    }

    current() {
        return this.ids[this.index];
    }

    /**
     * Fin de génération : maxLaps est le plus grand nombre de tours réussis
     * par une voiture de la génération. Retourne true si le circuit change.
     */
    afterGeneration(maxLaps) {
        const id = this.current();
        if (maxLaps > this.bestLaps[id]) this.bestLaps[id] = maxLaps;
        if (maxLaps < 1) return false;

        this.passed++;
        this.index++;
        if (this.index >= this.ids.length) {
            this.index = 0;
            this.loops++;
        }
        return this.ids.length > 1;
    }

    /** Plus petit record de tours parmi tous les circuits de la liste. */
    lapsOnAllCircuits() {
        return Math.min(...this.ids.map(id => this.bestLaps[id]));
    }
}
