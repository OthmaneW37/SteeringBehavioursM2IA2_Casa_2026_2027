// Un combat : chevalier contre boss dans l'arène, à pas fixe (Combat.DT). Aucun dessin ici :
// le même code sert au jeu (rendu à chaque image), à l'entraînement et à la comparaison (sans rendu).
//
// Un pas :
//   1. sélection de l'action : intention du joueur, décision du boss (contrôleurs) ;
//   2. steering : chaque entité applique ses forces (control) ;
//   3. locomotion : update() hérité de Vehicle, puis mur physique de l'arène ;
//   4. résolution : corps qui se chevauchent écartés, coups dans la fenêtre de frappe ;
//   5. minuteries (secondes) et fin du combat.
class Fight {
    /**
     * options : { arena, playerController, bossController, maxTime (s), seed }
     * seed fixe l'aléatoire de p5 (wander) pour un combat reproductible, quand randomSeed existe.
     */
    constructor(options) {
        this.arena = options.arena;
        this.playerController = options.playerController;
        this.bossController = options.bossController;
        this.maxTime = options.maxTime || 60;
        if (options.seed !== undefined && typeof randomSeed === 'function') randomSeed(options.seed);
        this.player = new Player(this.arena.playerStart.x, this.arena.playerStart.y);
        this.boss = new Boss(this.arena.bossStart.x, this.arena.bossStart.y);
        if (options.detectRadius) this.boss.detectRadius = options.detectRadius;
        this.time = 0;
        this.result = null;
        this.events = [];   // coups portés pendant le dernier pas (effets visuels, sons)
        this.damageToPlayer = 0;
        this.damageToBoss = 0;
    }

    get over() {
        return this.result !== null;
    }

    step(dt = Combat.DT) {
        if (this.result) return;
        const { player, boss, arena } = this;
        this.events = [];

        const intent = this.playerController.intent(player, boss, arena, dt);
        const decision = this.bossController.decide(boss, player, arena);
        player.control(intent, boss, arena);
        boss.control(decision, player, arena, dt);

        player.update();
        boss.update();
        arena.constrain(player);
        arena.constrain(boss);
        Fight.separateBodies(player, boss);
        arena.constrain(player);
        arena.constrain(boss);

        this.resolveHit(player, boss, 'player');
        this.resolveHit(boss, player, 'boss');

        player.tick(dt);
        boss.tick(dt);
        this.time += dt;

        if (!player.alive) this.finish('boss');
        else if (!boss.alive) this.finish('player');
        else if (this.time >= this.maxTime) this.finish('draw');
    }

    /** Un coup touche au plus une fois, pendant la fenêtre de frappe, si la cible est dans le cône. */
    resolveHit(attacker, target, who) {
        const a = attacker.action;
        if (!a || a.hasHit || Combat.phase(a.spec, a.t) !== 'active') return;
        if (!Combat.inArc(attacker.pos, a.facing, target, a.spec.reach, a.spec.arc)) return;
        if (!target.receiveHit(a.spec.damage)) {
            this.events.push({ type: 'dodged', who: who, x: target.pos.x, y: target.pos.y });
            return;
        }
        a.hasHit = true;
        attacker.stats.hits++;
        attacker.stats.damageDealt += a.spec.damage;
        if (who === 'boss') this.damageToPlayer += a.spec.damage;
        else this.damageToBoss += a.spec.damage;
        this.events.push({ type: 'hit', who: who, kind: a.kind, damage: a.spec.damage, x: target.pos.x, y: target.pos.y });
    }

    /** Deux corps ne se traversent pas : on les écarte chacun de la moitié du chevauchement. */
    static separateBodies(a, b) {
        const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
        const d = Math.hypot(dx, dy);
        const overlap = a.r + b.r - d;
        if (overlap <= 0) return;
        const nx = d > 1e-9 ? dx / d : 1, ny = d > 1e-9 ? dy / d : 0;
        a.pos.x -= nx * overlap / 2;
        a.pos.y -= ny * overlap / 2;
        b.pos.x += nx * overlap / 2;
        b.pos.y += ny * overlap / 2;
    }

    finish(winner) {
        this.result = {
            winner: winner,
            duration: this.time,
            damageToPlayer: this.damageToPlayer,
            damageToBoss: this.damageToBoss,
            bossAttacks: this.boss.stats.attacks,
            bossWhiffs: this.boss.stats.whiffs,
            bossHits: this.boss.stats.hits,
            playerMaxHp: this.player.maxHp,
            bossMaxHp: this.boss.maxHp
        };
    }

    /** Combat complet sans rendu (entraînement, comparaison). */
    run() {
        while (!this.result) this.step();
        return this.result;
    }
}
