// Mode debug : entrées et sorties du réseau du boss, état du boss. Lit les valeurs gardées par le
// contrôleur (lastInputs / lastOutputs) : rien n'est recalculé pour l'affichage.
const DebugPanel = {
    WIDTH: 250,

    /** Lignes du panneau : { label, value (0..1), threshold? } ; pure, testée. */
    rows(controller, boss) {
        const rows = [];
        if (controller && controller.lastInputs) {
            controller.lastInputs.forEach((v, i) => rows.push({ group: 'entrée', label: BossBrain.INPUT_LABELS[i], value: v }));
        }
        if (controller && controller.lastOutputs) {
            controller.lastOutputs.forEach((v, i) => rows.push({
                group: 'sortie', label: BossBrain.OUTPUT_LABELS[i], value: v,
                threshold: i === 0 || i === 5 ? 0.5 : BossBrain.THRESHOLD
            }));
        }
        return rows;
    },

    /** Texte d'état du boss. */
    state(boss, controller) {
        let s = boss.wandering ? "errance (wander)" : "décision du contrôleur";
        if (boss.dodge) s = "esquive (evade)";
        if (boss.stun) s = "étourdi (ruée contre un pilier)";
        if (boss.campTime > 0) s += " · coin " + boss.campTime.toFixed(1) + " / " + Combat.BOSS.camping.limit + " s";
        if (boss.action) {
            const what = { boss: "hallebarde", charge: "ruée", breath: "souffle" }[boss.action.kind] || boss.action.kind;
            s = what + " : " + ({ windup: "préparation", active: "frappe", recovery: "récupération" })[Combat.phase(boss.action.spec, boss.action.t)];
        }
        if (controller && controller.state) s += " · état « " + controller.state + " »";
        return s + (boss.enraged ? " · ENRAGÉ" : "");
    },

    /** `fps` (facultatif) : images par seconde mesurées par p5, affichées en tête du panneau. */
    draw(controller, boss, x, y, fps) {
        const rows = DebugPanel.rows(controller, boss);
        const h = 58 + rows.length * 16 + (rows.length ? 18 : 0);
        push();
        translate(x, y);
        noStroke();
        fill(8, 10, 16, 225);
        rect(0, 0, DebugPanel.WIDTH, h, 8);
        fill(255, 220, 0);
        textSize(12);
        textAlign(LEFT, TOP);
        text("DEBUG · " + (controller ? controller.name : "boss") + (fps !== undefined ? " · " + Math.round(fps) + " images/s" : ""), 10, 8);
        fill(200);
        textSize(10);
        text(DebugPanel.state(boss, controller), 10, 24);
        text("attentes : hallebarde " + boss.cooldown.toFixed(1) + " s · ruée " + boss.chargeCooldown.toFixed(1) + " s", 10, 36);
        text("souffle " + boss.breathCooldown.toFixed(1) + " s · esquive " + boss.dodgeCooldown.toFixed(1) + " s", 10, 48);
        let yy = 66;
        let group = null;
        for (const r of rows) {
            if (r.group !== group) {
                group = r.group;
                fill(140);
                text(group === 'entrée' ? "Entrées du réseau" : "Sorties du réseau", 10, yy - 2);
                yy += 12;
            }
            fill(190);
            text(r.label, 10, yy);
            fill(40);
            rect(100, yy + 1, 110, 9, 2);
            fill(r.group === 'sortie' && r.value > r.threshold ? color(255, 110, 60) : color(90, 170, 255));
            rect(100, yy + 1, 110 * Math.max(0, Math.min(1, r.value)), 9, 2);
            if (r.threshold !== undefined) {
                stroke(255);
                line(100 + 110 * r.threshold, yy - 1, 100 + 110 * r.threshold, yy + 12);
                noStroke();
            }
            fill(220);
            text(r.value.toFixed(2), 216, yy);
            yy += 16;
        }
        pop();
    },

    /** Dans l'arène : cercle de détection, rayons vers les obstacles, ligne de vue, portée d'attaque. */
    drawWorld(boss, player, arena) {
        boss.showDetection(player);
        push();
        // Ligne de vue : pointillés gris si un pilier l'interrompt (le joueur est à l'abri)
        const hidden = Combat.blocker(boss.pos, player.pos, boss.pillars);
        stroke(hidden ? color(150, 150, 160, 160) : color(255, 255, 255, 60));
        strokeWeight(1);
        drawingContext.setLineDash(hidden ? [6, 6] : []);
        line(boss.pos.x, boss.pos.y, player.pos.x, player.pos.y);
        drawingContext.setLineDash([]);
        for (const a of [-BossBrain.RAY_ANGLE, BossBrain.RAY_ANGLE]) {
            const d = arena.rayDistance(boss.pos, boss.facing + a, BossBrain.RAY_SIGHT, boss.pillars);
            stroke(d < BossBrain.RAY_SIGHT ? color(255, 120, 60) : color(120, 255, 120, 120));
            strokeWeight(1.5);
            line(boss.pos.x, boss.pos.y, boss.pos.x + Math.cos(boss.facing + a) * d, boss.pos.y + Math.sin(boss.facing + a) * d);
        }
        // Vitesse du boss
        stroke(0, 255, 255);
        line(boss.pos.x, boss.pos.y, boss.pos.x + boss.vel.x * 15, boss.pos.y + boss.vel.y * 15);
        // Errance : cercle et point visé du wander de vehicle.js (redessinés à partir de l'état du boss,
        // car le dessin de vehicle.js se fait pendant la simulation, hors du repère de la caméra)
        const w = DebugPanel.wanderGeometry(boss);
        if (w) {
            noFill();
            stroke(255);
            circle(w.center.x, w.center.y, boss.wanderRadius * 2);
            stroke(255, 255, 255, 80);
            line(boss.pos.x, boss.pos.y, w.center.x, w.center.y);
            noStroke();
            fill(255, 0, 0);
            circle(w.center.x, w.center.y, 8);
            fill(0, 200, 0);
            circle(w.target.x, w.target.y, 12);
            stroke(255, 255, 0);
            line(boss.pos.x, boss.pos.y, w.target.x, w.target.y);
        }
        pop();
    },

    /** Centre du cercle d'errance et point visé (mêmes formules que wander() de vehicle.js), ou null. */
    wanderGeometry(boss) {
        if (!boss.wandering || boss.vel.mag() === 0) return null;
        const heading = Math.atan2(boss.vel.y, boss.vel.x);
        const center = { x: boss.pos.x + Math.cos(heading) * boss.distanceCercle, y: boss.pos.y + Math.sin(heading) * boss.distanceCercle };
        const theta = boss.wanderTheta + heading;
        return { center: center, target: { x: center.x + boss.wanderRadius * Math.cos(theta), y: center.y + boss.wanderRadius * Math.sin(theta) } };
    }
};
