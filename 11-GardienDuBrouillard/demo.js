// Démonstration et duels côte à côte.
//   Démonstration : à gauche un boss « avant » (réseau au hasard ou boss à états), à droite le champion.
//   Duel : deux boss du Panthéon, entraînés avec des recettes différentes.
// Les deux affrontent le même joueur robot, avec la même graine : seul le cerveau du boss change.
// Ce n'est pas un combat boss contre boss : leurs cerveaux ont appris à lire un chevalier (sa fatigue,
// ses fioles, sa vulnérabilité). Le duel est donc une COURSE : à chaque manche, le vainqueur est le boss
// qui fait le mieux contre le même chevalier (voir roundWinner).
// Quand les deux combats sont finis, une pause, puis une nouvelle manche ; les scores sont comptés.
//
// Un côté : { label, make: manche → contrôleur du boss } (voir randomSide, handSide, brainSide).
class Demo {
    constructor(leftSide, rightSide, settings, round = 1) {
        this.leftSide = leftSide;
        this.rightSide = rightSide;
        this.settings = settings;
        this.round = round;
        // left / right : victoires de chaque boss contre le chevalier ; duel : manches gagnées l'un contre l'autre
        this.score = { left: 0, right: 0, rounds: 0, duel: { left: 0, right: 0, ties: 0 } };
        this.pause = 0;
        this.arena = new Arena();
        this.start();
    }

    /** Un réseau au hasard, différent à chaque manche (comme à la génération 0). */
    static randomSide() {
        return { label: "Boss avant entraînement (réseau au hasard)", make: round => new NeuralBossController(BossBrain.create(seededRandom(round * 31 + 7))) };
    }

    static handSide() {
        return { label: "Boss écrit à la main (machine à états)", make: () => new HandBossController() };
    }

    static brainSide(label, brain) {
        return { label: label, make: () => new NeuralBossController(brain) };
    }

    makeFight(controller) {
        const s = this.settings;
        const seed = 4242 + this.round;
        return new Fight({
            arena: this.arena,
            playerController: new ScriptedPlayerController(seededRandom(seed), {
                dodgeProbability: s.dodgeProbability, attackInterval: s.attackInterval
            }),
            bossController: controller,
            maxTime: s.maxFightTime,
            detectRadius: s.detectRadius,
            estus: s.estusCharges,
            seed: seed
        });
    }

    start() {
        this.left = this.makeFight(this.leftSide.make(this.round));
        this.right = this.makeFight(this.rightSide.make(this.round));
        this.pause = 0;
        this.counted = false;
        this.lastWinner = null;
    }

    get over() {
        return this.left.over && this.right.over;
    }

    /** Un pas de simulation pour les deux combats. */
    step() {
        if (!this.left.over) this.left.step();
        if (!this.right.over) this.right.step();
    }

    /** Fin de manche : scores, puis nouvelle manche après `Demo.PAUSE` secondes. */
    update(dt) {
        if (!this.over) return;
        if (!this.counted) {
            this.counted = true;
            this.score.rounds++;
            if (this.left.result.winner === 'boss') this.score.left++;
            if (this.right.result.winner === 'boss') this.score.right++;
            this.lastWinner = Demo.roundWinner(this.left.result, this.right.result);
            if (this.lastWinner === 'tie') this.score.duel.ties++;
            else this.score.duel[this.lastWinner]++;
        }
        this.pause += dt;
        if (this.pause >= Demo.PAUSE) {
            this.round++;
            this.start();
        }
    }

    /**
     * Vainqueur d'une manche de duel ('left', 'right' ou 'tie'), d'après les deux résultats contre le même chevalier :
     *   1. le boss qui a tué le chevalier bat celui qui ne l'a pas tué ; un match nul bat une défaite ;
     *   2. les deux ont gagné : le plus RAPIDE l'emporte (écart d'au moins DUEL_TIME_GAP s) ;
     *   3. aucun n'a gagné : celui qui a infligé le plus de dégâts (écart d'au moins DUEL_DAMAGE_GAP points).
     */
    static roundWinner(a, b) {
        const rank = r => (r.winner === 'boss' ? 2 : r.winner === 'draw' ? 1 : 0);
        if (rank(a) !== rank(b)) return rank(a) > rank(b) ? 'left' : 'right';
        if (rank(a) === 2) {
            if (Math.abs(a.duration - b.duration) < Demo.DUEL_TIME_GAP) return 'tie';
            return a.duration < b.duration ? 'left' : 'right';
        }
        if (Math.abs(a.damageToPlayer - b.damageToPlayer) < Demo.DUEL_DAMAGE_GAP) return 'tie';
        return a.damageToPlayer > b.damageToPlayer ? 'left' : 'right';
    }

    /** Phrase de résultat d'un combat, pour un public non spécialiste. */
    static verdict(fight) {
        if (!fight.result) return "Combat en cours…";
        const t = fight.result.duration.toFixed(0);
        if (fight.result.winner === 'boss') return "Le boss gagne en " + t + " s";
        if (fight.result.winner === 'player') return "Le chevalier gagne en " + t + " s";
        return "Match nul (temps écoulé)";
    }
}

Demo.PAUSE = 2.5;
Demo.DUEL_TIME_GAP = 0.5;     // s
Demo.DUEL_DAMAGE_GAP = 1;     // points de vie
