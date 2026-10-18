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
//
// Il crée aussi les piliers (Pillar) aux premiers emplacements de l'arène : les corps ne les traversent
// pas, un pilier entre l'attaquant et sa cible bloque le coup, et une ruée qui en percute un étourdit
// le boss et fissure le pilier.
//
// Anti-camping (Combat.BOSS.camping) : un boss qui reste trop longtemps dans un coin de l'arène est
// dévoré par le brouillard et meurt. La défaite compte toute sa vie restante comme dégâts reçus : la note
// de l'entraînement le punit fortement, il apprend à ne pas se terrer dans les coins.
class Fight {
    /**
     * options : { arena, playerController, bossController, maxTime (s), seed, estus (fioles du joueur),
     *             pillars (nombre de piliers, 0 par défaut), antiCamping (true par défaut),
     *             playerHp (vie de départ du chevalier, reportée par la campagne),
     *             bossHp (vie maximale du boss : la campagne lui en donne plus ; ses entrées sont en proportion) }
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
        if (options.bossHp) {
            this.boss.maxHp = options.bossHp;
            this.boss.hp = options.bossHp;
        }
        if (options.estus !== undefined) this.player.estus = options.estus;
        if (options.playerHp !== undefined) this.player.hp = Math.max(1, Math.min(this.player.maxHp, options.playerHp));
        this.zones = [];                 // nappes de brume en jeu
        this.player.zones = this.zones;  // le joueur robot les évite
        this.pillars = (this.arena.pillarSlots || []).slice(0, options.pillars || 0).map(p => new Pillar(p.x, p.y));
        this.player.pillars = this.pillars;
        this.boss.pillars = this.pillars;
        this.mistDamage = 0;
        this.antiCamping = options.antiCamping !== false;
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
        this.resolvePillars();
        arena.constrain(player);
        arena.constrain(boss);
        Fight.separateBodies(player, boss);
        for (const p of this.pillars) { p.pushOut(player); p.pushOut(boss); }
        arena.constrain(player);
        arena.constrain(boss);

        this.resolveHit(player, boss, 'player');
        this.resolveHit(boss, player, 'boss');
        this.updateZones(dt);

        player.tick(dt);
        boss.tick(dt);
        for (const p of this.pillars) p.tick(dt);
        this.updateCamping(dt);
        this.time += dt;

        if (!player.alive) this.finish('boss');
        else if (!boss.alive) this.finish('player');
        else if (this.time >= this.maxTime) this.finish('draw');
    }

    /** Anti-camping : compteur du coin, et mort du boss quand il atteint la limite. */
    updateCamping(dt) {
        const { boss, arena } = this;
        if (!this.antiCamping || !boss.alive) return;
        const C = Combat.BOSS.camping;
        if (arena.inCorner(boss.pos, boss.r, C.margin)) boss.campTime += dt;
        else boss.campTime = Math.max(0, boss.campTime - C.recover * dt);
        if (boss.campTime >= C.limit) {
            this.damageToBoss += boss.hp;
            boss.hp = 0;
            boss.stats.camped = true;
            this.events.push({ type: 'camping', x: boss.pos.x, y: boss.pos.y });
        }
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

    /**
     * Piliers : une ruée en pleine charge qui touche un pilier s'y écrase (boss étourdi, pilier fissuré) ;
     * puis chaque corps est repoussé hors des piliers.
     */
    resolvePillars() {
        const { player, boss } = this;
        for (const p of this.pillars) {
            if (!p.alive) continue;
            const a = boss.action;
            const touching = Math.hypot(boss.pos.x - p.pos.x, boss.pos.y - p.pos.y) < p.radius + boss.r + 1;
            if (touching && a && a.kind === 'charge' && Combat.phase(a.spec, a.t) === 'active') {
                const fell = p.crack();
                boss.crash();
                this.events.push({ type: fell ? 'crumble' : 'crash', x: p.pos.x, y: p.pos.y });
            }
            p.pushOut(player);
            p.pushOut(boss);
        }
    }

    /**
     * Un coup touche au plus une fois, pendant la fenêtre de frappe, si la cible est dans le cône
     * et qu'aucun pilier ne s'interpose (le pilier pare le coup, une seule fois par attaque).
     */
    resolveHit(attacker, target, who) {
        const a = attacker.action;
        if (!a || a.hasHit || a.blocked || a.spec.damage <= 0 || Combat.phase(a.spec, a.t) !== 'active') return;
        if (!Combat.inArc(attacker.pos, a.facing, target, a.spec.reach, a.spec.arc)) return;
        const wall = Combat.blocker(attacker.pos, target.pos, this.pillars);
        if (wall) {
            a.blocked = true;
            this.events.push({ type: 'blocked', who: who, x: wall.pos.x, y: wall.pos.y });
            return;
        }
        // Parade : le coup s'arrête sur le bouclier, l'attaquant est déséquilibré
        if (Combat.parries(target, attacker, a)) {
            a.blocked = true;
            attacker.parried();
            target.stats.parries++;
            this.events.push({ type: 'parry', who: who, x: (attacker.pos.x + target.pos.x) / 2, y: (attacker.pos.y + target.pos.y) / 2 });
            return;
        }
        const critical = !!(target.stun && target.stun.riposte);
        const damage = Combat.damageAgainst(a.spec, target);
        if (!target.receiveHit(damage)) {
            this.events.push({ type: 'dodged', who: who, x: target.pos.x, y: target.pos.y });
            return;
        }
        a.hasHit = true;
        attacker.stats.hits++;
        attacker.stats.damageDealt += damage;
        if (a.riposte) attacker.stats.riposteHits++;
        if (critical) {
            target.stun.riposte = false;   // une seule riposte critique par parade
            attacker.stats.criticals = (attacker.stats.criticals || 0) + 1;
        }
        if (who === 'boss') {
            this.damageToPlayer += damage;
            this.lastCause = a.kind === 'charge' ? 'ruée' : 'hallebarde';
        } else {
            this.damageToBoss += damage;
        }
        this.events.push({ type: 'hit', who: who, kind: a.kind, damage: damage, critical: critical, x: target.pos.x, y: target.pos.y });
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
            bossDodges: this.boss.stats.dodges,
            bossRipostes: this.boss.stats.ripostes,
            bossRiposteHits: this.boss.stats.riposteHits,
            bossCrashes: this.boss.stats.crashes,
            bossIdle: this.boss.stats.idleTime,
            bossCamped: this.boss.stats.camped,
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
