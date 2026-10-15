// Interface du combat (barres de vie et d'endurance, morts, messages) et effets visuels des coups.
// Ce sont des dessins, pas des entités du monde.
const Hud = {
    /** Largeur remplie d'une barre (bornée à [0, largeur]). */
    fill(value, max, width) {
        if (max <= 0) return 0;
        return Math.max(0, Math.min(width, (value / max) * width));
    },

    bar(x, y, w, h, value, max, c, trailing) {
        noStroke();
        fill(20, 20, 24, 220);
        rect(x - 2, y - 2, w + 4, h + 4, 3);
        if (trailing !== undefined) {
            fill(230, 200, 120, 160);
            rect(x, y, Hud.fill(trailing, max, w), h, 2);
        }
        fill(c);
        rect(x, y, Hud.fill(value, max, w), h, 2);
    },

    drawPlayer(player, deaths, trailHp) {
        push();
        // x = 52 : on laisse la place au bouton du menu, en haut à gauche
        Hud.bar(52, 22, 260, 12, player.hp, player.maxHp, color(190, 40, 40), trailHp);
        Hud.bar(52, 42, 200, 8, player.stamina, player.maxStamina, color(60, 170, 90));
        fill(230);
        textSize(12);
        textAlign(LEFT, TOP);
        text("Vie", 318, 21);
        text("Endurance", 258, 39);
        text("Morts : " + deaths, 52, 58);
        if (player.locked) {
            fill(255, 220, 120);
            text("Cible verrouillée", 128, 58);
        }
        // Fioles d'Estus restantes (touche E)
        for (let i = 0; i < Math.max(player.estus, 0); i++) Hud.flask(360 + i * 16, 18);
        fill(200);
        text("E", 360 + Math.max(player.estus, 1) * 16 + 2, 21);
        if (player.inMist) {
            fill(120, 255, 200);
            textSize(13);
            text("Dans la brume : vous brûlez et ralentissez !", 52, 76);
        }
        pop();
    },

    /** Petite fiole dorée (HUD). */
    flask(x, y) {
        noStroke();
        fill(255, 170, 50);
        ellipse(x + 5, y + 11, 11, 13);
        rect(x + 3, y + 1, 4, 6, 1);
        fill(255, 230, 160);
        ellipse(x + 4, y + 10, 3, 4);
    },

    /** Nom de la technique que prépare le boss, au-dessus de lui (aide à lire le combat). */
    techniqueLabel(boss) {
        const a = boss.action;
        if (!a || Combat.phase(a.spec, a.t) !== 'windup') return;
        const names = { boss: "Hallebarde !", charge: "Ruée !", breath: "Souffle du brouillard !" };
        push();
        textAlign(CENTER, BOTTOM);
        textSize(14);
        fill(0, 0, 0, 160);
        text(names[a.kind] || "", boss.pos.x + 1, boss.pos.y - boss.r - 13);
        fill(a.kind === 'breath' ? color(150, 255, 210) : color(255, 120, 90));
        text(names[a.kind] || "", boss.pos.x, boss.pos.y - boss.r - 14);
        pop();
    },

    drawBoss(boss, trailHp) {
        const w = Math.min(560, width * 0.6);
        const x = (width - w) / 2;
        const y = height - 52;
        push();
        fill(235);
        textSize(15);
        textAlign(LEFT, BOTTOM);
        text("Gardien du Brouillard" + (boss.enraged ? "  — enragé" : ""), x, y - 6);
        Hud.bar(x, y, w, 10, boss.hp, boss.maxHp, boss.enraged ? color(230, 70, 30) : color(170, 30, 30), trailHp);
        pop();
    },

    /** Grand message centré (VOUS ÊTES MORT, ENNEMI VAINCU) qui apparaît en fondu. */
    banner(title, subtitle, c, alpha) {
        push();
        noStroke();
        fill(0, 0, 0, 150 * alpha);
        rect(0, height / 2 - 70, width, 140);
        textAlign(CENTER, CENTER);
        textSize(54);
        fill(red(c), green(c), blue(c), 255 * alpha);
        text(title, width / 2, height / 2 - 10);
        textSize(15);
        fill(220, 220, 220, 255 * alpha);
        text(subtitle, width / 2, height / 2 + 40);
        pop();
    },

    /** Rappel des commandes au début d'un combat (disparaît en fondu). */
    controlsHint(alpha) {
        const lines = Hud.CONTROLS;
        const w = 430, h = 26 + lines.length * 18;
        const x = (width - w) / 2, y = height - 150 - h;
        push();
        noStroke();
        fill(10, 12, 18, 200 * alpha);
        rect(x, y, w, h, 8);
        textAlign(LEFT, TOP);
        textSize(13);
        lines.forEach((l, i) => {
            fill(230, 200, 120, 255 * alpha);
            text(l[0], x + 16, y + 12 + i * 18);
            fill(220, 220, 220, 255 * alpha);
            text(l[1], x + 150, y + 12 + i * 18);
        });
        pop();
    },

    /** Marque de verrouillage sur le boss. */
    lockMark(boss, timeSeconds) {
        push();
        noFill();
        stroke(255, 235, 170, 200);
        strokeWeight(2);
        const r = boss.r + 14 + Math.sin(timeSeconds * 5) * 2;
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + Math.PI / 4;
            arc(boss.pos.x, boss.pos.y, r * 2, r * 2, a - 0.3, a + 0.3);
        }
        pop();
    }
};

Hud.CONTROLS = [
    ["ZQSD / flèches", "se déplacer"],
    ["J  /  K", "attaque légère / lourde"],
    ["E", "boire une fiole d'Estus (soin, 1 s planté)"],
    ["Espace", "roulade : esquive le coup du boss"],
    ["L / Tab", "verrouiller la caméra sur le boss"],
    ["Astuce", "roulez quand le cône ou la ligne rouge se remplit"]
];

/** Étincelles et textes des coups (effets visuels, durées en secondes). */
class Effects {
    constructor() {
        this.items = [];
        this.lastDodge = -Infinity;
    }

    add(event, timeSeconds) {
        if (event.type === 'hit') {
            const c = event.who === 'boss' ? [255, 80, 60] : [255, 230, 150];
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                this.items.push({ kind: 'spark', x: event.x, y: event.y, vx: Math.cos(a) * (60 + i * 9), vy: Math.sin(a) * (60 + i * 9), life: 0.35, age: 0, c: c });
            }
            this.items.push({ kind: 'text', x: event.x, y: event.y - 20, text: "-" + event.damage, life: 0.8, age: 0, c: c });
        } else if (event.type === 'dodged' && timeSeconds - this.lastDodge > 0.5) {
            this.lastDodge = timeSeconds;
            this.items.push({ kind: 'text', x: event.x, y: event.y - 24, text: "esquivé !", life: 0.8, age: 0, c: [170, 200, 255] });
        } else if (event.type === 'mist') {
            this.items.push({ kind: 'text', x: event.x, y: event.y - 10, text: "brume !", life: 1, age: 0, c: [120, 255, 200] });
        }
    }

    update(dt) {
        for (const e of this.items) {
            e.age += dt;
            if (e.kind === 'spark') { e.x += e.vx * dt; e.y += e.vy * dt; }
            else e.y -= 30 * dt;
        }
        this.items = this.items.filter(e => e.age < e.life);
    }

    show() {
        push();
        noStroke();
        textAlign(CENTER, CENTER);
        for (const e of this.items) {
            const a = 255 * (1 - e.age / e.life);
            fill(e.c[0], e.c[1], e.c[2], a);
            if (e.kind === 'spark') circle(e.x, e.y, 4);
            else {
                textSize(16);
                text(e.text, e.x, e.y);
            }
        }
        pop();
    }
}
