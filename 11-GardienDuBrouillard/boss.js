// Le Gardien du Brouillard : sous-classe de Vehicle (vehicle.js, fourni et protégé).
//
// Le boss ne décide pas lui-même : un contrôleur (réseau de neurones ou machine à états) lui donne
// une décision { mode: 'approach' | 'retreat' | 'hold', speed: 0..1, strafe: −1..1, attack, dodge, charge,
// breath: bool, order: techniques voulues, de la plus voulue à la moins voulue }.
// Le boss la traduit en forces, additionnées (composition de Reynolds) :
//   approche → `arrive` vers un point à distance d'attaque (il ralentit au lieu de foncer dessus) ;
//   recul    → `flee` (Reynolds, steering.js) ;
//   latéral  → `seek` vers un point en avance sur le cercle centré sur le joueur (Steering.orbitPoint) :
//              il tourne autour du joueur, du côté et avec le poids donnés par `strafe`.
//              Si `strafe` est presque nul, il RÔDE : il tourne lentement et change de sens toutes les
//              3 s. Le boss ne reste donc jamais planté à regarder le joueur ;
//   esquive  → `evade` (fuite de la position prédite du joueur) pendant 0,35 s, quand le joueur attaque.
//              Une esquive où il n'est pas touché rend sa hallebarde prête aussitôt : c'est la RIPOSTE ;
//   joueur hors du rayon de détection → `wander`, sans décision du contrôleur ;
//   toujours → évitement des piliers (`avoidZones`) et confinement `stayInside` près des murs.
// Une ruée qui percute un pilier l'étourdit 1,6 s (il ne peut rien faire, il est à la merci du joueur).
// `campTime` : temps passé dans un coin (règle anti-camping, appliquée par le combat).
//
// Trois techniques, chacune avec sa propre attente (cooldown) :
//   hallebarde : 0,6 s de préparation visible (cône rouge), 0,15 s de frappe, 1 s de récupération ;
//   ruée       : vise la position PRÉDITE du joueur (comme pursue), ligne rouge pendant 0,5 s, visée figée
//                0,15 s avant la fin, puis charge en ligne droite (seek d'un point au bout de la ligne) ;
//   souffle    : vise où le joueur sera dans 0,5 s ; une nappe de brume y apparaît (fight.js la crée).
// Si plusieurs techniques sont voulues, le boss prend la plus voulue qui est prête.
// Phase enragée (vie ≤ 30 %) : vitesse × 1,35 et attentes × 0,55 (un seul réseau).
class Boss extends Vehicle {
    constructor(x, y) {
        super(x, y, null);
        const B = Combat.BOSS;
        this.r = B.r;
        this.baseSpeed = B.maxSpeed;
        this.baseForce = B.maxForce;
        this.maxSpeed = B.maxSpeed;
        this.maxForce = B.maxForce;
        this.vel.set(0, 0);
        this.maxHp = B.maxHp;
        this.hp = B.maxHp;
        this.detectRadius = B.detectRadius;

        // Errance (wander de vehicle.js) : cercle plus proche, adapté à l'arène
        this.distanceCercle = 80;
        this.wanderRadius = 40;
        this.displaceRange = 0.3;

        this.cooldown = 0;        // secondes avant le prochain coup de hallebarde possible
        this.chargeCooldown = 0;  // secondes avant la prochaine ruée
        this.breathCooldown = 0;  // secondes avant le prochain souffle
        this.dodgeCooldown = 0;
        this.pendingZone = null;  // nappe de brume à créer (lue et vidée par le combat)
        this.action = null;       // attaque en cours
        this.dodge = null;        // esquive en cours : { t, hit }
        this.stun = null;         // étourdi après une ruée contre un pilier : { t }
        this.prowlSide = 1;       // sens dans lequel il rôde (+1 ou −1)
        this.pillars = null;      // piliers du combat (évitement, rayons du réseau)
        this.riposteTime = -1;    // instant de la dernière riposte (effet visuel, riposte qui touche)
        this.campTime = 0;        // compteur du coin (anti-camping, voir fight.js)
        this.facing = Math.PI;
        this.wandering = false;
        this.hurtTimer = 0;
        this.rageTime = -1;       // instant (s) du passage en phase enragée, pour l'effet visuel
        this.time = 0;
        // idleTime : secondes passées immobile alors qu'il décide (joueur dans son rayon) et qu'il est libre
        this.stats = { attacks: 0, hits: 0, whiffs: 0, damageDealt: 0, dodges: 0, ripostes: 0, riposteHits: 0, charges: 0, breaths: 0, crashes: 0, idleTime: 0, camped: false };
    }

    flee(target) {
        return Steering.flee(this, target);
    }

    evade(vehicle) {
        return Steering.evade(this, vehicle);
    }

    get alive() {
        return this.hp > 0;
    }

    /** Phase enragée : seuil inclusif (30 % de la vie maximale). */
    get enraged() {
        return this.hp <= this.maxHp * Combat.BOSS.rage.threshold;
    }

    speedMultiplier() {
        return this.enraged ? Combat.BOSS.rage.speedMul : 1;
    }

    attackCooldown() {
        return Combat.BOSS.cooldown * (this.enraged ? Combat.BOSS.rage.cooldownMul : 1);
    }

    /** Attente avant de pouvoir réutiliser une technique (enragé : plus courte). */
    techniqueCooldown(base) {
        return base * (this.enraged ? Combat.BOSS.rage.cooldownMul : 1);
    }

    /** La technique est-elle prête ? */
    ready(kind) {
        if (kind === 'attack') return this.cooldown <= 0;
        if (kind === 'charge') return this.chargeCooldown <= 0;
        if (kind === 'breath') return this.breathCooldown <= 0;
        return false;
    }

    /**
     * La hallebarde ne se lève que si le joueur est à portée (+ `swingMargin`) : le boss ne frappe pas
     * l'air depuis l'autre bout de l'arène (il resterait planté à enchaîner les coups). La ruée et le
     * souffle sont des techniques à distance : toujours possibles.
     */
    inRange(kind, dist, player) {
        if (kind !== 'attack') return true;
        return dist <= Combat.ATTACKS.boss.reach + player.r + Combat.BOSS.swingMargin;
    }

    isAttacking() {
        return this.action !== null;
    }

    canAct() {
        return this.alive && this.action === null && this.dodge === null && this.stun === null;
    }

    /** Peut-il esquiver maintenant ? Libre (ni technique, ni esquive, ni étourdi) et esquive prête. */
    canDodge() {
        return this.canAct() && this.dodgeCooldown <= 0;
    }

    /** Sens dans lequel il rôde en ce moment : prowlSide, inversé toutes les prowlSwitch secondes. */
    prowlSideNow() {
        return Math.floor(this.time / Combat.BOSS.prowlSwitch) % 2 === 0 ? this.prowlSide : -this.prowlSide;
    }

    startDodge() {
        const B = Combat.BOSS;
        this.dodge = { t: 0, hit: false };
        this.dodgeCooldown = B.dodge.cooldown;
        this.maxSpeed = B.dodge.maxSpeed * this.speedMultiplier();
        this.maxForce = B.dodge.maxForce;
        this.stats.dodges++;
    }

    /** Ruée écrasée contre un pilier : la charge s'arrête net, le boss est étourdi. */
    crash() {
        this.action = null;
        this.stun = { t: 0 };
        this.vel.set(0, 0);
        this.maxSpeed = this.baseSpeed;
        this.maxForce = this.baseForce;
        this.stats.crashes++;
    }

    /** Applique une décision du contrôleur (sélection de l'action → steering). */
    control(decision, player, arena, dt) {
        const B = Combat.BOSS;
        const toPlayer = Math.atan2(player.pos.y - this.pos.y, player.pos.x - this.pos.x);
        const dist = p5.Vector.dist(this.pos, player.pos);
        this.wandering = false;

        if (!this.alive || this.stun) {
            this.applyForce(this.arrive(this.pos));
            return;
        }

        // Esquive en priorité : le joueur prépare ou porte un coup
        if (decision.dodge && player.alive && player.isAttacking() && dist <= this.detectRadius && this.canDodge()) this.startDodge();

        let avoid = true;
        if (this.dodge) {
            this.applyForce(this.evade(player));
        } else if (this.action) {
            avoid = !(this.action.kind === 'charge' && Combat.phase(this.action.spec, this.action.t) === 'active');
            this.performAction(player, arena, dt, toPlayer);
        } else if (dist > this.detectRadius || !player.alive) {
            // Joueur hors de portée : errance, sans décision
            this.wandering = true;
            this.maxSpeed = this.baseSpeed * 0.6;
            this.applyForce(this.wander());
        } else {
            // Latéral : ordre du contrôleur, sinon il rôde (sens qui change toutes les prowlSwitch s)
            const strafe = decision.strafe || 0;
            let side, lateral;
            if (Math.abs(strafe) >= B.strafeDeadzone) {
                side = Math.sign(strafe);
                lateral = Math.min(1, Math.abs(strafe));
            } else {
                side = this.prowlSideNow();
                lateral = B.prowlSpeed;
            }
            const radial = decision.mode === 'hold' ? 0 : decision.speed;
            this.maxSpeed = this.baseSpeed * this.speedMultiplier() * (0.35 + 0.65 * Math.max(radial, lateral));
            this.maxForce = this.baseForce * this.speedMultiplier();
            if (decision.mode === 'approach') {
                // `arrive` vers un point en avance sur le cercle de garde : approche en spirale, puis il tourne
                this.applyForce(this.arrive(Steering.orbitPoint(this, player.pos, B.keepDistance, side, lateral * B.orbitLead)));
            } else {
                if (decision.mode === 'retreat') this.applyForce(this.flee(player.pos));
                // `seek` vers un point en avance sur le cercle où il se trouve : il tourne autour du joueur
                const radius = Math.max(dist, 1);
                this.applyForce(this.seek(Steering.orbitPoint(this, player.pos, radius, side, B.orbitLead)).mult(lateral));
            }
        }

        // Évitement des piliers (sauf en pleine ruée : il fonce droit, quitte à s'écraser)
        if (avoid && this.pillars) this.applyForce(Steering.avoidZones(this, this.pillars.filter(p => p.alive), 80, 10).mult(1.5));
        // Confinement : priorité forte près des murs
        this.applyForce(Steering.stayInside(this, arena, 70).mult(1.5));

        // Mesure : immobile alors qu'il décide (joueur dans son rayon) et qu'il est libre
        if (!this.wandering && !this.action && !this.dodge && player.alive && this.vel.mag() < Boss.IDLE_SPEED) this.stats.idleTime += dt;

        if (!this.action) {
            const target = this.wandering ? this.vel.heading() : toPlayer;
            this.facing = Combat.turnToward(this.facing, target, B.turnRate * dt);
        }

        if (!this.canAct() || !player.alive || this.wandering) return;
        const order = decision.order || ['attack', 'charge', 'breath'];
        const wanted = order.find(k => decision[k] && this.ready(k) && this.inRange(k, dist, player));
        if (wanted) this.startTechnique(wanted, player, arena);
    }

    /** Début d'une technique : son action, son attente, sa visée. */
    startTechnique(kind, player, arena) {
        const B = Combat.BOSS;
        if (kind === 'attack') {
            this.action = Combat.newAttack('boss', this.facing);
            // Coup levé juste après une riposte : s'il touche, c'est une riposte qui touche
            this.action.riposte = this.riposteTime >= 0 && this.time - this.riposteTime <= B.dodge.riposteWindow;
            this.cooldown = this.attackCooldown();
            this.stats.attacks++;
        } else if (kind === 'charge') {
            this.action = Combat.newAttack('charge', this.facing);
            this.action.target = this.aimCharge(player, arena);
            this.chargeCooldown = this.techniqueCooldown(B.charge.cooldown);
            this.stats.charges++;
        } else if (kind === 'breath') {
            this.action = Combat.newAttack('breath', this.facing);
            this.action.target = this.aimBreath(player, arena);
            this.breathCooldown = this.techniqueCooldown(B.breath.cooldown);
            this.stats.breaths++;
        }
    }

    /** Point d'arrivée de la ruée : dans la direction de la position prédite du joueur, à `length` px. */
    aimCharge(player, arena) {
        const C = Combat.BOSS.charge;
        const predicted = Steering.predict(player, C.predict);
        const dir = p5.Vector.sub(predicted, this.pos);
        if (dir.mag() === 0) dir.x = 1;
        dir.setMag(C.length);
        const end = arena.clampPoint({ x: this.pos.x + dir.x, y: this.pos.y + dir.y }, this.r);
        return createVector(end.x, end.y);
    }

    /** Centre de la nappe du souffle : là où le joueur sera dans `predict` s, à l'intérieur de l'arène. */
    aimBreath(player, arena) {
        const predicted = Steering.predict(player, Combat.BOSS.breath.predict);
        const c = arena.clampPoint(predicted, Combat.BOSS.breath.radius * 0.5);
        return createVector(c.x, c.y);
    }

    /** Forces et visée pendant une technique en cours. */
    performAction(player, arena, dt, toPlayer) {
        const B = Combat.BOSS;
        const a = this.action;
        const ph = Combat.phase(a.spec, a.t);
        if (a.kind === 'charge') {
            if (ph === 'windup') {
                // Il ajuste sa visée jusqu'à `lockBefore` s de la fin de la préparation, puis la fige
                if (a.t < a.spec.windup - B.charge.lockBefore) a.target = this.aimCharge(player, arena);
                this.applyForce(this.arrive(this.pos));
            } else if (ph === 'active') {
                this.maxSpeed = B.charge.maxSpeed * this.speedMultiplier();
                this.maxForce = B.charge.maxForce;
                this.applyForce(this.seek(a.target));
            } else {
                this.maxSpeed = this.baseSpeed;
                this.maxForce = this.baseForce;
                this.applyForce(this.arrive(this.pos));
            }
            if (ph !== 'recovery') {
                a.facing = Math.atan2(a.target.y - this.pos.y, a.target.x - this.pos.x);
                this.facing = a.facing;
            }
            return;
        }
        if (a.kind === 'breath') {
            this.applyForce(this.arrive(this.pos));
            if (ph === 'windup') {
                a.target = this.aimBreath(player, arena);
                this.facing = Combat.turnToward(this.facing, Math.atan2(a.target.y - this.pos.y, a.target.x - this.pos.x), B.turnRate * dt);
            } else if (!a.spawned) {
                a.spawned = true;
                this.pendingZone = { x: a.target.x, y: a.target.y };
            }
            return;
        }
        // Hallebarde : planté ; il suit encore un peu le joueur pendant la préparation
        this.applyForce(this.arrive(this.pos));
        if (ph === 'windup') {
            a.facing = Combat.turnToward(a.facing, toPlayer, B.windupTurnRate * dt);
            this.facing = a.facing;
        }
    }

    receiveHit(damage) {
        if (!this.alive) return false;
        if (this.dodge) this.dodge.hit = true;   // touché pendant l'esquive : pas de riposte
        const wasEnraged = this.enraged;
        this.hp = Math.max(0, this.hp - damage);
        this.hurtTimer = 0.2;
        if (!wasEnraged && this.enraged && this.alive) this.rageTime = this.time;
        return true;
    }

    tick(dt) {
        this.time += dt;
        if (this.hurtTimer > 0) this.hurtTimer = Math.max(0, this.hurtTimer - dt);
        if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
        if (this.chargeCooldown > 0) this.chargeCooldown = Math.max(0, this.chargeCooldown - dt);
        if (this.breathCooldown > 0) this.breathCooldown = Math.max(0, this.breathCooldown - dt);
        if (this.dodgeCooldown > 0) this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
        if (this.action) {
            this.action.t += dt;
            if (Combat.phase(this.action.spec, this.action.t) === 'done') {
                // Le souffle ne frappe pas directement : il ne compte pas comme coup dans le vide
                if (!this.action.hasHit && this.action.spec.damage > 0) this.stats.whiffs++;
                if (this.action.kind === 'charge') {
                    this.maxSpeed = this.baseSpeed;
                    this.maxForce = this.baseForce;
                }
                this.action = null;
            }
        }
        if (this.dodge) {
            this.dodge.t += dt;
            if (this.dodge.t >= Combat.BOSS.dodge.duration) {
                // Riposte : esquive réussie, la hallebarde est prête tout de suite
                if (!this.dodge.hit && this.alive) {
                    this.cooldown = 0;
                    this.stats.ripostes++;
                    this.riposteTime = this.time;
                }
                this.dodge = null;
                this.maxSpeed = this.baseSpeed;
                this.maxForce = this.baseForce;
            }
        }
        if (this.stun) {
            this.stun.t += dt;
            if (this.stun.t >= Combat.BOSS.stun) this.stun = null;
        }
    }

    reset(x, y) {
        this.pos.set(x, y);
        this.vel.set(0, 0);
        this.acc.set(0, 0);
        this.hp = this.maxHp;
        this.cooldown = 0;
        this.chargeCooldown = 0;
        this.breathCooldown = 0;
        this.dodgeCooldown = 0;
        this.pendingZone = null;
        this.action = null;
        this.dodge = null;
        this.stun = null;
        this.campTime = 0;
        this.maxSpeed = this.baseSpeed;
        this.maxForce = this.baseForce;
        this.rageTime = -1;
        this.path = [];
    }

    // --- Rendu ---

    /** Télégraphe : le cône d'attaque se remplit pendant la préparation (0,6 s), bord lumineux. */
    showTelegraph() {
        if (!this.action) return;
        if (this.action.kind === 'charge') return this.showChargeTelegraph();
        if (this.action.kind === 'breath') return this.showBreathTelegraph();
        const s = this.action.spec;
        const ph = Combat.phase(s, this.action.t);
        const reach = s.reach + 6;
        const f = this.action.facing, a0 = f - s.arc / 2, a1 = f + s.arc / 2;
        push();
        translate(this.pos.x, this.pos.y);
        noStroke();
        if (ph === 'windup') {
            const k = this.action.t / s.windup;
            // Zone entière, puis remplissage en dégradé qui avance
            fill(170, 20, 20, 50);
            arc(0, 0, reach * 2, reach * 2, a0, a1, PIE);
            const ctx = drawingContext;
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, reach * k + 1);
            g.addColorStop(0, 'rgba(255,60,40,0.05)');
            g.addColorStop(1, 'rgba(255,70,40,' + (0.35 + 0.45 * k) + ')');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, reach * k, a0, a1);
            ctx.closePath();
            ctx.fill();
            // Bord extérieur qui s'illumine
            noFill();
            stroke(255, 120, 80, 80 + 170 * k);
            strokeWeight(2 + 2 * k);
            arc(0, 0, reach * 2, reach * 2, a0, a1);
        } else if (ph === 'active') {
            fill(255, 236, 210, 210);
            arc(0, 0, reach * 2, reach * 2, a0, a1, PIE);
        }
        pop();
    }

    /** Ruée : ligne rouge qui s'épaissit, chevrons vers la cible ; éclair blanc quand la visée est figée. */
    showChargeTelegraph() {
        const a = this.action;
        const ph = Combat.phase(a.spec, a.t);
        if (ph === 'recovery') return;
        push();
        if (ph === 'windup') {
            const k = a.t / a.spec.windup;
            const locked = a.t >= a.spec.windup - Combat.BOSS.charge.lockBefore;
            const dx = a.target.x - this.pos.x, dy = a.target.y - this.pos.y;
            const len = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
            stroke(locked ? color(255, 245, 230, 230) : color(255, 50, 30, 60 + 140 * k));
            strokeWeight(6 + 18 * k);
            line(this.pos.x, this.pos.y, a.target.x, a.target.y);
            // Chevrons qui défilent vers la cible
            translate(this.pos.x, this.pos.y);
            rotate(ang);
            noFill();
            stroke(255, 200, 170, 120 + 120 * k);
            strokeWeight(2.5);
            const step = 34, shift = (a.t * 120) % step;
            for (let d = this.r + shift; d < len - 10; d += step) {
                line(d - 7, -7, d, 0);
                line(d - 7, 7, d, 0);
            }
            noStroke();
            fill(255, 60, 30, 200);
            circle(len, 0, 14 + 12 * k);
        } else {
            // Traînée de la charge
            noStroke();
            this.path.forEach((p, i) => {
                fill(255, 120, 60, 25 + i * 15);
                circle(p.x, p.y, this.r * 1.6);
            });
        }
        pop();
    }

    /** Souffle : cercle vert qui se remplit là où la nappe va apparaître, volutes qui tournent. */
    showBreathTelegraph() {
        const a = this.action;
        if (Combat.phase(a.spec, a.t) !== 'windup') return;
        const k = a.t / a.spec.windup;
        const R = Combat.BOSS.breath.radius;
        push();
        noFill();
        stroke(120, 255, 200, 200);
        strokeWeight(2);
        circle(a.target.x, a.target.y, R * 2);
        stroke(160, 255, 220, 140);
        strokeWeight(3);
        for (let i = 0; i < 3; i++) {
            const s0 = a.t * 4 + i * 2.09;
            arc(a.target.x, a.target.y, R * 1.6, R * 1.6, s0, s0 + 1.1);
        }
        noStroke();
        fill(120, 255, 200, 35 + 60 * k);
        circle(a.target.x, a.target.y, R * 2 * k);
        // Le boss inspire : volutes vers sa gueule
        fill(150, 240, 200, 120);
        circle(this.pos.x + Math.cos(this.facing) * (this.r + 10), this.pos.y + Math.sin(this.facing) * (this.r + 10), 10 + 10 * k);
        pop();
    }

    show() {
        push();
        // Ombre au sol
        noStroke();
        fill(0, 0, 0, 110);
        ellipse(this.pos.x + 5, this.pos.y + 8, this.r * 2.6, this.r * 2.1);
        // Aura enragée
        if (this.enraged && this.alive) {
            const pulse = 1 + 0.08 * Math.sin(this.time * 12);
            fill(255, 40, 20, 40);
            circle(this.pos.x, this.pos.y, this.r * 3.2 * pulse);
            fill(255, 80, 30, 30);
            circle(this.pos.x, this.pos.y, this.r * 2.6 * pulse);
        }
        // Onde de colère au passage en phase enragée
        if (this.rageTime >= 0 && this.time - this.rageTime < 1) {
            const k = this.time - this.rageTime;
            noFill();
            stroke(255, 60, 30, 255 * (1 - k));
            strokeWeight(6);
            circle(this.pos.x, this.pos.y, this.r * 2 + k * 400);
        }
        // Étourdi : étoiles qui tournent au-dessus de lui
        if (this.stun) {
            noStroke();
            fill(255, 230, 120);
            for (let i = 0; i < 3; i++) {
                const a = this.time * 6 + i * 2.1;
                circle(this.pos.x + Math.cos(a) * this.r * 0.8, this.pos.y - this.r - 6 + Math.sin(a) * 6, 7);
            }
        }
        translate(this.pos.x, this.pos.y);
        rotate(this.facing);
        // Cape de brouillard : plusieurs voiles qui ondulent derrière lui
        noStroke();
        for (let i = 0; i < 3; i++) {
            const w = Math.sin(this.time * 2.2 + i * 1.7) * 4;
            fill(58 + i * 8, 64 + i * 8, 80 + i * 8, 95 - i * 20);
            ellipse(-this.r * (0.55 + i * 0.22), w, this.r * (2.5 - i * 0.3), this.r * (2.2 - i * 0.25));
        }
        // Armure
        stroke(8);
        strokeWeight(3);
        if (this.hurtTimer > 0) fill(230, 230, 240);
        else if (this.enraged) fill(84, 32, 30);
        else fill(50, 54, 66);
        circle(0, 0, this.r * 2);
        noStroke();
        fill(255, 255, 255, this.hurtTimer > 0 ? 0 : 30);
        arc(0, 0, this.r * 1.7, this.r * 1.7, -2.5, -0.8);
        fill(0, 0, 0, 60);
        arc(0, 0, this.r * 1.7, this.r * 1.7, 0.8, 2.5);
        // Cornes
        stroke(8);
        strokeWeight(2);
        fill(205, 195, 172);
        triangle(this.r * 0.2, -this.r * 0.6, this.r * 0.9, -this.r * 1.25, this.r * 0.6, -this.r * 0.35);
        triangle(this.r * 0.2, this.r * 0.6, this.r * 0.9, this.r * 1.25, this.r * 0.6, this.r * 0.35);
        // Yeux lumineux
        noStroke();
        const eye = this.enraged ? [255, 70, 30] : [120, 220, 255];
        fill(eye[0], eye[1], eye[2], 70);
        circle(this.r * 0.55, -this.r * 0.25, 16);
        circle(this.r * 0.55, this.r * 0.25, 16);
        fill(eye[0], eye[1], eye[2]);
        circle(this.r * 0.55, -this.r * 0.25, 7);
        circle(this.r * 0.55, this.r * 0.25, 7);
        // Hallebarde : levée pendant la préparation, abattue pendant la frappe
        let swing = 0.9;
        if (this.action) {
            const s = this.action.spec;
            const ph = Combat.phase(s, this.action.t);
            if (ph === 'windup') swing = 0.9 + 0.9 * (this.action.t / s.windup);
            else if (ph === 'active') swing = 1.8 - 3.4 * ((this.action.t - s.windup) / s.active);
            else swing = -1.6;
        }
        rotate(swing);
        stroke(105, 92, 80);
        strokeWeight(5);
        line(this.r * 0.6, 0, this.r + 62, 0);
        noStroke();
        fill(195, 200, 210);
        triangle(this.r + 50, -12, this.r + 72, 0, this.r + 50, 12);
        fill(255, 255, 255, 90);
        triangle(this.r + 52, -9, this.r + 70, 0, this.r + 52, -1);
        pop();
    }

    /** Cercle de détection (debug) : jaune, rouge quand le joueur est dedans. */
    showDetection(player) {
        const inside = p5.Vector.dist(this.pos, player.pos) <= this.detectRadius;
        push();
        noFill();
        strokeWeight(1.5);
        stroke(inside ? color(255, 60, 60) : color(255, 220, 0));
        circle(this.pos.x, this.pos.y, this.detectRadius * 2);
        stroke(255, 255, 255, 60);
        circle(this.pos.x, this.pos.y, (Combat.ATTACKS.boss.reach + player.r) * 2);
        pop();
    }
}

Boss.IDLE_SPEED = 0.3;   // en dessous (px par pas), le boss est compté comme immobile
