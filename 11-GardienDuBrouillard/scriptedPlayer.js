// Joueur robot (scripté) de référence pour l'entraînement et la comparaison. Ce n'est pas un humain :
// une fitness stable exige un adversaire reproductible (aléatoire injecté, temps en secondes).
// Il joue comme un joueur de Souls prudent ; il est toujours verrouillé sur le boss et il contourne
// toujours les nappes de brume et les piliers (évitement d'obstacles, voir Steering.avoidZones).
//
// Règles, dans l'ordre de priorité :
//   1. une technique du boss le menace. À chaque technique, il décide une fois, avec la probabilité fixe
//      `dodgeProbability`, s'il réagira bien :
//        hallebarde : il roule ROLL_LEAD s avant la frappe (les 0,3 s d'invulnérabilité la couvrent) ;
//        ruée       : il sort de la ligne de charge en se déplaçant de côté, et roule si le boss arrive sur lui ;
//        souffle    : il s'écarte de côté de la zone visée ;
//      s'il a décidé de mal réagir, il reste planté ;
//   2. vie basse et fioles restantes : il boit, mais seulement à l'abri (boss loin, en longue récupération,
//      ou caché derrière un pilier qui coupe la ligne de vue) ; sinon il court se cacher derrière le pilier
//      le plus proche (`arrive` vers le point abrité), ou recule s'il n'y en a pas ;
//   3. endurance basse : il se repose derrière un pilier, ou recule en tournant autour du boss ;
//   4. le boss est en RÉCUPÉRATION : il fonce punir, si son attaque sera finie à temps pour esquiver la suivante ;
//   5. le coup de hallebarde est prêt (attente < DANGER_COOLDOWN) : il ne s'engage pas ; il tourne autour du boss,
//      se rapproche s'il est loin, mais ne recule pas. Sa patience est limitée (PATIENCE s) ;
//   6. sinon il s'approche, tourne autour du boss et attaque à intervalles réguliers (`attackInterval`).
class ScriptedPlayerController {
    constructor(rng, options = {}) {
        this.rng = rng;
        this.dodgeProbability = options.dodgeProbability !== undefined ? options.dodgeProbability : 0.4;
        this.attackInterval = options.attackInterval !== undefined ? options.attackInterval : 0.9;
        this.attackTimer = 0;
        this.resting = false;
        this.lastBossAction = null;
        this.willDodge = false;
        this.strafe = 1;
        this.strafeTimer = 3;
        this.dodgesPlanned = 0;
        this.waited = 0;          // temps passé à attendre l'attaque du boss (règle 5)
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

    /**
     * Abri le plus proche : { pillar, point } où `point` est derrière un pilier debout, à l'opposé du boss,
     * à moins de COVER_MAX px du joueur ; null sinon.
     */
    static cover(player, boss) {
        let best = null, bestD = ScriptedPlayerController.COVER_MAX;
        for (const p of player.pillars || []) {
            if (!p.alive) continue;
            const point = p.coverPoint(boss.pos, player.r);
            const d = Math.hypot(point.x - player.pos.x, point.y - player.pos.y);
            if (d < bestD) { bestD = d; best = { pillar: p, point: point }; }
        }
        return best;
    }

    /** Le joueur est-il caché du boss par un pilier ? */
    static hidden(player, boss) {
        return Combat.blocker(boss.pos, player.pos, player.pillars, -4) !== null;
    }

    /** Côté (−1 ou +1, en coordonnées verrouillées) qui éloigne le joueur de la ligne boss → cible. */
    static sideAway(player, boss, target) {
        const fx = boss.pos.x - player.pos.x, fy = boss.pos.y - player.pos.y; // vers le boss
        const tx = target.x - boss.pos.x, ty = target.y - boss.pos.y;         // direction de la technique
        // Droite du joueur verrouillé = (−fy, fx) ; on va du côté opposé à la ligne
        const cross = (-fy) * tx + fx * ty;
        return cross > 0 ? -1 : 1;
    }

    intent(player, boss, arena, dt) {
        this.attackTimer -= dt;
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
            this.strafe = -this.strafe;
            this.strafeTimer = 2 + this.rng() * 2;
        }
        const S = ScriptedPlayerController;
        const intent = { move: { x: 0, y: 0 }, lock: true, light: false, heavy: false, roll: false, drink: false, avoid: true };
        if (!player.alive || !boss.alive) return intent;

        const dist = Math.hypot(boss.pos.x - player.pos.x, boss.pos.y - player.pos.y);
        const myReach = Combat.ATTACKS.light.reach + boss.r;
        const a = boss.action;
        const spec = a ? a.spec : Combat.ATTACKS.boss;
        const phase = a ? Combat.phase(spec, a.t) : null;

        // Nouvelle technique du boss : la décision de bien réagir est tirée une seule fois
        if (a && a !== this.lastBossAction) {
            this.lastBossAction = a;
            this.willDodge = this.rng() < this.dodgeProbability;
            if (this.willDodge) this.dodgesPlanned++;
        }
        if (!a) this.lastBossAction = null;
        else this.waited = 0;

        if (player.stamina < S.REST_LOW) this.resting = true;
        if (player.stamina >= S.REST_HIGH) this.resting = false;

        // 1. Menaces
        if (a && (phase === 'windup' || phase === 'active')) {
            if (a.kind === 'boss') {
                const bossReach = spec.reach + player.r;
                if (dist <= bossReach + S.THREAT_MARGIN) {
                    if (this.willDodge && phase === 'windup' && spec.windup - a.t <= S.ROLL_LEAD) intent.roll = true;
                    return intent;
                }
                intent.move.y = 1; // hors de portée : il recule encore un peu
                return intent;
            }
            if (a.kind === 'charge') {
                const lineDist = Steering.distanceToSegment(player.pos, boss.pos, a.target);
                const inLine = lineDist <= boss.r + player.r + S.THREAT_MARGIN;
                if (inLine && this.willDodge) {
                    intent.move.x = S.sideAway(player, boss, a.target);
                    if (phase === 'active' && dist < S.CHARGE_ROLL_DISTANCE) intent.roll = true;
                }
                return intent;
            }
            if (a.kind === 'breath' && phase === 'windup') {
                const d = Math.hypot(a.target.x - player.pos.x, a.target.y - player.pos.y);
                if (d < Combat.BOSS.breath.radius + player.r + S.THREAT_MARGIN && this.willDodge) {
                    intent.move.x = S.sideAway(player, boss, a.target);
                    intent.move.y = 0.4;
                    return intent;
                }
            }
        }

        // 2. Fiole d'Estus, à l'abri seulement
        if (player.hp <= S.DRINK_HP && player.estus > 0) {
            const recoveringLong = a && phase === 'recovery' && Combat.duration(spec) - a.t >= S.DRINK_SAFE_RECOVERY;
            const far = !a && dist > S.DRINK_SAFE_DISTANCE;
            const sheltered = S.hidden(player, boss) && dist > S.COVER_DRINK_DISTANCE;
            if (recoveringLong || far || boss.wandering || sheltered) {
                intent.drink = true;
                return intent;
            }
            // Sinon il court s'abriter derrière un pilier, ou prend ses distances
            const cover = S.cover(player, boss);
            if (cover) {
                intent.target = cover.point;
                return intent;
            }
            intent.move.y = 1;
            intent.move.x = this.strafe * 0.5;
            return intent;
        }

        // 3. Repos, à l'abri si possible
        if (this.resting) {
            const cover = S.cover(player, boss);
            if (cover && !S.hidden(player, boss)) {
                intent.target = cover.point;
                return intent;
            }
            intent.move.y = dist < S.REST_DISTANCE ? 1 : 0;
            intent.move.x = this.strafe * 0.6;
            return intent;
        }

        // 4. Punition pendant la récupération du boss
        if (a && phase === 'recovery') {
            const remaining = Combat.duration(spec) - a.t;
            if (dist > myReach - 8) intent.move.y = -1;
            if (dist <= myReach && !boss.dodge) {
                // Il ne s'engage que si son attaque sera finie quand il devra rouler contre la suivante
                if (S.safeToCommit('heavy', remaining) && player.stamina >= 60) intent.heavy = true;
                else if (S.safeToCommit('light', remaining)) intent.light = true;
            }
            return intent;
        }

        // 5. Le coup de hallebarde est prêt : il attend sans s'engager (sans fuir le combat)
        if (boss.cooldown < S.DANGER_COOLDOWN && this.waited < S.PATIENCE) {
            this.waited += dt;
            if (dist > Combat.ATTACKS.boss.reach + player.r + S.SAFE_MARGIN) intent.move.y = -1;
            intent.move.x = this.strafe * 0.5;
            return intent;
        }

        // 6. Approche et attaques régulières
        if (dist > myReach - 8) intent.move.y = -1;
        else intent.move.x = this.strafe * 0.3;
        if (dist <= myReach && this.attackTimer <= 0 && !boss.dodge) {
            intent.light = true;
            this.attackTimer = this.attackInterval;
        }
        return intent;
    }
}

ScriptedPlayerController.ROLL_LEAD = 0.12;            // roule 0,12 s avant la frappe de hallebarde
ScriptedPlayerController.THREAT_MARGIN = 25;          // marge autour des zones dangereuses
ScriptedPlayerController.CHARGE_ROLL_DISTANCE = 90;   // roule si le boss en ruée arrive à cette distance
ScriptedPlayerController.DANGER_COOLDOWN = 0.4;       // attente du boss sous laquelle il ne s'approche plus
ScriptedPlayerController.PATIENCE = 1.5;              // secondes d'attente avant de s'engager quand même
ScriptedPlayerController.SAFE_MARGIN = 35;            // au-delà de portée + marge, il se rapproche
ScriptedPlayerController.DRINK_HP = 45;               // il boit sous cette vie...
ScriptedPlayerController.DRINK_SAFE_DISTANCE = 220;   // ... si le boss est au moins à cette distance
ScriptedPlayerController.DRINK_SAFE_RECOVERY = 0.7;   // ... ou s'il lui reste au moins 0,7 s de récupération
ScriptedPlayerController.REST_LOW = 25;
ScriptedPlayerController.REST_HIGH = 75;
ScriptedPlayerController.REST_DISTANCE = 260;
ScriptedPlayerController.COVER_MAX = 260;             // il ne va pas chercher un abri plus loin
ScriptedPlayerController.COVER_DRINK_DISTANCE = 110;  // caché, il boit si le boss est au moins à cette distance
