// Un combat : chevalier contre boss dans l'arène, à pas fixe (Combat.DT). Aucun dessin ici :
// le même code sert au jeu (rendu à chaque image), à l'entraînement et à la comparaison (sans rendu).
//
// Un pas :
//   1. sélection de l'action : intention du joueur, décision du boss (contrôleurs) ;
//   2. steering : chaque entité applique ses forces (control) ;
//   3. locomotion : update() hérité de Vehicle, puis mur physique de l'arène ;
//   4. résolution : corps qui se chevauchent écartés, coups dans la fenêtre de frappe,
//      brûlure des nappes de brume, création des nappes demandées par le souffle du boss ;
//   5. minuteries (secondes) et fin du combat.
//
// Le combat gère les nappes de brume (MistPatch) : au plus Combat.BOSS.breath.maxZones, la plus ancienne
// disparaît quand une nouvelle arrive. Il retient aussi la cause de la dernière blessure du joueur.
class Fight {
    /**
     * options : { arena, playerController, bossController, maxTime (s), seed, estus (fioles du joueur) }
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
        if (options.estus !== undefined) this.player.estus = options.estus;
        this.zones = [];                 // nappes de brume en jeu
        this.player.zones = this.zones;  // le joueur robot les évite
        this.mistDamage = 0;
        this.lastCause = null;           // 'hallebarde', 'ruée' ou 'brume'
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

        player.inMist = this.zones.some(z => z.contains(player));
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
        this.updateZones(dt);

        player.tick(dt);
        boss.tick(dt);
        this.time += dt;

        if (!player.alive) this.finish('boss');
        else if (!boss.alive) this.finish('player');
        else if (this.time >= this.maxTime) this.finish('draw');
    }

    /** Nappes de brume : brûlure du joueur qui s'y trouve, création, vieillissement, plafond. */
    updateZones(dt) {
        const { player, boss } = this;
        const B = Combat.BOSS.breath;
        if (player.alive && this.zones.some(z => z.contains(player))) {
            const d = player.burn(B.dps * dt);
            this.damageToPlayer += d;
            this.mistDamage += d;
            boss.stats.damageDealt += d;
            this.lastCause = 'brume';
        }
        if (boss.pendingZone) {
            this.zones.push(new MistPatch(boss.pendingZone.x, boss.pendingZone.y, B.radius, B.lifetime));
            if (this.zones.length > B.maxZones) this.zones.shift();
            this.events.push({ type: 'mist', x: boss.pendingZone.x, y: boss.pendingZone.y });
            boss.pendingZone = null;
        }
        for (const z of this.zones) z.tick(dt);
        // On garde le même tableau (le joueur en a la référence)
        for (let i = this.zones.length - 1; i >= 0; i--) if (!this.zones[i].alive) this.zones.splice(i, 1);
    }

    /** Un coup touche au plus une fois, pendant la fenêtre de frappe, si la cible est dans le cône. */
    resolveHit(attacker, target, who) {
        const a = attacker.action;
        if (!a || a.hasHit || a.spec.damage <= 0 || Combat.phase(a.spec, a.t) !== 'active') return;
        if (!Combat.inArc(attacker.pos, a.facing, target, a.spec.reach, a.spec.arc)) return;
        if (!target.receiveHit(a.spec.damage)) {
            this.events.push({ type: 'dodged', who: who, x: target.pos.x, y: target.pos.y });
            return;
        }
        a.hasHit = true;
        attacker.stats.hits++;
        attacker.stats.damageDealt += a.spec.damage;
        if (who === 'boss') {
            this.damageToPlayer += a.spec.damage;
            this.lastCause = a.kind === 'charge' ? 'ruée' : 'hallebarde';
        } else {
            this.damageToBoss += a.spec.damage;
        }
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
            bossCharges: this.boss.stats.charges,
            bossBreaths: this.boss.stats.breaths,
            mistDamage: this.mistDamage,
            drinks: this.player.stats.drinks,
            drinksInterrupted: this.player.stats.drinksInterrupted,
            cause: this.lastCause,
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
