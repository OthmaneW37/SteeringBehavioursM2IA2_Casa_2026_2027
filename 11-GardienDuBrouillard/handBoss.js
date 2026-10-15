// Boss écrit à la main : une machine à états simple, pour la comparaison avec le boss appris.
//
//   attente : garde ses distances (arrive à ATTENTE_DISTANCE) tant que l'attaque n'est pas prête ;
//   attaque : s'approche (arrive à distance d'attaque) et frappe dès que le joueur est à portée ;
//   recul   : s'éloigne (flee) pendant RECUL_DUREE secondes après chaque attaque, puis attente.
//
// Même interface que NeuralBossController : decide(boss, player, arena) → décision.
class HandBossController {
    constructor() {
        this.name = "Boss à états";
        this.state = 'attente';
        this.timer = 0;
        this.lastInputs = null;
        this.lastOutputs = null;
    }

    decide(boss, player, arena) {
        const dist = Math.hypot(player.pos.x - boss.pos.x, player.pos.y - boss.pos.y);
        const reach = Combat.ATTACKS.boss.reach + player.r;
        let decision = { mode: 'hold', speed: 0.5, attack: false, dodge: false };

        if (this.state === 'attente') {
            if (boss.cooldown <= 0) this.state = 'attaque';
            else decision = { mode: dist > HandBossController.ATTENTE_DISTANCE ? 'approach' : 'retreat', speed: 0.4, attack: false, dodge: false };
        }
        if (this.state === 'attaque') {
            if (boss.isAttacking()) {
                this.state = 'recul';
                this.timer = HandBossController.RECUL_DUREE;
            } else {
                decision = { mode: 'approach', speed: 1, attack: dist <= reach * 0.9, dodge: false };
            }
        }
        if (this.state === 'recul') {
            // Le recul commence quand l'attaque est finie (le boss est planté pendant l'attaque)
            if (!boss.isAttacking()) this.timer -= Combat.DT;
            decision = { mode: 'retreat', speed: 0.8, attack: false, dodge: false };
            if (this.timer <= 0) this.state = 'attente';
        }
        return decision;
    }
}

HandBossController.ATTENTE_DISTANCE = 160;
HandBossController.RECUL_DUREE = 0.8;
