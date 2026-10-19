// Campagne : une suite d'étapes (données) et une machine à états pure qui reporte la vie et les fioles
// d'une étape à l'autre. Aucun dessin, aucun accès au DOM : le câblage (sketch.js) crée les combats.
//
// Étapes (Campaign.STEPS) : { id, kind, label, intro, options? }
//   kind 'pack' : un combat contre une meute (options : size, perception) ;
//   kind 'veilleur' : le Veilleur des cendres et ses feux follets (niveau 2) ;
//   kind 'boss' : un combat contre un boss (options : bossHp, sa réserve de vie) ;
//   kind 'rest' : un feu de camp, lieu sûr sans ennemi, où l'on peut boire ses fioles sans risque.
// Ajouter un niveau = ajouter une entrée (par exemple une meute de 7 Creux avant le Gardien).
//
// Report : la vie et les fioles restantes passent à l'étape suivante. Seul le feu de camp rend quelque chose
// (Campaign.REST, à l'ARRIVÉE, pour pouvoir en profiter sur place) : une fiole, comme dans les Souls ; la vie,
// elle, ne revient pas.
// Point de reprise : en entrant dans une étape, on note la vie et les fioles. Mourir fait recommencer
// l'étape avec ces valeurs-là (pas avec celles de la mort) : aucun cercle vicieux où chaque essai partirait
// plus faible que le précédent.
const Campaign = {
    KINDS: ['pack', 'veilleur', 'boss', 'rest'],
    STEPS: [
        { id: 'meute', kind: 'pack', label: "Niveau 1 · La meute des Creux",
            intro: "Cinq Creux chassent en meute. Ne vous laissez pas encercler." },
        { id: 'feu', kind: 'rest', label: "Feu de camp",
            intro: "Un répit. Le feu ravive une fiole ; votre vie ne revient pas : buvez maintenant, à l'abri." },
        { id: 'veilleur', kind: 'veilleur', label: "Niveau 2 · Le Veilleur des cendres",
            intro: "Un sorcier qui garde ses distances. Ses feux follets vous poursuivent : coupez-les, ou roulez." },
        { id: 'feu2', kind: 'rest', label: "Dernier feu de camp",
            intro: "Le brouillard s'épaissit. Une fiole de plus, puis le sanctuaire." },
        { id: 'gardien', kind: 'boss', label: "Le Gardien du Brouillard", options: { bossHp: 500 },
            intro: "Le gardien du sanctuaire, au sommet de sa force. Méfiez-vous de ses coups retardés." }
    ],
    // Feu de camp : vie rendue et fioles ravivées à l'ARRIVÉE (comme dans les Souls : une fiole, pas la vie)
    REST: { heal: 0, estus: 1 },
    START: { hp: Combat.PLAYER.maxHp, estus: Combat.PLAYER.estus.charges },

    /** Vérifie une liste d'étapes : non vide, identifiants uniques, types connus, finit par un combat. */
    check(steps) {
        if (!Array.isArray(steps) || steps.length === 0) throw new RangeError("Une campagne a au moins une étape.");
        const ids = new Set();
        for (const s of steps) {
            if (!s || typeof s.id !== 'string' || ids.has(s.id)) throw new RangeError("Identifiant d'étape absent ou en double : " + (s && s.id));
            if (!Campaign.KINDS.includes(s.kind)) throw new RangeError("Type d'étape inconnu : " + s.kind);
            if (!s.label) throw new RangeError("Étape sans libellé : " + s.id);
            ids.add(s.id);
        }
        if (steps[steps.length - 1].kind === 'rest') throw new RangeError("La campagne doit finir par un combat.");
        return steps;
    }
};

class CampaignRun {
    constructor(steps = Campaign.STEPS, start = Campaign.START, rest = Campaign.REST) {
        this.steps = Campaign.check(steps);
        this.rest = Object.assign({ heal: 0, estus: 0 }, rest);
        this.maxHp = Combat.PLAYER.maxHp;
        this.index = 0;
        this.carry = { hp: start.hp, estus: start.estus };
        this.checkpoint = Object.assign({}, this.carry);
        this.deaths = 0;
        this.done = false;
    }

    get step() {
        return this.done ? null : this.steps[this.index];
    }

    /** « Étape 2 / 3 ». */
    progress() {
        return "Étape " + Math.min(this.index + 1, this.steps.length) + " / " + this.steps.length;
    }

    /** Étape suivante : un feu de camp ravive à l'arrivée (REST) ; le point de reprise est noté à l'entrée. */
    advance() {
        this.index++;
        if (this.index >= this.steps.length) this.done = true;
        else if (this.step.kind === 'rest') {
            this.carry.hp = Math.min(this.maxHp, this.carry.hp + this.rest.heal);
            this.carry.estus += this.rest.estus;
        }
        this.checkpoint = Object.assign({}, this.carry);
    }

    /** Combat gagné : la vie et les fioles du chevalier passent à la suite. */
    win(player) {
        if (this.done || this.step.kind === 'rest') throw new RangeError("Aucun combat en cours.");
        this.carry = { hp: Math.max(1, Math.min(this.maxHp, player.hp)), estus: player.estus };
        this.advance();
    }

    /** Mort : on recommence l'étape avec la vie et les fioles qu'on avait en y entrant. */
    die() {
        if (this.done) throw new RangeError("La campagne est finie.");
        this.deaths++;
        this.carry = Object.assign({}, this.checkpoint);
    }

    /** Au feu de camp : une gorgée sans risque (soin d'une fiole, plafonné). Retourne false sans fiole. */
    drink() {
        if (this.done || this.step.kind !== 'rest' || this.carry.estus <= 0 || this.carry.hp >= this.maxHp) return false;
        this.carry.estus--;
        this.carry.hp = Math.min(this.maxHp, this.carry.hp + Combat.PLAYER.estus.heal);
        return true;
    }

    /** Quitter le feu de camp : étape suivante (le repos a été donné à l'arrivée). */
    leaveRest() {
        if (this.done || this.step.kind !== 'rest') throw new RangeError("Pas de feu de camp ici.");
        this.advance();
    }
}
