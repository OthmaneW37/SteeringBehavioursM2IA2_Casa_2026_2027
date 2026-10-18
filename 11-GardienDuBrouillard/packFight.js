// Niveau 1 : le chevalier contre la meute des Creux, à pas fixe (Combat.DT). Aucun dessin ici : le même
// code sert au jeu, à l'entraînement et à la comparaison (comme Fight pour le boss).
//
// Un pas :
//   1. perception : chaque Creux repère ses voisins (rayon de perception) ;
//   2. sélection de l'action : intention du joueur, décision de chaque Creux (contrôleur de la meute) ;
//   3. steering : chaque entité applique ses forces ;
//   4. locomotion : update() hérité de Vehicle, puis murs, piliers et corps qui se chevauchent ;
//   5. résolution des coups : un coup du chevalier touche TOUS les Creux de son cône (une fois chacun),
//      une morsure touche le chevalier ; un pilier entre les deux pare le coup ;
//   6. minuteries, mesure de l'encerclement, fin du combat.
//
// ENCERCLEMENT. À chaque pas, on regarde les Creux vivants à moins de ENCIRCLE_RADIUS px du chevalier et le
// plus grand écart d'angle entre eux, vus depuis le chevalier. Le chevalier est ENCERCLÉ quand au moins
// trois Creux sont proches et qu'aucun écart n'atteint 180° : il est à l'intérieur du polygone qu'ils
// forment, il n'a plus de sortie libre. Le résultat donne la part du combat passée encerclé.
class PackFight {
    /**
     * options : { arena, playerController, packController, size (Creux), perception (px), maxTime (s),
     *             seed, estus, pillars (nombre), playerHp (vie de départ, reportée par la campagne) }
     */
    constructor(options) {
        this.arena = options.arena;
        this.playerController = options.playerController;
        this.packController = options.packController;
        this.maxTime = options.maxTime || 60;
        if (options.seed !== undefined && typeof randomSeed === 'function') randomSeed(options.seed);
        this.player = new Player(this.arena.playerStart.x, this.arena.playerStart.y);
        if (options.estus !== undefined) this.player.estus = options.estus;
        if (options.playerHp !== undefined) this.player.hp = Math.max(1, Math.min(this.player.maxHp, options.playerHp));
        this.pillars = (this.arena.pillarSlots || []).slice(0, options.pillars || 0).map(p => new Pillar(p.x, p.y));
        this.player.pillars = this.pillars;
        this.player.zones = [];
        this.creux = PackFight.spawn(this.arena, options.size || PackFight.SIZE).map(p => {
            const c = new Creux(p.x, p.y);
            c.pillars = this.pillars;
            if (options.perception) c.perception = options.perception;
            return c;
        });
        this.focus = null;
        this.time = 0;
        this.result = null;
        this.events = [];
        this.damageToPlayer = 0;
        this.damageToPack = 0;
        this.surroundTime = 0;
        this.coverageSum = 0;      // couverture × temps, quand au moins deux Creux sont proches
        this.coverageTime = 0;
        this.lastCause = null;
    }

    /** Positions de départ : un arc autour du point de départ du boss, face au chevalier. */
    static spawn(arena, n) {
        const c = arena.bossStart, out = [];
        for (let k = 0; k < n; k++) {
            const a = Math.PI * 0.5 + (Math.PI * (k + 0.5)) / n;   // de 90° à 270° : côté opposé au chevalier exclu
            out.push({ x: c.x + Math.cos(a) * PackFight.SPAWN_RADIUS, y: c.y - Math.sin(a) * PackFight.SPAWN_RADIUS });
        }
        return out;
    }

    get over() {
        return this.result !== null;
    }

    get alivePack() {
        return this.creux.filter(c => c.alive);
    }

    /**
     * Encerclement du point `center` par les agents `pack` (vivants, à moins de `radius` px) :
     * { count, gap (plus grand écart d'angle, radians), coverage (0 à 1), surrounded }.
     * coverage = (2π − gap) / (2π − 2π / count) : 1 quand les agents sont répartis régulièrement.
     */
    static encirclement(center, pack, radius = PackFight.ENCIRCLE_RADIUS) {
        const angles = [];
        for (const c of pack) {
            if (c.alive === false) continue;
            const dx = c.pos.x - center.x, dy = c.pos.y - center.y;
            if (Math.hypot(dx, dy) <= radius) angles.push(Math.atan2(dy, dx));
        }
        const count = angles.length;
        if (count < 2) return { count: count, gap: 2 * Math.PI, coverage: 0, surrounded: false };
        angles.sort((a, b) => a - b);
        let gap = angles[0] + 2 * Math.PI - angles[count - 1];
        for (let i = 1; i < count; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);
        const coverage = Math.max(0, Math.min(1, (2 * Math.PI - gap) / (2 * Math.PI - 2 * Math.PI / count)));
        return { count: count, gap: gap, coverage: coverage, surrounded: count >= 3 && gap < Math.PI };
    }

    step(dt = Combat.DT) {
        if (this.result) return;
        const { player, arena, creux } = this;
        this.events = [];

        for (const c of creux) c.perceive(creux);
        const intent = this.playerController.intent(player, creux, arena, dt);
        const focus = (intent.focus && intent.focus.alive) ? intent.focus : PackPlayerController.nearest(player, creux);
        this.focus = focus;
        for (const c of creux) {
            const decision = c.alive ? this.packController.decide(c, player, arena) : null;
            c.control(decision || PackFight.IDLE, player, arena);
        }
        if (focus) player.control(intent, focus, arena);
        else player.applyForce(player.arrive(player.pos));

        player.update();
        for (const c of creux) c.update();
        this.resolveBodies();

        this.resolvePlayerHit();
        for (const c of creux) this.resolveBite(c);

        player.tick(dt);
        for (const c of creux) c.tick(dt);
        this.measure(dt);
        this.time += dt;

        if (!player.alive) this.finish('pack');
        else if (this.alivePack.length === 0) this.finish('player');
        else if (this.time >= this.maxTime) this.finish('draw');
    }

    /** Murs, piliers et corps qui se chevauchent (les Creux morts ne gênent plus). */
    resolveBodies() {
        const { player, arena, creux, pillars } = this;
        const bodies = [player].concat(creux.filter(c => c.alive));
        for (const b of bodies) arena.constrain(b);
        for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) Fight.separateBodies(bodies[i], bodies[j]);
        }
        for (const p of pillars) for (const b of bodies) p.pushOut(b);
        for (const b of bodies) arena.constrain(b);
    }

    /** Coup du chevalier : chaque Creux de son cône est touché une fois, sauf si un pilier pare. */
    resolvePlayerHit() {
        const { player } = this;
        const a = player.action;
        if (!a || Combat.phase(a.spec, a.t) !== 'active') return;
        if (!a.hitSet) a.hitSet = new Set();
        for (const c of this.creux) {
            if (!c.alive || a.hitSet.has(c)) continue;
            if (!Combat.inArc(player.pos, a.facing, c, a.spec.reach, a.spec.arc)) continue;
            a.hitSet.add(c);
            const wall = Combat.blocker(player.pos, c.pos, this.pillars);
            if (wall) {
                this.events.push({ type: 'blocked', who: 'player', x: wall.pos.x, y: wall.pos.y });
                continue;
            }
            const critical = !!(c.stun && c.stun.riposte);
            const damage = Combat.damageAgainst(a.spec, c);
            c.receiveHit(damage);
            if (critical) {
                c.stun.riposte = false;
                player.stats.criticals++;
            }
            a.hasHit = true;
            player.stats.hits++;
            player.stats.damageDealt += damage;
            this.damageToPack += damage;
            this.events.push({ type: 'hit', who: 'player', kind: a.kind, damage: damage, critical: critical, x: c.pos.x, y: c.pos.y });
            if (!c.alive) this.events.push({ type: 'creuxDeath', x: c.pos.x, y: c.pos.y });
        }
    }

    /** Morsure d'un Creux : une fois au plus, pendant sa fenêtre de frappe. */
    resolveBite(c) {
        const a = c.action;
        const { player } = this;
        if (!c.alive || !a || a.hasHit || a.blocked || Combat.phase(a.spec, a.t) !== 'active') return;
        if (!Combat.inArc(c.pos, a.facing, player, a.spec.reach, a.spec.arc)) return;
        const wall = Combat.blocker(c.pos, player.pos, this.pillars);
        if (wall) {
            a.blocked = true;
            this.events.push({ type: 'blocked', who: 'creux', x: wall.pos.x, y: wall.pos.y });
            return;
        }
        if (Combat.parries(player, c, a)) {
            a.blocked = true;
            c.parried();
            player.stats.parries++;
            this.events.push({ type: 'parry', who: 'creux', x: (c.pos.x + player.pos.x) / 2, y: (c.pos.y + player.pos.y) / 2 });
            return;
        }
        if (!player.receiveHit(a.spec.damage)) {
            a.blocked = true;   // roulade : la morsure passe à travers, elle est perdue
            this.events.push({ type: 'dodged', who: 'creux', x: player.pos.x, y: player.pos.y });
            return;
        }
        a.hasHit = true;
        c.stats.hits++;
        c.stats.damageDealt += a.spec.damage;
        this.damageToPlayer += a.spec.damage;
        this.lastCause = 'morsure';
        this.events.push({ type: 'hit', who: 'boss', kind: 'bite', damage: a.spec.damage, x: player.pos.x, y: player.pos.y });
    }

    /** Mesure de l'encerclement pendant `dt` secondes. */
    measure(dt) {
        const e = PackFight.encirclement(this.player.pos, this.creux);
        this.lastEncirclement = e;
        if (e.count >= 2) {
            this.coverageSum += e.coverage * dt;
            this.coverageTime += dt;
        }
        if (e.surrounded) this.surroundTime += dt;
    }

    finish(winner) {
        const pack = this.creux;
        const sum = k => pack.reduce((s, c) => s + c.stats[k], 0);
        this.result = {
            winner: winner,
            duration: this.time,
            damageToPlayer: this.damageToPlayer,
            damageToPack: this.damageToPack,
            packSize: pack.length,
            killed: pack.filter(c => !c.alive).length,
            bites: sum('bites'),
            biteHits: sum('hits'),
            biteWhiffs: sum('whiffs'),
            surrounded: this.time > 0 ? this.surroundTime / this.time : 0,
            coverage: this.coverageTime > 0 ? this.coverageSum / this.coverageTime : 0,
            drinks: this.player.stats.drinks,
            cause: this.lastCause,
            playerMaxHp: this.player.maxHp
        };
    }

    /** Combat complet sans rendu (entraînement, comparaison). */
    run() {
        while (!this.result) this.step();
        return this.result;
    }
}

PackFight.SIZE = 5;               // Creux par défaut (curseur « Taille de la meute »)
PackFight.SPAWN_RADIUS = 90;
PackFight.ENCIRCLE_RADIUS = 110;  // un Creux à moins de 110 px compte pour l'encerclement
PackFight.IDLE = { pursue: 0, flank: 0, evade: 0, flock: 0, bite: false };
