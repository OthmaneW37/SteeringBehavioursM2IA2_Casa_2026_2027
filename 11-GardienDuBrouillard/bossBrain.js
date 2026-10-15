// Cerveau du boss : un NeuralNetwork (repris de l'exemple 9b) de 8 entrées, 16 neurones cachés
// sigmoïdes et 3 sorties sigmoïdes, plus sa traduction en décision pour Boss.control().
//
// Entrées, toutes dans [0, 1] :
//   0 distance au joueur / diagonale de l'arène
//   1 angle du joueur par rapport au cap du boss (0 = derrière à gauche, 0,5 = droit devant, 1 = derrière à droite)
//   2 vitesse du joueur / vitesse de roulade
//   3 endurance du joueur / endurance maximale
//   4 attente avant la prochaine attaque du boss / attente de base
//   5 vie du boss / vie maximale
//   6 rayon vers le mur à −45° du cap (1 = mur collé, 0 = rien à moins de RAY_SIGHT)
//   7 rayon vers le mur à +45° du cap
//
// Sorties :
//   0 déplacement : > 0,5 approche (`arrive` à distance d'attaque), < 0,5 recul (`flee`) ;
//     l'écart à 0,5 donne la vitesse ; une petite zone morte autour de 0,5 = rester sur place
//   1 attaque : au-dessus de 0,6 (strict), si l'attente est finie → attaque télégraphiée
//   2 esquive : au-dessus de 0,6 (strict), si le joueur attaque → `evade`
const BossBrain = {
    SIZES: [8, 16, 3],
    THRESHOLD: 0.6,
    DEADZONE: 0.06,
    RAY_SIGHT: 200,
    RAY_ANGLE: Math.PI / 4,
    INPUT_LABELS: ["Distance", "Angle", "Vit. joueur", "Endur. joueur", "Attente", "Vie boss", "Mur gauche", "Mur droit"],
    OUTPUT_LABELS: ["Déplacement", "Attaque", "Esquive"],

    create(rng) {
        return new NeuralNetwork(BossBrain.SIZES, rng);
    },

    clamp01(v) {
        return Math.max(0, Math.min(1, v));
    },

    inputs(boss, player, arena) {
        const dx = player.pos.x - boss.pos.x, dy = player.pos.y - boss.pos.y;
        const angle = Combat.angleDiff(Math.atan2(dy, dx), boss.facing);
        const ray = a => 1 - arena.rayDistance(boss.pos, boss.facing + a, BossBrain.RAY_SIGHT) / BossBrain.RAY_SIGHT;
        return [
            BossBrain.clamp01(Math.hypot(dx, dy) / arena.diagonal()),
            BossBrain.clamp01((angle + Math.PI) / (2 * Math.PI)),
            BossBrain.clamp01(player.vel.mag() / Combat.PLAYER.roll.maxSpeed),
            BossBrain.clamp01(player.stamina / player.maxStamina),
            BossBrain.clamp01(boss.cooldown / Combat.BOSS.cooldown),
            BossBrain.clamp01(boss.hp / boss.maxHp),
            BossBrain.clamp01(ray(-BossBrain.RAY_ANGLE)),
            BossBrain.clamp01(ray(BossBrain.RAY_ANGLE))
        ];
    },

    /** Sorties du réseau → décision. */
    decide(outputs) {
        const m = outputs[0] - 0.5;
        let mode = 'hold';
        if (m > BossBrain.DEADZONE) mode = 'approach';
        else if (m < -BossBrain.DEADZONE) mode = 'retreat';
        return {
            mode: mode,
            speed: Math.min(1, Math.abs(m) * 2),
            attack: outputs[1] > BossBrain.THRESHOLD,
            dodge: outputs[2] > BossBrain.THRESHOLD
        };
    }
};

/** Contrôleur du boss appris : entrées → réseau → décision. Garde les dernières valeurs pour le debug. */
class NeuralBossController {
    constructor(brain) {
        this.brain = brain;
        this.name = "Boss appris";
        this.lastInputs = null;
        this.lastOutputs = null;
    }

    decide(boss, player, arena) {
        this.lastInputs = BossBrain.inputs(boss, player, arena);
        this.lastOutputs = this.brain.predict(this.lastInputs);
        return BossBrain.decide(this.lastOutputs);
    }
}
