// Courbes de l'entraînement, pensées pour être lues par tout le monde :
//   1. « Le champion gagne… » : taux de victoire du champion sur les combats d'examen (0 à 100 %).
//      Elle ne fait que monter : on ne remplace le champion que par un boss qui gagne plus souvent
//      (sauf si l'on change les réglages du joueur robot : le champion est alors réexaminé).
//   2. « Note des boss » : fitness moyenne et meilleure de chaque génération, lissées (moyenne glissante),
//      car d'une génération à l'autre le hasard des combats les fait beaucoup varier.
// Les calculs (lissage, sous-échantillonnage, points) sont des fonctions pures, testées ; draw() trace.
const FitnessChart = {
    MAX_POINTS: 300,
    SMOOTH: 10,

    /** Moyenne glissante sur les `window` dernières valeurs (fenêtre plus courte au début). */
    smooth(values, window = FitnessChart.SMOOTH) {
        const out = [];
        let sum = 0;
        for (let i = 0; i < values.length; i++) {
            sum += values[i];
            if (i >= window) sum -= values[i - window];
            out.push(sum / Math.min(i + 1, window));
        }
        return out;
    },

    /** Au plus `max` éléments régulièrement espacés, le premier et le dernier toujours gardés. */
    downsample(list, max = FitnessChart.MAX_POINTS) {
        if (list.length <= max) return list.slice();
        const out = [];
        for (let k = 0; k < max; k++) out.push(list[Math.round((k * (list.length - 1)) / (max - 1))]);
        return out;
    },

    /** Points {x, y} d'une série dans un cadre w × h, pour des valeurs entre min et max (y vers le bas). */
    points(values, w, h, min, max) {
        if (max - min < 1e-9) { max += 1; min -= 1; }
        const n = values.length;
        return values.map((v, i) => ({
            x: n === 1 ? w / 2 : (i * w) / (n - 1),
            y: h - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * h
        }));
    },

    /** Séries prêtes à tracer à partir de l'historique de l'entraînement. */
    series(history) {
        const h = FitnessChart.downsample(history);
        const all = history;
        const meanS = FitnessChart.downsample(FitnessChart.smooth(all.map(e => e.mean)));
        const bestS = FitnessChart.downsample(FitnessChart.smooth(all.map(e => e.best)));
        return {
            generations: h.map(e => e.generation),
            champion: h.map(e => (e.championWinRate || 0) * 100),
            genWin: FitnessChart.downsample(FitnessChart.smooth(all.map(e => e.winRate * 100))),
            mean: meanS,
            best: bestS,
            min: meanS.length ? Math.min(...meanS) : 0,
            max: bestS.length ? Math.max(...bestS) : 1
        };
    },

    curve(pts, c, weight) {
        stroke(c);
        strokeWeight(weight);
        noFill();
        beginShape();
        for (const q of pts) vertex(q.x, q.y);
        endShape();
    },

    panel(title, x, y, w, h) {
        noStroke();
        fill(232, 220, 184);
        textSize(12);
        textAlign(LEFT, BASELINE);
        text(title, x, y - 8);
        stroke(60);
        strokeWeight(1);
        noFill();
        rect(x, y, w, h);
    },

    /** `who` : ce qui est noté (« des boss » par défaut, « de la meute » pour le niveau 1). */
    draw(history, x, y, w, h, who = "des boss") {
        const s = FitnessChart.series(history);
        const hh = (h - 40) / 2;
        push();
        noStroke();
        fill(10, 12, 18, 225);
        rect(x - 12, y - 30, w + 24, h + 66, 8);

        // 1. Victoires du champion
        FitnessChart.panel("Le champion gagne… (combats d'examen)", x, y, w, hh);
        noStroke();
        fill(130);
        textSize(10);
        textAlign(RIGHT, CENTER);
        text("100 %", x - 3, y);
        text("0 %", x - 3, y + hh);
        stroke(70);
        drawingContext.setLineDash([3, 4]);
        line(x, y + hh / 2, x + w, y + hh / 2);
        drawingContext.setLineDash([]);
        push();
        translate(x, y);
        FitnessChart.curve(FitnessChart.points(s.genWin, w, hh, 0, 100), color(120, 120, 140), 1);
        FitnessChart.curve(FitnessChart.points(s.champion, w, hh, 0, 100), color(255, 190, 60), 2.5);
        pop();
        const last = history[history.length - 1];
        noStroke();
        fill(255, 190, 60);
        textAlign(LEFT, TOP);
        text(last ? Math.round((last.championWinRate || 0) * 100) + " %" : "—", x + 4, y + 3);

        // 2. Note des boss
        const y2 = y + hh + 40;
        FitnessChart.panel("Note (fitness) " + who + ", lissée", x, y2, w, hh);
        push();
        translate(x, y2);
        if (s.min < 0 && s.max > 0) {
            const y0 = hh - ((0 - s.min) / (s.max - s.min)) * hh;
            stroke(70);
            drawingContext.setLineDash([3, 4]);
            line(0, y0, w, y0);
            drawingContext.setLineDash([]);
        }
        FitnessChart.curve(FitnessChart.points(s.mean, w, hh, s.min, s.max), color(80, 170, 255), 2);
        FitnessChart.curve(FitnessChart.points(s.best, w, hh, s.min, s.max), color(255, 120, 80), 1.5);
        pop();

        // Légende
        noStroke();
        textSize(10);
        textAlign(LEFT, TOP);
        const ly = y2 + hh + 8;
        fill(255, 190, 60);
        text("■ champion", x, ly);
        fill(120, 120, 140);
        text("■ victoires de toute la génération", x + 80, ly);
        fill(80, 170, 255);
        text("■ note moyenne", x, ly + 16);
        fill(255, 120, 80);
        text("■ meilleure note", x + 100, ly + 16);
        fill(150);
        textAlign(RIGHT, TOP);
        text(history.length ? "génération " + history[history.length - 1].generation : "aucune génération", x + w, ly + 32);
        pop();
    }
};
