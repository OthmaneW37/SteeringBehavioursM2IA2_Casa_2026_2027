// Interface du combat (barres de vie et d'endurance, fioles, morts, barre du boss, bandeaux) et effets
// visuels des coups. Ce sont des dessins, pas des entités du monde : ils lisent l'état du jeu sans le
// modifier. La disposition vient de HudLayout, les animations des bandeaux de Banner.
const Hud = {
    /** Largeur remplie d'une barre (bornée à [0, largeur]). */
    fill(value, max, width) {
        if (max <= 0) return 0;
        return Math.max(0, Math.min(width, (value / max) * width));
    },

    /** Barre façon Souls : cadre sombre à liseré doré, traînée « fantôme » claire, reflet en haut. */
    bar(x, y, w, h, value, max, c, trailing) {
        noStroke();
        fill(8, 7, 6, 230);
        rect(x - 3, y - 3, w + 6, h + 6, 2);
        stroke(120, 98, 58, 200);
        strokeWeight(1);
        noFill();
        rect(x - 2.5, y - 2.5, w + 5, h + 5, 2);
        noStroke();
        if (trailing !== undefined) {
            fill(232, 205, 140, 170);
            rect(x, y, Hud.fill(trailing, max, w), h);
        }
        fill(c);
        rect(x, y, Hud.fill(value, max, w), h);
        fill(255, 255, 255, 38);
        rect(x, y, Hud.fill(value, max, w), Math.max(1, h * 0.35));
    },

    drawPlayer(player, deaths, trailHp, L = HudLayout.compute(width, height)) {
        push();
        Hud.bar(L.hp.x, L.hp.y, L.hp.w, L.hp.h, player.hp, player.maxHp, color(168, 30, 26), trailHp);
        Hud.bar(L.stamina.x, L.stamina.y, L.stamina.w, L.stamina.h, player.stamina, player.maxStamina, color(70, 150, 72));
        // Fioles d'Estus restantes (touche E)
        const n = Math.max(player.estus, 0);
        for (let i = 0; i < n; i++) Hud.flask(L.flasks.x + i * (L.flasks.size + L.flasks.gap), L.flasks.y, L.flasks.size);
        textFont('Cinzel');
        textSize(L.fontSize * 0.8);
        textAlign(LEFT, CENTER);
        fill(220, 205, 170);
        text(n > 0 ? "E" : "Plus de fiole", L.flasks.x + n * (L.flasks.size + L.flasks.gap) + (n > 0 ? 2 : 0), L.flasks.y + L.flasks.size / 2);
        // Compteur de morts, en haut à droite
        textAlign(RIGHT, TOP);
        textSize(L.fontSize);
        fill(200, 180, 140);
        text("Morts  " + deaths, L.deaths.x, L.deaths.y);
        if (player.locked) {
            textSize(L.fontSize * 0.7);
            fill(255, 215, 120);
            text("cible verrouillée", L.deaths.x, L.deaths.y + L.fontSize + 4);
        }
        if (player.inMist) {
            textAlign(LEFT, TOP);
            textSize(L.fontSize * 0.8);
            fill(130, 245, 200);
            text("Dans la brume : vous brûlez et ralentissez !", L.message.x, L.message.y);
        }
        pop();
    },

    /** Fiole d'Estus dorée (HUD), de hauteur `size`. */
    flask(x, y, size = 16) {
        const k = size / 16;
        push();
        noStroke();
        fill(255, 150, 40, 70);
        ellipse(x + 6 * k, y + 10 * k, 16 * k, 16 * k);
        fill(255, 170, 50);
        ellipse(x + 6 * k, y + 10.5 * k, 11 * k, 12 * k);
        rect(x + 4 * k, y + 1 * k, 4 * k, 5 * k, 1);
        fill(255, 232, 170);
        ellipse(x + 4.5 * k, y + 9.5 * k, 3 * k, 4 * k);
        pop();
    },

    /** Nom de la technique que prépare le boss, au-dessus de lui (aide à lire le combat). */
    /** Texte au-dessus du boss : technique en préparation, étourdi, ou riposte. */
    bossLabel(boss) {
        const a = boss.action;
        if (boss.stun) return { text: "Étourdi !", c: [255, 230, 120] };
        // Anti-camping : avertissement dès 1 s passée dans un coin, avec le temps restant
        if (boss.campTime >= Hud.CAMP_WARNING && boss.alive) {
            return { text: "Le brouillard le dévore… " + Math.max(0, Combat.BOSS.camping.limit - boss.campTime).toFixed(1) + " s", c: [190, 120, 255] };
        }
        if (a && Combat.phase(a.spec, a.t) === 'windup') {
            const names = { boss: "Hallebarde !", charge: "Ruée !", breath: "Souffle du brouillard !" };
            return { text: names[a.kind] || "", c: a.kind === 'breath' ? [150, 255, 210] : [255, 120, 90] };
        }
        if (boss.riposteTime >= 0 && boss.time - boss.riposteTime < Hud.RIPOSTE_LABEL) return { text: "Riposte !", c: [255, 90, 200] };
        return null;
    },

    techniqueLabel(boss) {
        const label = Hud.bossLabel(boss);
        if (!label) return;
        push();
        textAlign(CENTER, BOTTOM);
        textSize(14);
        fill(0, 0, 0, 160);
        text(label.text, boss.pos.x + 1, boss.pos.y - boss.r - 13);
        fill(label.c[0], label.c[1], label.c[2]);
        text(label.text, boss.pos.x, boss.pos.y - boss.r - 14);
        pop();
    },

    /** Barre de vie du boss, en bas au centre, avec son nom au-dessus (façon Souls). */
    drawBoss(boss, trailHp, L = HudLayout.compute(width, height)) {
        push();
        textFont('Cinzel');
        textSize(L.fontSize);
        textAlign(LEFT, BOTTOM);
        fill(0, 0, 0, 170);
        text(Hud.BOSS_NAME, L.bossName.x + 1, L.bossName.y + 1);
        fill(235, 225, 200);
        text(Hud.BOSS_NAME, L.bossName.x, L.bossName.y);
        if (boss.enraged) {
            textAlign(RIGHT, BOTTOM);
            fill(240, 110, 60);
            text("enragé", L.boss.x + L.boss.w, L.bossName.y);
        }
        Hud.bar(L.boss.x, L.boss.y, L.boss.w, L.boss.h, boss.hp, boss.maxHp, boss.enraged ? color(215, 70, 30) : color(150, 22, 18), trailHp);
        pop();
    },

    /** Barre de vie de la meute (somme des vies des Creux), en bas au centre, avec le nombre de Creux debout. */
    drawPack(pack, trailHp, L = HudLayout.compute(width, height)) {
        const hp = pack.reduce((s, c) => s + c.hp, 0), max = pack.reduce((s, c) => s + c.maxHp, 0);
        push();
        textFont('Cinzel');
        textSize(L.fontSize);
        textAlign(LEFT, BOTTOM);
        fill(0, 0, 0, 170);
        text(Hud.PACK_NAME, L.bossName.x + 1, L.bossName.y + 1);
        fill(235, 225, 200);
        text(Hud.PACK_NAME, L.bossName.x, L.bossName.y);
        textAlign(RIGHT, BOTTOM);
        fill(200, 190, 255);
        text(pack.filter(c => c.alive).length + " / " + pack.length + " debout", L.boss.x + L.boss.w, L.bossName.y);
        Hud.bar(L.boss.x, L.boss.y, L.boss.w, L.boss.h, hp, max, color(110, 90, 150), trailHp);
        pop();
    },

    /** Carte de début d'étape (campagne) : titre et phrase d'introduction, visibles CARD s puis en fondu. */
    stepCard(label, intro, t) {
        const a = t < Hud.CARD ? 1 : Math.max(0, 1 - (t - Hud.CARD) / 0.8);
        if (a <= 0) return;
        push();
        textFont('Cinzel');
        textAlign(CENTER, CENTER);
        noStroke();
        fill(0, 0, 0, 140 * a);
        rect(0, height * 0.3 - 50, width, 100);
        fill(232, 196, 110, 255 * a);
        textSize(Math.min(40, width / 20));
        text(label, width / 2, height * 0.3 - 12);
        fill(220, 214, 200, 230 * a);
        textSize(Math.min(16, width / 50));
        text(intro, width / 2, height * 0.3 + 26);
        pop();
    },

    /** Étiquette d'étape en haut au centre (« Étape 1 / 3 · Niveau 1 · La meute des Creux »). */
    stepTag(textValue, L = HudLayout.compute(width, height)) {
        push();
        textFont('Cinzel');
        textAlign(CENTER, TOP);
        textSize(L.fontSize * 0.85);
        fill(0, 0, 0, 160);
        text(textValue, width / 2 + 1, L.margin + 1);
        fill(210, 200, 180);
        text(textValue, width / 2, L.margin);
        pop();
    },

    /** Feu de camp : panneau de repos (vie et fioles reportées, touches). */
    restPanel(carry, maxHp, next) {
        const w = Math.min(460, width - 40), h = 190, x = (width - w) / 2, y = height * 0.5 - h / 2;
        push();
        noStroke();
        fill(16, 12, 8, 225);
        rect(x, y, w, h, 10);
        stroke(232, 160, 70, 160);
        noFill();
        rect(x + 4, y + 4, w - 8, h - 8, 8);
        noStroke();
        textFont('Cinzel');
        textAlign(CENTER, TOP);
        fill(255, 190, 90);
        textSize(26);
        text("Feu de camp", width / 2, y + 16);
        fill(225, 215, 195);
        textSize(14);
        text("Vie " + Math.ceil(carry.hp) + " / " + maxHp + " · fioles d'Estus : " + carry.estus, width / 2, y + 60);
        textSize(12);
        fill(190, 180, 160);
        // Texte dans une boîte : avec CENTER, x est le bord gauche de la boîte
        text("Votre vie et vos fioles ne reviennent pas. Ici, on boit sans risque.", x + 20, y + 86, w - 40);
        fill(255, 220, 150);
        textSize(13);
        text("E : boire une fiole (+" + Combat.PLAYER.estus.heal + ")   ·   Entrée : reprendre la route", width / 2, y + 122);
        fill(160);
        textSize(11);
        text("Prochaine étape : " + next, width / 2, y + 152);
        pop();
    },

    /**
     * Grand bandeau animé (VOUS ÊTES MORT, ENNEMI VAINCU) : le bandeau s'ouvre, le titre apparaît en
     * lettres espacées qui s'écartent lentement, puis (mort seulement) l'image passe au noir.
     * `kind` : 'death' ou 'victory' ; `t` : secondes depuis l'événement (courbes de Banner).
     */
    banner(kind, title, subtitle, t) {
        const st = Banner.state(kind, t);
        const c = kind === 'death' ? [176, 22, 18] : [232, 196, 110];
        const size = Math.min(64, width / 12);
        const bandH = size * 2.4 * st.band;
        push();
        noStroke();
        // Bandeau : noir au centre, fondu vers le haut et le bas
        const ctx = drawingContext;
        const g = ctx.createLinearGradient(0, height / 2 - bandH / 2, 0, height / 2 + bandH / 2);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.5, 'rgba(0,0,0,' + (0.78 * st.band) + ')');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, height / 2 - bandH / 2, width, bandH);
        // Titre en lettres espacées (dessinées une à une : l'espacement s'élargit avec le temps)
        textFont('Cinzel');
        textStyle(BOLD);
        textSize(size);
        textAlign(LEFT, CENTER);
        const gap = size * st.spacing;
        const letters = Array.from(title);
        const total = letters.reduce((sum, ch) => sum + textWidth(ch), 0) + gap * (letters.length - 1);
        let x = width / 2 - total / 2;
        fill(c[0], c[1], c[2], 255 * st.text);
        for (const ch of letters) {
            text(ch, x, height / 2 - size * 0.15);
            x += textWidth(ch) + gap;
        }
        textStyle(NORMAL);
        textAlign(CENTER, CENTER);
        textSize(Math.max(12, size * 0.26));
        fill(225, 215, 195, 230 * st.text);
        text(subtitle, width / 2, height / 2 + size * 0.75);
        // Fondu au noir avant la réapparition
        if (st.black > 0) {
            fill(0, 0, 0, 255 * st.black);
            rect(0, 0, width, height);
        }
        pop();
    },

    /** Petit rappel en haut au centre quand le jeu est en pause rapide (touche P). */
    pauseLabel(message) {
        push();
        textFont('Cinzel');
        textAlign(CENTER, TOP);
        textSize(16);
        fill(0, 0, 0, 160);
        rect(width / 2 - 150, 14, 300, 30, 4);
        fill(235, 225, 200);
        text(message, width / 2, 21);
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

Hud.RIPOSTE_LABEL = 0.8;   // secondes d'affichage de « Riposte ! »
Hud.BOSS_NAME = "Gardien du Brouillard";
Hud.PACK_NAME = "La meute des Creux";
Hud.CARD = 2.5;            // secondes de la carte de début d'étape
Hud.CAMP_WARNING = 1;      // secondes dans un coin avant l'avertissement

Hud.CONTROLS = [
    ["ZQSD / flèches", "se déplacer"],
    ["J  /  K", "attaque légère / lourde"],
    ["E", "boire une fiole d'Estus (soin, 1 s planté)"],
    ["Espace", "roulade : esquive le coup du boss"],
    ["L / Tab", "verrouiller la caméra sur le boss"],
    ["Astuce", "roulez quand le cône ou la ligne rouge se remplit"],
    ["Piliers", "ils bloquent les coups ; attirez la ruée dedans"]
];

/**
 * Effets visuels d'une vue (combat, écran titre, chaque côté d'un duel) : textes flottants des coups et
 * particules (particles.js). Durées en secondes. Rendu seulement : rien ici n'agit sur le combat.
 */
class Effects {
    constructor(cap = 320) {
        this.items = [];
        this.lastDodge = -Infinity;
        this.particles = new Particles(cap);
    }

    add(event, timeSeconds) {
        this.particles.fromEvent(event);
        if (event.type === 'hit') {
            const c = event.who === 'boss' ? [255, 80, 60] : [255, 230, 150];
            this.items.push({ kind: 'text', x: event.x, y: event.y - 20, text: "-" + event.damage, life: 0.8, age: 0, c: c });
        } else if (event.type === 'dodged' && timeSeconds - this.lastDodge > 0.5) {
            this.lastDodge = timeSeconds;
            this.items.push({ kind: 'text', x: event.x, y: event.y - 24, text: "esquivé !", life: 0.8, age: 0, c: [170, 200, 255] });
        } else if (event.type === 'mist') {
            this.items.push({ kind: 'text', x: event.x, y: event.y - 10, text: "brume !", life: 1, age: 0, c: [120, 255, 200] });
        } else if (event.type === 'camping') {
            this.items.push({ kind: 'text', x: event.x, y: event.y - 40, text: "dévoré par le brouillard !", life: 2, age: 0, c: [190, 120, 255] });
        } else if (event.type === 'creuxDeath') {
            this.items.push({ kind: 'text', x: event.x, y: event.y - 30, text: "Creux abattu", life: 1, age: 0, c: [200, 190, 255] });
        } else if (event.type === 'blocked') {
            this.items.push({ kind: 'text', x: event.x, y: event.y - 36, text: "paré par le pilier", life: 0.8, age: 0, c: [200, 200, 210] });
        } else if (event.type === 'crash' || event.type === 'crumble') {
            this.items.push({ kind: 'text', x: event.x, y: event.y - 40, text: event.type === 'crumble' ? "le pilier s'effondre !" : "le boss s'écrase !",
                life: 1.2, age: 0, c: [255, 230, 120] });
        }
    }

    /** `campfire` (facultatif) : position du feu, d'où montent les braises. */
    update(dt, campfire = null) {
        for (const e of this.items) {
            e.age += dt;
            e.y -= 30 * dt;
        }
        this.items = this.items.filter(e => e.age < e.life);
        if (campfire) this.particles.ambient(campfire, dt);
        this.particles.update(dt);
    }

    /** Particules (sous l'obscurité). */
    showParticles(glow = true) {
        this.particles.draw(glow);
    }

    /** Textes flottants (au-dessus de tout). */
    show() {
        push();
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(16);
        for (const e of this.items) {
            const a = 255 * (1 - e.age / e.life);
            fill(0, 0, 0, a * 0.6);
            text(e.text, e.x + 1, e.y + 1);
            fill(e.c[0], e.c[1], e.c[2], a);
            text(e.text, e.x, e.y);
        }
        pop();
    }
}
