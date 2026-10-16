// Particules d'effet (rendu seulement) : sang, étincelles, poussière, braises, volutes de brume. Ce ne sont
// pas des entités du monde simulé : elles ne touchent rien et n'agissent sur rien. Réserve plafonnée : au-delà
// du plafond, la plus ancienne particule est recyclée (pas d'accumulation sans fin). Aléatoire injecté.
//
// fromEvent(e) traduit un événement du combat (Fight.events) en gerbe de particules ; ambient(...) fait
// monter les braises du feu de camp. Coordonnées de l'arène, temps en secondes.
class Particles {
    constructor(cap = 320, rng = Math.random) {
        this.cap = cap;
        this.rng = rng;
        this.items = [];
        this.next = 0;            // prochaine case recyclée quand la réserve est pleine
        this.emberClock = 0;
    }

    setCap(cap) {
        this.cap = cap;
        if (this.items.length > cap) this.items.length = cap;
        this.next = 0;
    }

    /** Émet `n` particules du type `kind` en (x, y). Retourne le nombre émis. */
    emit(kind, x, y, n) {
        const K = Particles.KINDS[kind];
        if (!K) throw new RangeError("Particule inconnue : " + kind);
        if (this.cap <= 0) return 0;
        const r = this.rng;
        for (let i = 0; i < n; i++) {
            const a = K.angle !== undefined ? K.angle + (r() - 0.5) * K.spread : r() * Math.PI * 2;
            const sp = K.speed[0] + r() * (K.speed[1] - K.speed[0]);
            const p = {
                kind: kind, x: x + (r() - 0.5) * K.jitter, y: y + (r() - 0.5) * K.jitter,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                life: K.life[0] + r() * (K.life[1] - K.life[0]), age: 0,
                size: K.size[0] + r() * (K.size[1] - K.size[0])
            };
            if (this.items.length < this.cap) this.items.push(p);
            else {
                this.items[this.next] = p;
                this.next = (this.next + 1) % this.cap;
            }
        }
        return n;
    }

    /** Gerbe correspondant à un événement du combat. */
    fromEvent(e) {
        const R = Particles.REACTIONS[e.type];
        if (!R) return 0;
        const spec = typeof R === 'function' ? R(e) : R;
        if (!spec) return 0;
        return this.emit(spec.kind, e.x, e.y, spec.n);
    }

    /** Braises qui montent du feu de camp, à cadence fixe (EMBER_RATE par seconde). */
    ambient(campfire, dt) {
        this.emberClock += dt * Particles.EMBER_RATE;
        let n = 0;
        while (this.emberClock >= 1) {
            this.emberClock -= 1;
            n += this.emit('ember', campfire.x, campfire.y - 6, 1);
        }
        return n;
    }

    update(dt) {
        let w = 0;
        for (const p of this.items) {
            p.age += dt;
            if (p.age >= p.life) continue;
            const K = Particles.KINDS[p.kind];
            const drag = Math.exp(-K.drag * dt);
            p.vx *= drag;
            p.vy = p.vy * drag + K.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            this.items[w++] = p;
        }
        this.items.length = w;
        if (this.next >= Math.max(1, this.items.length)) this.next = 0;
    }

    draw(glow = true) {
        if (this.items.length === 0) return;
        push();
        noStroke();
        for (const p of this.items) {
            const K = Particles.KINDS[p.kind];
            const k = 1 - p.age / p.life;
            if (K.additive && glow) blendMode(ADD);
            fill(K.color[0], K.color[1], K.color[2], K.color[3] * k);
            circle(p.x, p.y, p.size * (K.grow ? 1 + (1 - k) * K.grow : 1));
            if (K.additive && glow) blendMode(BLEND);
        }
        pop();
    }
}

// Types de particules : vitesses en px/s, durées en s, angle et dispersion en radians (angle absent = toutes directions)
Particles.KINDS = {
    blood: { color: [150, 12, 10, 230], speed: [60, 190], life: [0.35, 0.8], size: [2.5, 5.5], drag: 4, gravity: 0, jitter: 6 },
    spark: { color: [255, 210, 140, 255], speed: [120, 320], life: [0.15, 0.4], size: [1.5, 3], drag: 6, gravity: 0, jitter: 4, additive: true },
    dust: { color: [150, 140, 125, 150], speed: [30, 140], life: [0.6, 1.4], size: [4, 10], drag: 3, gravity: 0, jitter: 18, grow: 1.5 },
    ember: { color: [255, 140, 40, 220], speed: [12, 40], life: [1.2, 2.6], size: [1.5, 3.2], drag: 0.6, gravity: -22, jitter: 14, angle: -Math.PI / 2, spread: 1.2, additive: true },
    wisp: { color: [130, 230, 190, 80], speed: [8, 40], life: [0.8, 1.8], size: [10, 22], drag: 1.5, gravity: -6, jitter: 30, grow: 1 },
    curse: { color: [170, 100, 255, 110], speed: [20, 90], life: [0.8, 1.8], size: [8, 18], drag: 1.2, gravity: -12, jitter: 20, grow: 1.2, additive: true }
};

// Événement du combat → gerbe
Particles.REACTIONS = {
    hit: e => (e.who === 'boss' ? { kind: 'blood', n: 22 } : { kind: 'spark', n: e.kind === 'heavy' ? 18 : 10 }),
    blocked: { kind: 'spark', n: 8 },
    dodged: { kind: 'dust', n: 5 },
    crash: { kind: 'dust', n: 22 },
    crumble: { kind: 'dust', n: 40 },
    mist: { kind: 'wisp', n: 10 },
    creuxDeath: { kind: 'curse', n: 16 },
    camping: { kind: 'curse', n: 30 }
};

Particles.EMBER_RATE = 9;   // braises par seconde au feu de camp
