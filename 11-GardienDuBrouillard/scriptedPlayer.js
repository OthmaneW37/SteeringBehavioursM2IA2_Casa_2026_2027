// Joueur scripté de référence pour l'entraînement et la comparaison. Ce n'est pas un humain :
// une fitness stable exige un adversaire reproductible (aléatoire injecté, temps en secondes).
// Il joue comme un joueur de Souls prudent ; il est toujours verrouillé sur le boss.
//
// Règles, dans l'ordre de priorité :
//   1. le boss PRÉPARE une attaque et le joueur est à portée : à chaque attaque, il décide une fois,
//      avec la probabilité fixe `dodgeProbability`, s'il esquivera ; si oui, il roule juste avant la
//      frappe (ROLL_LEAD s avant la fin de la préparation, les 0,3 s d'invulnérabilité la couvrent),
//      sinon il reste planté et encaisse ;
//   2. endurance basse : il se repose (recule, tourne autour du boss) jusqu'à la récupérer ;
//   3. le boss est en RÉCUPÉRATION : il fonce punir, si son attaque sera finie à temps pour esquiver la suivante ;
//   4. l'attaque du boss est prête (attente < DANGER_COOLDOWN) : il ne s'engage pas ; il tourne autour du boss,
//      se rapproche s'il est loin, mais ne recule pas : il laisse le boss venir et attend son attaque.
//      Sa patience est limitée (PATIENCE s) : un boss qui n'attaque jamais finit par être attaqué ;
//   5. sinon il s'approche, tourne autour du boss et attaque à intervalles réguliers (`attackInterval`).
class ScriptedPlayerController {
    constructor(rng, options = {}) {
        this.rng = rng;
        this.dodgeProbability = options.dodgeProbability !== undefined ? options.dodgeProbability : 0.55;
        this.attackInterval = options.attackInterval !== undefined ? options.attackInterval : 0.9;
        this.attackTimer = 0;
        this.resting = false;
        this.lastBossAction = null;
        this.willDodge = false;
        this.strafe = 1;
        this.strafeTimer = 3;
        this.dodgesPlanned = 0;
        this.waited = 0;          // temps passé à attendre l'attaque du boss (règle 4)
    }

    /** Temps (s) qu'il faut à une attaque du joueur pour frapper. */
    static timeToHit(kind) {
        const s = Combat.ATTACKS[kind];
        return s.windup + s.active;
    }

    /**
     * Peut-il lancer cette attaque alors qu'il reste `remaining` s de récupération au boss ?
     * Au pire, le boss réattaque dès la fin de sa récupération ; le joueur doit alors pouvoir rouler
     * ROLL_LEAD s avant la frappe. Son attaque doit donc finir avant remaining + préparation − ROLL_LEAD.
     */
    static safeToCommit(kind, remaining) {
        return Combat.duration(Combat.ATTACKS[kind]) <= remaining + Combat.ATTACKS.boss.windup - ScriptedPlayerController.ROLL_LEAD;
    }

    intent(player, boss, arena, dt) {
        this.attackTimer -= dt;
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
            this.strafe = -this.strafe;
            this.strafeTimer = 2 + this.rng() * 2;
        }
        const intent = { move: { x: 0, y: 0 }, lock: true, light: false, heavy: false, roll: false };
        if (!player.alive || !boss.alive) return intent;

        const dist = Math.hypot(boss.pos.x - player.pos.x, boss.pos.y - player.pos.y);
        const myReach = Combat.ATTACKS.light.reach + boss.r;
        const spec = Combat.ATTACKS.boss;
        const bossReach = spec.reach + player.r;
        const phase = boss.action ? Combat.phase(spec, boss.action.t) : null;

        // Nouvelle attaque du boss : la décision d'esquiver est tirée une seule fois
        if (boss.action && boss.action !== this.lastBossAction) {
            this.lastBossAction = boss.action;
            this.willDodge = this.rng() < this.dodgeProbability;
            if (this.willDodge) this.dodgesPlanned++;
        }
        if (!boss.action) this.lastBossAction = null;
        else this.waited = 0;

        if (player.stamina < ScriptedPlayerController.REST_LOW) this.resting = true;
        if (player.stamina >= ScriptedPlayerController.REST_HIGH) this.resting = false;

        // 1. Attaque en préparation
        if (phase === 'windup' || phase === 'active') {
            if (dist <= bossReach + ScriptedPlayerController.THREAT_MARGIN) {
                if (this.willDodge && phase === 'windup' && spec.windup - boss.action.t <= ScriptedPlayerController.ROLL_LEAD) {
                    intent.roll = true;
                }
                return intent;
            }
            intent.move.y = 1; // hors de portée : il recule encore un peu
            return intent;
        }

        // 2. Repos
        if (this.resting) {
            intent.move.y = dist < ScriptedPlayerController.REST_DISTANCE ? 1 : 0;
            intent.move.x = this.strafe * 0.6;
            return intent;
        }

        // 3. Punition pendant la récupération du boss
        if (phase === 'recovery') {
            const remaining = Combat.duration(spec) - boss.action.t;
            if (dist > myReach - 8) intent.move.y = -1;
            if (dist <= myReach && !boss.dodge) {
                // Il ne s'engage que si son attaque sera finie quand il devra rouler contre la suivante
                if (ScriptedPlayerController.safeToCommit('heavy', remaining) && player.stamina >= 60) intent.heavy = true;
                else if (ScriptedPlayerController.safeToCommit('light', remaining)) intent.light = true;
            }
            return intent;
        }

        // 4. L'attaque du boss est prête : il attend sans s'engager (il ne recule pas, pour ne pas fuir le combat)
        if (boss.cooldown < ScriptedPlayerController.DANGER_COOLDOWN && this.waited < ScriptedPlayerController.PATIENCE) {
            this.waited += dt;
            if (dist > bossReach + ScriptedPlayerController.SAFE_MARGIN) intent.move.y = -1;
            intent.move.x = this.strafe * 0.5;
            return intent;
        }

        // 5. Approche et attaques régulières
        if (dist > myReach - 8) intent.move.y = -1;
        else intent.move.x = this.strafe * 0.3;
        if (dist <= myReach && this.attackTimer <= 0 && !boss.dodge) {
            intent.light = true;
            this.attackTimer = this.attackInterval;
        }
        return intent;
    }
}

ScriptedPlayerController.ROLL_LEAD = 0.12;       // roule 0,12 s avant la frappe
ScriptedPlayerController.THREAT_MARGIN = 25;     // marge autour de la portée du boss
ScriptedPlayerController.DANGER_COOLDOWN = 0.4;  // attente du boss sous laquelle il ne s'approche plus
ScriptedPlayerController.PATIENCE = 1.5;         // secondes d'attente avant de s'engager quand même
ScriptedPlayerController.SAFE_MARGIN = 35;       // au-delà de portée + marge, il se rapproche
ScriptedPlayerController.REST_LOW = 25;
ScriptedPlayerController.REST_HIGH = 75;
ScriptedPlayerController.REST_DISTANCE = 260;
