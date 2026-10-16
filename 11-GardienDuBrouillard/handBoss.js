// Boss écrit à la main : une machine à états simple, pour la comparaison avec le boss appris.
// Il dispose des mêmes techniques que le boss appris, utilisées par des règles fixes.
//
// Techniques à distance (vérifiées dans tous les états, dès que le boss est libre) :
//   le joueur boit une fiole et le souffle est prêt     → souffle sur lui ;
//   le joueur est loin (> RUEE_DISTANCE), ruée prête,
//   et aucun pilier sur la trajectoire                  → ruée ;
//   le joueur est à moyenne distance, souffle prêt      → souffle.
// Esquive : toujours voulue ; le boss esquive dès que le joueur attaque et que son esquive est prête.
// États :
//   attente : garde ses distances (ATTENTE_DISTANCE) en tournant autour du joueur, sens changé toutes les
//             TOUR_DUREE s, tant que la hallebarde n'est pas prête ;
//   attaque : s'approche (arrive à distance d'attaque) et frappe dès que le joueur est à portée ;
//   recul   : s'éloigne (flee) pendant RECUL_DUREE secondes après chaque technique, puis attente.
//
// Même interface que NeuralBossController : decide(boss, player, arena) → décision.
class HandBossController {
    constructor() {
        this.name = "Boss à états";
        this.state = 'attente';
        this.timer = 0;
        this.clock = 0;         // horloge (s) du sens de rotation en attente
        this.lastInputs = null;
        this.lastOutputs = null;
    }

    static decision(mode, speed, o = {}) {
        return Object.assign({ mode: mode, speed: speed, strafe: 0, attack: false, dodge: true, charge: false, breath: false, order: ['charge', 'breath', 'attack'] }, o);
    }

    /** Technique à distance à lancer maintenant, ou null. */
    static rangedTechnique(boss, player, dist) {
        const H = HandBossController;
        if (player.drink && boss.breathCooldown <= 0) return 'breath';
        if (dist > H.RUEE_DISTANCE && boss.chargeCooldown <= 0 && !Combat.blocker(boss.pos, player.pos, boss.pillars, boss.r * 0.5)) return 'charge';
        if (dist > H.SOUFFLE_MIN && dist < H.SOUFFLE_MAX && boss.breathCooldown <= 0) return 'breath';
        return null;
    }

    decide(boss, player, arena) {
        const H = HandBossController;
        const dist = Math.hypot(player.pos.x - boss.pos.x, player.pos.y - boss.pos.y);
        const reach = Combat.ATTACKS.boss.reach + player.r;
        this.clock += Combat.DT;

        // Une technique vient de commencer : on recule ensuite
        if (boss.isAttacking() && this.state !== 'recul') {
            this.state = 'recul';
            this.timer = H.RECUL_DUREE;
        }
        if (this.state !== 'recul' && !boss.isAttacking()) {
            const ranged = H.rangedTechnique(boss, player, dist);
            if (ranged) return H.decision('hold', 0.4, { [ranged]: true, order: [ranged] });
        }

        if (this.state === 'attente') {
            if (boss.cooldown <= 0) this.state = 'attaque';
            else {
                const side = Math.floor(this.clock / H.TOUR_DUREE) % 2 === 0 ? 1 : -1;
                return H.decision(dist > H.ATTENTE_DISTANCE ? 'approach' : 'retreat', 0.4, { strafe: 0.6 * side });
            }
        }
        if (this.state === 'attaque') {
            return H.decision('approach', 1, { attack: dist <= reach * 0.9, order: ['attack'] });
        }
        // Recul : il commence quand la technique est finie (le boss est planté pendant ses techniques)
        if (!boss.isAttacking()) this.timer -= Combat.DT;
        if (this.timer <= 0) this.state = 'attente';
        return H.decision('retreat', 0.8);
    }
}

HandBossController.ATTENTE_DISTANCE = 160;
HandBossController.TOUR_DUREE = 2.5;
HandBossController.RECUL_DUREE = 0.8;
HandBossController.RUEE_DISTANCE = 230;
HandBossController.SOUFFLE_MIN = 200;
HandBossController.SOUFFLE_MAX = 330;
