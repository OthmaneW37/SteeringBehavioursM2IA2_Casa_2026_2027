// Cerveau du boss : un NeuralNetwork (repris de l'exemple 9b) de 12 entrées, 16 neurones cachés
// sigmoïdes et 5 sorties sigmoïdes, plus sa traduction en décision pour Boss.control().
//
// Entrées, toutes dans [0, 1] :
//   0 distance au joueur / diagonale de l'arène
//   1 angle du joueur par rapport au cap du boss (0 = derrière à gauche, 0,5 = droit devant, 1 = derrière à droite)
//   2 vitesse du joueur / vitesse de roulade
//   3 endurance du joueur / endurance maximale
//   4 attente avant le prochain coup de hallebarde / attente de base
//   5 vie du boss / vie maximale
//   6 rayon vers le mur à −45° du cap (1 = mur collé, 0 = rien à moins de RAY_SIGHT)
//   7 rayon vers le mur à +45° du cap
//   8 vie du joueur / vie maximale
//   9 joueur vulnérable (1 s'il boit une fiole ou récupère après une attaque, sinon 0)
//  10 attente avant la prochaine ruée / attente de base
//  11 attente avant le prochain souffle / attente de base
//
// Sorties :
//   0 déplacement : > 0,5 approche (`arrive` à distance d'attaque), < 0,5 recul (`flee`) ;
//     l'écart à 0,5 donne la vitesse ; une petite zone morte autour de 0,5 = rester sur place
//   1 hallebarde : au-dessus de 0,6 (strict), si son attente est finie → coup télégraphié
//   2 esquive    : au-dessus de 0,6 (strict), si le joueur attaque → `evade`
//   3 ruée       : au-dessus de 0,6 (strict), si son attente est finie → charge vers la position prédite
//   4 souffle    : au-dessus de 0,6 (strict), si son attente est finie → nappe de brume
// Si plusieurs techniques dépassent le seuil, la plus forte sortie passe en premier (si elle est prête).
const BossBrain = {
    SIZES: [12, 16, 5],
    THRESHOLD: 0.6,
    DEADZONE: 0.06,
    RAY_SIGHT: 200,
    RAY_ANGLE: Math.PI / 4,
    INPUT_LABELS: ["Distance", "Angle", "Vit. joueur", "Endur. joueur", "Att. hallebarde", "Vie boss",
        "Mur gauche", "Mur droit", "Vie joueur", "Joueur vulnér.", "Att. ruée", "Att. souffle"],
    OUTPUT_LABELS: ["Déplacement", "Hallebarde", "Esquive", "Ruée", "Souffle"],
    TECHNIQUES: [['attack', 1], ['charge', 3], ['breath', 4]],

    create(rng) {
        return new NeuralNetwork(BossBrain.SIZES, rng);
    },

    clamp01(v) {
        return Math.max(0, Math.min(1, v));
    },

    inputs(boss, player, arena) {
        const B = Combat.BOSS;
        const dx = player.pos.x - boss.pos.x, dy = player.pos.y - boss.pos.y;
        const angle = Combat.angleDiff(Math.atan2(dy, dx), boss.facing);
        const ray = a => 1 - arena.rayDistance(boss.pos, boss.facing + a, BossBrain.RAY_SIGHT) / BossBrain.RAY_SIGHT;
        const c = BossBrain.clamp01;
        return [
            c(Math.hypot(dx, dy) / arena.diagonal()),
            c((angle + Math.PI) / (2 * Math.PI)),
            c(player.vel.mag() / Combat.PLAYER.roll.maxSpeed),
            c(player.stamina / player.maxStamina),
            c(boss.cooldown / B.cooldown),
            c(boss.hp / boss.maxHp),
            c(ray(-BossBrain.RAY_ANGLE)),
            c(ray(BossBrain.RAY_ANGLE)),
            c(player.hp / player.maxHp),
            player.vulnerable ? 1 : 0,
            c(boss.chargeCooldown / B.charge.cooldown),
            c(boss.breathCooldown / B.breath.cooldown)
        ];
    },

    /** Sorties du réseau → décision. */
    decide(outputs) {
        const m = outputs[0] - 0.5;
        let mode = 'hold';
        if (m > BossBrain.DEADZONE) mode = 'approach';
        else if (m < -BossBrain.DEADZONE) mode = 'retreat';
        const order = BossBrain.TECHNIQUES.slice().sort((a, b) => outputs[b[1]] - outputs[a[1]]).map(t => t[0]);
        return {
            mode: mode,
            speed: Math.min(1, Math.abs(m) * 2),
            attack: outputs[1] > BossBrain.THRESHOLD,
            dodge: outputs[2] > BossBrain.THRESHOLD,
            charge: outputs[3] > BossBrain.THRESHOLD,
            breath: outputs[4] > BossBrain.THRESHOLD,
            order: order
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
