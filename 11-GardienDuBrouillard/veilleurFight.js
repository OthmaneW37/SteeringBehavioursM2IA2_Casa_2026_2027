// Niveau 2 : le chevalier contre le Veilleur des cendres et ses feux follets, à pas fixe (Combat.DT). Aucun
// dessin ici (comme Fight et PackFight).
//
// Un pas : décisions (joueur, Veilleur) → forces (chevalier, Veilleur, feux follets) → locomotion (update()
// hérité de Vehicle, murs, piliers, corps) → coups (l'épée touche le Veilleur et dissipe les feux follets de son
// cône ; un feu follet qui touche le chevalier explose, sauf pendant l'invulnérabilité de la roulade) → nouveaux
// feux follets demandés par l'incantation → minuteries → fin.
class VeilleurFight {
    /** options : { arena, playerController, controller, maxTime (s), seed, estus, pillars, playerHp, veilleurHp } */
    constructor(options) {
        this.arena = options.arena;
        this.playerController = options.playerController;
        this.controller = options.controller || new VeilleurController();
        this.maxTime = options.maxTime || 90;
        if (options.seed !== undefined && typeof randomSeed === 'function') randomSeed(options.seed);
        this.player = new Player(this.arena.playerStart.x, this.arena.playerStart.y);
        if (options.estus !== undefined) this.player.estus = options.estus;
        if (options.playerHp !== undefined) this.player.hp = Math.max(1, Math.min(this.player.maxHp, options.playerHp));
        this.pillars = (this.arena.pillarSlots || []).slice(0, options.pillars || 0).map(p => new Pillar(p.x, p.y));
        this.player.pillars = this.pillars;
        this.player.zones = [];
        this.veilleur = new Veilleur(this.arena.bossStart.x, this.arena.bossStart.y);
        if (options.veilleurHp) {
            this.veilleur.maxHp = options.veilleurHp;
            this.veilleur.hp = options.veilleurHp;
        }
        this.veilleur.pillars = this.pillars;
        this.wisps = [];
        this.focus = this.veilleur;
        this.time = 0;
        this.result = null;
        this.events = [];
        this.damageToPlayer = 0;
        this.damageToBoss = 0;
        this.wispsSpawned = 0;
        this.lastCause = null;
    }

    get over() {
        return this.result !== null;
    }

    step(dt = Combat.DT) {
        if (this.result) return;
        const { player, veilleur, arena, wisps } = this;
        this.events = [];
        const intent = this.playerController.intent(player, veilleur, arena, dt, wisps);
        this.focus = intent.focus && intent.focus.alive ? intent.focus : veilleur;
        veilleur.control(this.controller.decide(veilleur, player, wisps, dt), player, arena);
        for (const w of wisps) w.control(player, wisps, arena);
        player.control(intent, this.focus, arena);

        player.update();
        veilleur.update();
        for (const w of wisps) w.update();
        this.resolveBodies();
        this.resolvePlayerHit();
        this.resolveWisps();
        this.spawnWisps();

        player.tick(dt);
        veilleur.tick(dt);
        for (const w of wisps) w.tick(dt);
        for (let i = wisps.length - 1; i >= 0; i--) if (!wisps[i].alive) wisps.splice(i, 1);
        this.time += dt;
        if (!player.alive) this.finish('veilleur');
        else if (!veilleur.alive) this.finish('player');
        else if (this.time >= this.maxTime) this.finish('draw');
    }

    resolveBodies() {
        const { player, veilleur, arena, pillars, wisps } = this;
        for (const b of [player, veilleur].concat(wisps)) arena.constrain(b);
        if (veilleur.alive) Fight.separateBodies(player, veilleur);
        for (const p of pillars) {
            p.pushOut(player);
            p.pushOut(veilleur);
            for (const w of wisps) p.pushOut(w);
        }
        for (const b of [player, veilleur]) arena.constrain(b);
    }

    /** L'épée touche le Veilleur (sauf pilier entre eux) et dissipe chaque feu follet de son cône, une fois. */
    resolvePlayerHit() {
        const { player, veilleur } = this;
        const a = player.action;
        if (!a || a.kind === 'parry' || Combat.phase(a.spec, a.t) !== 'active') return;
        if (!a.hitSet) a.hitSet = new Set();
        for (const w of this.wisps) {
            if (!w.alive || a.hitSet.has(w) || !Combat.inArc(player.pos, a.facing, w, a.spec.reach, a.spec.arc)) continue;
            a.hitSet.add(w);
            w.burst();
            this.events.push({ type: 'wispBurst', x: w.pos.x, y: w.pos.y, by: 'player' });
        }
        if (!veilleur.alive || a.hitSet.has(veilleur) || !Combat.inArc(player.pos, a.facing, veilleur, a.spec.reach, a.spec.arc)) return;
        a.hitSet.add(veilleur);
        const wall = Combat.blocker(player.pos, veilleur.pos, this.pillars);
        if (wall) {
            this.events.push({ type: 'blocked', who: 'player', x: wall.pos.x, y: wall.pos.y });
            return;
        }
        if (!veilleur.receiveHit(a.spec.damage)) {
            this.events.push({ type: 'dodged', who: 'player', x: veilleur.pos.x, y: veilleur.pos.y });
            return;
        }
        a.hasHit = true;
        player.stats.hits++;
        player.stats.damageDealt += a.spec.damage;
        this.damageToBoss += a.spec.damage;
        this.events.push({ type: 'hit', who: 'player', kind: a.kind, damage: a.spec.damage, x: veilleur.pos.x, y: veilleur.pos.y });
    }

    /** Un feu follet au contact du chevalier explose : dégâts, sauf pendant l'invulnérabilité de la roulade. */
    resolveWisps() {
        const p = this.player;
        for (const w of this.wisps) {
            if (!w.alive || Math.hypot(w.pos.x - p.pos.x, w.pos.y - p.pos.y) > w.r + p.r) continue;
            if (p.invulnerable) continue;   // la roulade passe à travers ; le feu follet continue
            w.burst();
            if (p.receiveHit(Wisp.DAMAGE)) {
                this.damageToPlayer += Wisp.DAMAGE;
                this.veilleur.stats.damageDealt += Wisp.DAMAGE;
                this.lastCause = 'feu follet';
                this.events.push({ type: 'hit', who: 'boss', kind: 'wisp', damage: Wisp.DAMAGE, x: p.pos.x, y: p.pos.y });
            }
            this.events.push({ type: 'wispBurst', x: w.pos.x, y: w.pos.y, by: 'contact' });
        }
    }

    /** Feux follets demandés par l'incantation, devant le Veilleur, dans la limite du plafond. */
    spawnWisps() {
        const v = this.veilleur;
        while (v.pendingWisps > 0) {
            v.pendingWisps--;
            if (this.wisps.filter(w => w.alive).length >= Veilleur.MAX_WISPS) continue;
            const spread = (this.wispsSpawned % 2 === 0 ? 1 : -1) * 0.6;
            const a = v.facing + spread;
            this.wisps.push(new Wisp(v.pos.x + Math.cos(a) * (v.r + 10), v.pos.y + Math.sin(a) * (v.r + 10), a));
            this.wispsSpawned++;
            this.events.push({ type: 'wispCast', x: v.pos.x, y: v.pos.y });
        }
    }

    finish(winner) {
        this.result = { winner: winner, duration: this.time, damageToPlayer: this.damageToPlayer, damageToBoss: this.damageToBoss,
            wispsSpawned: this.wispsSpawned, casts: this.veilleur.stats.casts, blinks: this.veilleur.stats.blinks,
            cause: this.lastCause, playerMaxHp: this.player.maxHp };
    }

    run() {
        while (!this.result) this.step();
        return this.result;
    }
}
