// Décisions du Veilleur des cendres : règles écrites à la main (sélection de l'action de Reynolds), lues dans
// l'état du combat. Rien ici ne calcule de force : Veilleur.control() traduit la décision en steering.
//
//   - le chevalier est à moins de FLEE_DISTANCE px : il fuit (flee) ;
//   - il est à moins de BLINK_DISTANCE px et attaque, ou le serre depuis CORNERED s : saut de cendres (evade) ;
//   - sinon il garde ses distances (arrive vers un point à distance de garde) en tournant autour de lui, et il
//     invoque des feux follets dès que c'est prêt (chevalier à plus de CAST_DISTANCE px), sous le plafond ;
//   - le sens dans lequel il tourne change toutes les TURN s.
class VeilleurController {
    constructor() {
        this.name = "Veilleur des cendres";
        this.clock = 0;
        this.close = 0;   // temps passé avec le chevalier à moins de BLINK_DISTANCE
    }

    decide(veilleur, player, wisps, dt) {
        const C = VeilleurController;
        this.clock += dt;
        const d = Math.hypot(player.pos.x - veilleur.pos.x, player.pos.y - veilleur.pos.y);
        this.close = d < C.BLINK_DISTANCE ? this.close + dt : 0;
        const live = wisps.filter(w => w.alive).length;
        return {
            mode: d < C.FLEE_DISTANCE ? 'flee' : 'keep',
            side: Math.floor(this.clock / C.TURN) % 2 === 0 ? 1 : -1,
            cast: live + Veilleur.CAST.count <= Veilleur.MAX_WISPS && d > C.CAST_DISTANCE,
            blink: d < C.BLINK_DISTANCE && (player.isAttacking() || this.close >= C.CORNERED)
        };
    }
}

VeilleurController.FLEE_DISTANCE = 150;
VeilleurController.CAST_DISTANCE = 120;   // il ose invoquer dès 120 px (au risque d'être frappé, planté)
VeilleurController.BLINK_DISTANCE = 75;
VeilleurController.CORNERED = 1.2;
VeilleurController.TURN = 3.5;
