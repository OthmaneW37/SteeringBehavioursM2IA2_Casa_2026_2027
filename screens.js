// Écrans du jeu et transitions en fondu au noir (machine à états pure, temps en secondes).
//
// Écrans : 'title' (écran titre), 'combat' (combat plein écran), 'lab' (laboratoire : entraînement,
// comparaison, Panthéon, démonstration et duels). La pause, les Options et le tutoriel sont des fenêtres
// par-dessus l'écran en cours, pas des écrans.
//
// go(cible) : l'image s'assombrit pendant FADE s ('out'), l'écran change au noir complet, puis l'image
// réapparaît pendant FADE s ('in'). Un nouvel ordre pendant une transition remplace la cible : le dernier
// demandé gagne, et le fondu repart du niveau de noir atteint (pas de saut).
// update(dt) retourne { from, to } à l'instant précis où l'écran change, sinon null : le câblage (sketch.js)
// affiche alors les bons panneaux.
class ScreenFlow {
    constructor(start = 'title') {
        ScreenFlow.check(start);
        this.current = start;
        this.target = null;
        this.phase = 'idle';   // 'idle', 'out' ou 'in'
        this.t = 0;            // secondes écoulées dans la phase
    }

    static check(name) {
        if (!ScreenFlow.LIST.includes(name)) throw new RangeError("Écran inconnu : " + name);
        return name;
    }

    get busy() {
        return this.phase !== 'idle';
    }

    /** L'utilisateur peut agir sur l'écran affiché : pas pendant l'assombrissement (l'écran va partir). */
    get interactive() {
        return this.phase !== 'out';
    }

    /**
     * Demande un changement d'écran. Retourne false si l'on y est déjà, y compris pendant sa réapparition
     * (on ne relance pas un fondu vers l'écran qu'on est en train d'afficher).
     */
    go(name) {
        ScreenFlow.check(name);
        if (name === this.current && this.phase !== 'out') return false;
        if (this.phase === 'in') {
            // On repart vers le noir depuis le niveau actuel
            this.t = ScreenFlow.FADE * this.alpha();
            this.phase = 'out';
        } else if (this.phase === 'idle') {
            this.phase = 'out';
            this.t = 0;
        }
        this.target = name;
        return true;
    }

    /** Avance de dt secondes. Retourne { from, to } quand l'écran change. */
    update(dt) {
        if (this.phase === 'out') {
            this.t += dt;
            if (this.t >= ScreenFlow.FADE) {
                const from = this.current;
                this.current = this.target;
                this.target = null;
                this.phase = 'in';
                this.t = 0;
                return { from: from, to: this.current };
            }
        } else if (this.phase === 'in') {
            this.t += dt;
            if (this.t >= ScreenFlow.FADE) {
                this.phase = 'idle';
                this.t = 0;
            }
        }
        return null;
    }

    /** Opacité du voile noir, dans [0, 1]. */
    alpha() {
        if (this.phase === 'out') return Math.min(1, this.t / ScreenFlow.FADE);
        if (this.phase === 'in') return Math.max(0, 1 - this.t / ScreenFlow.FADE);
        return 0;
    }
}

ScreenFlow.LIST = ['title', 'combat', 'lab'];
ScreenFlow.FADE = 0.35;   // secondes de fondu, dans chaque sens
