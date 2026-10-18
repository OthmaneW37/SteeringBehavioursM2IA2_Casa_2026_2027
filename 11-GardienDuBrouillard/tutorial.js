// Tutoriel des commandes : quelques cartes courtes, montrées au premier combat. Une fois vu (ou passé),
// il est mémorisé dans le navigateur ; on peut le revoir depuis les Options. Le stockage est injecté et
// chaque accès est protégé : un navigateur qui bloque le stockage ne fait rien planter.
const Tutorial = {
    KEY: 'gardienDuBrouillard.tutorial.v1',

    CARDS: [
        { title: "Se déplacer", text: "ZQSD, WASD ou les flèches. L ou Tab verrouille la caméra sur le boss : vous tournez alors autour de lui." },
        { title: "Rouler au bon moment", text: "Quand le cône ou la ligne rouge se remplit, roulez avec Espace : vous êtes invulnérable 0,3 s." },
        { title: "Parer, puis riposter", text: "U ou Maj lève le bouclier. Parez la hallebarde (ou une morsure) au moment où elle frappe : l'ennemi est déséquilibré, et votre coup suivant est une riposte critique (× 3). La ruée ne se pare pas. Une parade ratée vous laisse vulnérable." },
        { title: "Frapper pendant sa récupération", text: "Après chaque technique, le boss reste vulnérable un instant. J : attaque légère, K : attaque lourde. Attention : attaquer fatigue." },
        { title: "Boire à l'abri", text: "E boit une fiole d'Estus (25 PV, 1 s presque immobile). Cachez-vous derrière un pilier : un coup reçu avant le soin fait perdre la fiole." },
        { title: "Piliers et coins", text: "Les piliers parent les coups, et une ruée qui en percute un étourdit le boss. S'il se terre dans un coin, le brouillard le dévore. G : voir son « cerveau »." }
    ],

    /** Faut-il le montrer ? Oui tant qu'il n'a pas été vu (ou si le stockage est illisible). */
    shouldShow(storage) {
        try {
            return !storage || storage.getItem(Tutorial.KEY) !== '1';
        } catch (e) {
            return true;
        }
    },

    /** Mémorise qu'il a été vu. Retourne false si le stockage refuse. */
    markSeen(storage) {
        try {
            if (!storage) return false;
            storage.setItem(Tutorial.KEY, '1');
            return true;
        } catch (e) {
            return false;
        }
    }
};

/** Un passage dans le tutoriel : carte en cours, suivante, précédente, passer. */
class TutorialRun {
    constructor(cards = Tutorial.CARDS) {
        this.cards = cards;
        this.index = 0;
    }

    get done() {
        return this.index >= this.cards.length;
    }

    card() {
        return this.done ? null : this.cards[this.index];
    }

    next() {
        if (!this.done) this.index++;
        return this.card();
    }

    prev() {
        if (this.index > 0) this.index--;
        return this.card();
    }

    skip() {
        this.index = this.cards.length;
    }

    /** « 2 / 5 » */
    progress() {
        return Math.min(this.index + 1, this.cards.length) + " / " + this.cards.length;
    }
}
