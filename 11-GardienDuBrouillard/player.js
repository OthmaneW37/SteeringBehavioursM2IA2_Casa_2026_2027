// Le chevalier : sous-classe de Vehicle (vehicle.js, fourni et protégé).
//
// Séparation de Reynolds :
//   - sélection de l'action : une « intention » vient d'un contrôleur (clavier ou joueur scripté) ;
//   - steering : `seek` vers la direction choisie, `arrive` quand le point visé touche un mur
//     (on ralentit près des bords), `evade` pendant la roulade, évitement des nappes de brume
//     (`avoidZones`, seulement si l'intention le demande : le joueur robot l'utilise, pas l'humain) ;
//   - locomotion : applyForce puis update(), hérités de Vehicle.
//
// Intention : { move: {x, y} dans [−1, 1], lock, light, heavy, roll, drink, parry, avoid, target? }.
// Parade ('parry') : bouclier levé vers le boss (verrouillé) ou dans le sens de la marche (voir combat.js).
// `target` (point du monde, facultatif) : le joueur va à ce point avec `arrive` au lieu de suivre `move`.
// Verrouillé sur le boss, move.y = −1 avance vers lui, +1 recule, move.x tourne autour de lui.
//
// Fioles d'Estus : boire prend 1 s pendant laquelle on marche très lentement ; le soin arrive à 0,6 s.
// Un coup reçu avant le soin interrompt la gorgée et la fiole est perdue : le boss peut apprendre à punir.
// Dans une nappe de brume, on avance moins vite (sauf pendant la roulade) et on brûle.
class Player extends Vehicle {
    constructor(x, y) {
        super(x, y, null);
        const P = Combat.PLAYER;
        this.r = P.r;
        this.baseSpeed = P.maxSpeed;
        this.baseForce = P.maxForce;
        this.maxSpeed = P.maxSpeed;
        this.maxForce = P.maxForce;
        this.vel.set(0, 0);
        this.pathLength = 6;

        this.maxHp = P.maxHp;
        this.hp = P.maxHp;
        this.maxStamina = P.maxStamina;
        this.stamina = P.maxStamina;
        this.regenTimer = 0;
        this.action = null;   // attaque en cours (Combat.newAttack)
        this.roll = null;     // roulade en cours : { t }
        this.facing = -Math.PI / 4;
        this.locked = false;
        this.hurtTimer = 0;   // effet visuel après un coup reçu
        this.estus = P.estus.charges;  // fioles restantes
        this.drink = null;    // gorgée en cours : { t, healed }
        this.inMist = false;  // dans une nappe de brume (réglé par le combat à chaque pas)
        this.zones = null;    // nappes de brume du combat (pour l'évitement)
        this.pillars = null;  // piliers du combat (évitement, abri)
        this.stats = { attacks: 0, hits: 0, damageDealt: 0, rolls: 0, drinks: 0, drinksInterrupted: 0, parries: 0, criticals: 0 };
    }

    // Fuite et évitement de Reynolds (steering.js) à la place des versions de vehicle.js
    flee(target) {
        return Steering.flee(this, target);
    }

    evade(vehicle) {
        return Steering.evade(this, vehicle);
    }

    get alive() {
        return this.hp > 0;
    }

    /** Images d'invulnérabilité : pendant les 0,3 premières secondes de la roulade. */
    get invulnerable() {
        return this.roll !== null && this.roll.t < Combat.PLAYER.roll.iframes;
    }

    /** Un coup en préparation ou en frappe (une parade n'est pas un coup : le boss ne l'esquive pas). */
    isAttacking() {
        if (!this.action || this.action.kind === 'parry') return false;
        const ph = Combat.phase(this.action.spec, this.action.t);
        return ph === 'windup' || ph === 'active';
    }

    canAct() {
        return this.alive && this.action === null && this.roll === null && this.drink === null;
    }

    /** Vulnérable : en train de boire, ou en récupération après une attaque (le boss peut punir). */
    get vulnerable() {
        if (this.drink) return true;
        return this.action !== null && Combat.phase(this.action.spec, this.action.t) === 'recovery';
    }

    /** Dépense d'endurance : refusée si elle ne suffit pas ; la régénération repart après un délai. */
    spend(cost) {
        if (this.stamina < cost) return false;
        this.stamina -= cost;
        this.regenTimer = Combat.PLAYER.regenDelay;
        return true;
    }

    /** Évitement des obstacles ronds : nappes de brume et piliers debout (Steering.avoidZones). */
    avoidObstacles() {
        const obstacles = (this.zones || []).concat((this.pillars || []).filter(p => p.alive));
        return Steering.avoidZones(this, obstacles);
    }

    /** Direction de déplacement dans le monde ; verrouillé, elle est relative au boss. */
    moveDirection(move, boss) {
        let dir;
        if (this.locked && boss) {
            const fwd = p5.Vector.sub(boss.pos, this.pos);
            if (fwd.mag() === 0) fwd.x = 1;
            fwd.normalize();
            const right = createVector(-fwd.y, fwd.x);
            dir = fwd.mult(-move.y).add(right.mult(move.x));
        } else {
            dir = createVector(move.x, move.y);
        }
        if (dir.mag() > 1) dir.normalize();
        return dir;
    }

    /** Intention → forces de pilotage et début des actions. */
    control(intent, boss, arena) {
        if (!this.alive) {
            this.applyForce(this.arrive(this.pos));
            return;
        }
        this.locked = !!intent.lock && boss && boss.alive;
        // Vitesse de marche : lente en buvant, réduite dans la brume (la roulade garde sa vitesse)
        if (!this.roll) {
            this.maxSpeed = (this.drink ? Combat.PLAYER.estus.maxSpeed : this.baseSpeed) *
                (this.inMist ? Combat.BOSS.breath.slow : 1);
        }

        if (this.roll) {
            // Roulade : `evade` loin du boss, avec les limites de vitesse de la roulade
            this.applyForce(this.evade(boss));
        } else if (this.action) {
            // On est planté pendant une attaque : `arrive` sur place freine
            this.applyForce(this.arrive(this.pos));
        } else if (intent.target) {
            // Point précis à rejoindre (le joueur robot va s'abriter derrière un pilier) : `arrive`
            const t = arena.clampPoint(intent.target, this.r + 4);
            this.applyForce(this.arrive(createVector(t.x, t.y)));
            if (intent.avoid) this.applyForce(this.avoidObstacles().mult(1.5));
        } else {
            const dir = this.moveDirection(intent.move || { x: 0, y: 0 }, boss);
            if (dir.mag() < 0.05) {
                this.applyForce(this.arrive(this.pos));
            } else {
                const target = createVector(this.pos.x + dir.x * Player.LOOK_AHEAD, this.pos.y + dir.y * Player.LOOK_AHEAD);
                const safe = arena.clampPoint(target, this.r + 4);
                // Près d'un bord, le point visé est ramené contre le mur : `arrive` ralentit jusqu'à l'arrêt
                if (safe.clamped) this.applyForce(this.arrive(createVector(safe.x, safe.y)));
                else this.applyForce(this.seek(target));
            }
            // Évitement des nappes de brume et des piliers (joueur robot)
            if (intent.avoid) this.applyForce(this.avoidObstacles().mult(1.5));
        }

        // Orientation : vers le boss si verrouillé, sinon dans le sens de la marche
        if (this.locked) this.facing = Math.atan2(boss.pos.y - this.pos.y, boss.pos.x - this.pos.x);
        else if (this.vel.mag() > 0.5 && !this.action) this.facing = this.vel.heading();

        if (!this.canAct()) return;
        if (intent.roll && this.spend(Combat.PLAYER.roll.stamina)) {
            this.roll = { t: 0 };
            this.maxSpeed = Combat.PLAYER.roll.maxSpeed;
            this.maxForce = Combat.PLAYER.roll.maxForce;
            this.stats.rolls++;
        } else if (intent.parry && this.spend(Combat.ATTACKS.parry.stamina)) {
            this.startAttack('parry', boss);
        } else if (intent.drink && this.estus > 0) {
            this.estus--;
            this.drink = { t: 0, healed: false };
            this.stats.drinks++;
        } else if (intent.heavy && this.spend(Combat.ATTACKS.heavy.stamina)) {
            this.startAttack('heavy', boss);
        } else if (intent.light && this.spend(Combat.ATTACKS.light.stamina)) {
            this.startAttack('light', boss);
        }
    }

    startAttack(kind, boss) {
        if (this.locked) this.facing = Math.atan2(boss.pos.y - this.pos.y, boss.pos.x - this.pos.x);
        this.action = Combat.newAttack(kind, this.facing);
        this.stats.attacks++;
    }

    /** Dégâts reçus : ignorés pendant les images d'invulnérabilité. Retourne true s'ils sont appliqués. */
    receiveHit(damage) {
        if (this.invulnerable || !this.alive) return false;
        this.hp = Math.max(0, this.hp - damage);
        this.hurtTimer = 0.25;
        // Touché avant que le soin n'agisse : la gorgée est perdue
        if (this.drink && !this.drink.healed) {
            this.drink = null;
            this.stats.drinksInterrupted++;
        }
        return true;
    }

    /** Brûlure de la brume (dégâts continus, ignorent l'invulnérabilité). Retourne les dégâts appliqués. */
    burn(damage) {
        if (!this.alive) return 0;
        const applied = Math.min(this.hp, damage);
        this.hp -= applied;
        return applied;
    }

    /** Avance les minuteries de `dt` secondes. */
    tick(dt) {
        if (this.hurtTimer > 0) this.hurtTimer = Math.max(0, this.hurtTimer - dt);
        if (this.action) {
            this.action.t += dt;
            if (Combat.phase(this.action.spec, this.action.t) === 'done') this.action = null;
        }
        if (this.drink) {
            const E = Combat.PLAYER.estus;
            this.drink.t += dt;
            if (!this.drink.healed && this.drink.t >= E.healAt) {
                this.hp = Math.min(this.maxHp, this.hp + E.heal);
                this.drink.healed = true;
            }
            if (this.drink.t >= E.duration) this.drink = null;
        }
        if (this.roll) {
            this.roll.t += dt;
            if (this.roll.t >= Combat.PLAYER.roll.duration) {
                this.roll = null;
                this.maxSpeed = this.baseSpeed;
                this.maxForce = this.baseForce;
            }
        }
        // Endurance : pas de régénération pendant une action, puis après un court délai
        if (this.action || this.roll) {
            this.regenTimer = Combat.PLAYER.regenDelay;
        } else if (this.regenTimer > 0) {
            this.regenTimer = Math.max(0, this.regenTimer - dt);
        } else {
            this.stamina = Math.min(this.maxStamina, this.stamina + Combat.PLAYER.staminaRegen * dt);
        }
    }

    /** Remise à neuf au feu de camp. */
    respawn(x, y) {
        this.pos.set(x, y);
        this.vel.set(0, 0);
        this.acc.set(0, 0);
        this.hp = this.maxHp;
        this.stamina = this.maxStamina;
        this.action = null;
        this.roll = null;
        this.drink = null;
        this.estus = Combat.PLAYER.estus.charges;
        this.maxSpeed = this.baseSpeed;
        this.maxForce = this.baseForce;
        this.path = [];
    }

    show() {
        push();
        // Traînée de la roulade
        if (this.roll) {
            noStroke();
            this.path.forEach((p, i) => {
                fill(170, 190, 255, 16 + i * 10);
                circle(p.x, p.y, this.r * 1.7);
            });
        }
        // Gorgée d'Estus : lueur dorée qui grandit jusqu'au soin
        if (this.drink) {
            noStroke();
            const k = Math.min(1, this.drink.t / Combat.PLAYER.estus.healAt);
            fill(255, 190, 70, 35 + 70 * k);
            circle(this.pos.x, this.pos.y, this.r * 2.4 + 22 * k);
        }
        // Ombre au sol
        noStroke();
        fill(0, 0, 0, 90);
        ellipse(this.pos.x + 3, this.pos.y + 5, this.r * 2.3, this.r * 1.9);
        translate(this.pos.x, this.pos.y);
        rotate(this.facing);
        const blink = this.invulnerable && Math.floor(this.roll.t * 30) % 2 === 0;
        const hurt = this.hurtTimer > 0;
        // Cape : flotte derrière, d'autant plus que le chevalier va vite
        const sp = Math.min(1, this.vel.mag() / Math.max(this.maxSpeed, 1e-9));
        const sway = Math.sin(this.pos.x * 0.05 + this.pos.y * 0.05) * 3;
        fill(hurt ? color(150, 30, 30) : color(92, 26, 24));
        beginShape();
        vertex(-this.r * 0.2, -this.r * 0.85);
        vertex(-this.r * (1.3 + 0.6 * sp), -this.r * 0.55 + sway);
        vertex(-this.r * (1.45 + 0.8 * sp), sway * 0.5);
        vertex(-this.r * (1.3 + 0.6 * sp), this.r * 0.55 + sway);
        vertex(-this.r * 0.2, this.r * 0.85);
        endShape(CLOSE);
        // Armure : plastron et épaulières
        stroke(16, 16, 20);
        strokeWeight(2);
        fill(hurt ? color(255, 140, 140) : blink ? color(220, 230, 255, 120) : color(150, 156, 170));
        circle(0, 0, this.r * 2);
        fill(blink ? color(220, 230, 255, 120) : color(120, 126, 142));
        ellipse(-1, -this.r * 0.72, this.r * 0.9, this.r * 0.6);
        ellipse(-1, this.r * 0.72, this.r * 0.9, this.r * 0.6);
        noStroke();
        fill(255, 255, 255, 50);
        arc(0, 0, this.r * 1.6, this.r * 1.6, -2.4, -0.9);
        // Bouclier (bras gauche) ; levé devant lui pendant la parade, lumineux dans la fenêtre active
        stroke(16);
        strokeWeight(1.5);
        const parry = this.action && this.action.kind === 'parry' ? Combat.phase(this.action.spec, this.action.t) : null;
        if (parry === 'windup' || parry === 'active') {
            if (parry === 'active') {
                noStroke();
                fill(255, 225, 140, 90);
                ellipse(this.r + 6, 0, 18, 34);
                stroke(16);
            }
            fill(110, 70, 40);
            ellipse(this.r + 3, 0, 11, 26);
            fill(parry === 'active' ? color(255, 220, 120) : color(190, 150, 70));
            circle(this.r + 3, 0, 5);
        } else {
            fill(96, 60, 34);
            ellipse(3, -this.r - 1, 15, 10);
            fill(190, 150, 70);
            circle(3, -this.r - 1, 4);
        }
        // Heaume, visière lumineuse
        fill(108, 113, 128);
        circle(2, 0, this.r * 1.15);
        noStroke();
        fill(255, 220, 160, 170);
        rect(this.r * 0.32, -this.r * 0.32, 2.5, this.r * 0.64, 1);
        // Fiole portée à la bouche pendant la gorgée
        if (this.drink) {
            fill(255, 170, 50);
            ellipse(this.r * 0.6, 4, 7, 10);
            fill(255, 230, 160);
            ellipse(this.r * 0.6, 3, 3, 4);
        }
        // Épée : position selon la phase de l'attaque
        let swing = 0.5;
        let len = 26;
        if (this.action) {
            const s = this.action.spec;
            const t = this.action.t;
            const ph = Combat.phase(s, t);
            if (ph === 'windup') swing = 0.5 + 1.2 * (t / s.windup);
            else if (ph === 'active') swing = 1.7 - 3.2 * ((t - s.windup) / s.active);
            else swing = -1.5;
            if (this.action.kind === 'heavy') len = 32;
        }
        rotate(swing);
        stroke(235, 238, 245);
        strokeWeight(3);
        line(this.r - 2, 0, this.r + len, 0);
        stroke(255, 255, 255, 120);
        strokeWeight(1);
        line(this.r + 2, -1, this.r + len - 3, -1);
        stroke(170, 125, 50);
        strokeWeight(4);
        line(this.r - 4, -5, this.r - 4, 5);
        pop();

        // Arc de frappe pendant la fenêtre active
        if (this.action && Combat.phase(this.action.spec, this.action.t) === 'active') {
            push();
            noFill();
            const s = this.action.spec;
            stroke(255, 245, 220, 70);
            strokeWeight(9);
            arc(this.pos.x, this.pos.y, (s.reach + 6) * 2, (s.reach + 6) * 2, this.action.facing - s.arc / 2, this.action.facing + s.arc / 2);
            stroke(255, 255, 255, 190);
            strokeWeight(2.5);
            arc(this.pos.x, this.pos.y, (s.reach + 8) * 2, (s.reach + 8) * 2, this.action.facing - s.arc / 2, this.action.facing + s.arc / 2);
            pop();
        }
    }
}

// Distance du point visé devant le chevalier (le `seek` vise ce point)
Player.LOOK_AHEAD = 60;
