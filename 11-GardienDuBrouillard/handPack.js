// Meute écrite à la main : règles fixes, pour la comparaison avec la meute apprise. Mêmes Creux, mêmes
// comportements de pilotage ; seule la décision change.
//
// Règles de chaque Creux :
//   - le chevalier attaque et je suis à moins de RECUL_DISTANCE px : je recule (evade) ;
//   - sinon je le poursuis (pursue), en restant groupé avec mes voisins (flocking) ;
//   - je mords dès que je peux.
// Elle ne cherche pas à encercler : c'est ce que la mesure d'encerclement compare.
//
// Même interface que NeuralPackController : decide(creux, player, arena) → décision.
class HandPackController {
    constructor() {
        this.name = "Meute à la main";
        this.lastInputs = null;
        this.lastOutputs = null;
    }

    decide(creux, player, arena) {
        const d = Math.hypot(player.pos.x - creux.pos.x, player.pos.y - creux.pos.y);
        const threatened = player.isAttacking() && d < HandPackController.RECUL_DISTANCE;
        return {
            pursue: threatened ? 0 : 1,
            flank: 0,
            evade: threatened ? 1 : 0,
            flock: HandPackController.FLOCK,
            bite: true
        };
    }
}

HandPackController.RECUL_DISTANCE = 75;
HandPackController.FLOCK = 0.4;
