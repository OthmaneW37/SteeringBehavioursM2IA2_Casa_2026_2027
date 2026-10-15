// Démonstration côte à côte, pour montrer ce que l'entraînement apporte.
//   À gauche : un boss « avant » — un réseau au hasard (comme à la génération 0) ou le boss à états.
//   À droite : le champion de l'entraînement.
// Les deux affrontent le même joueur robot, avec la même graine : seul le cerveau du boss change.
// Quand les deux combats sont finis, une pause, puis une nouvelle manche ; le score est compté.
class Demo {
    constructor(leftKind, championBrain, settings, round = 1) {
        this.leftKind = leftKind;          // 'random' ou 'hand'
        this.championBrain = championBrain;
        this.settings = settings;
        this.round = round;
        this.score = { left: 0, right: 0, rounds: 0 };
        this.pause = 0;
        this.arena = new Arena();
        this.start();
    }

    static leftLabel(kind) {
        return kind === 'hand' ? "Boss écrit à la main (machine à états)" : "Boss avant entraînement (réseau au hasard)";
    }

    leftController() {
        if (this.leftKind === 'hand') return new HandBossController();
        return new NeuralBossController(BossBrain.create(seededRandom(this.round * 31 + 7)));
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
            seed: seed
        });
    }

    start() {
        this.left = this.makeFight(this.leftController());
        this.right = this.makeFight(new NeuralBossController(this.championBrain));
        this.pause = 0;
        this.counted = false;
    }

    get over() {
        return this.left.over && this.right.over;
    }

    /** Un pas de simulation pour les deux combats. */
    step() {
        if (!this.left.over) this.left.step();
        if (!this.right.over) this.right.step();
    }

    /** Fin de manche : score, puis nouvelle manche après `Demo.PAUSE` secondes. */
    update(dt) {
        if (!this.over) return;
        if (!this.counted) {
            this.counted = true;
            this.score.rounds++;
            if (this.left.result.winner === 'boss') this.score.left++;
            if (this.right.result.winner === 'boss') this.score.right++;
        }
        this.pause += dt;
        if (this.pause >= Demo.PAUSE) {
            this.round++;
            this.start();
        }
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
