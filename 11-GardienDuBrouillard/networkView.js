// Schéma d'un réseau de neurones en direct (rendu seulement). Il LIT les activations que le réseau a gardées à
// son dernier calcul (NeuralNetwork.activations, ou celles qu'un contrôleur a mémorisées pour un Creux) : il ne
// rappelle jamais predict(), rien n'est recalculé pour l'affichage.
//
// - layout : position de chaque neurone (colonnes = couches) — pur ;
// - signals : force du signal sur chaque liaison = |poids × activation du neurone de départ| — pur ;
// - bossReading / packReading : sorties traduites en mots (quel comportement de pilotage en découle) — pur ;
// - draw : dessin p5 (neurones colorés par leur activation, liaisons épaisses quand le signal est fort).
const NetworkView = {
    MAX_EDGES: 140,        // on ne dessine que les liaisons qui portent le plus de signal (lisibilité, coût)

    /** Positions : { layers: [[{ x, y }]] } ; chaque couche est une colonne, neurones répartis en hauteur. */
    layout(sizes, x, y, w, h) {
        const cols = sizes.length;
        return {
            layers: sizes.map((n, l) => {
                const cx = x + (cols === 1 ? w / 2 : (w * l) / (cols - 1));
                const gap = h / Math.max(1, n);
                return Array.from({ length: n }, (_, i) => ({ x: cx, y: y + gap * (i + 0.5) }));
            })
        };
    },

    /**
     * Liaisons triées par signal décroissant (au plus `max`) : { l, i, j, w, signal }, où i est le neurone de la
     * couche l et j celui de la couche l + 1. `activations` : une activation par couche (entrées comprises).
     */
    signals(nn, activations, max = NetworkView.MAX_EDGES) {
        const out = [];
        for (let l = 0; l < nn.weights.length; l++) {
            const nIn = nn.sizes[l], nOut = nn.sizes[l + 1], w = nn.weights[l], a = activations[l];
            for (let j = 0; j < nOut; j++) {
                for (let i = 0; i < nIn; i++) {
                    const wij = w[j * nIn + i];
                    out.push({ l: l, i: i, j: j, w: wij, signal: Math.abs(wij * a[i]) });
                }
            }
        }
        out.sort((p, q) => q.signal - p.signal);
        return out.slice(0, max);
    },

    /** Sorties du boss en mots : ce que décide le réseau et quel comportement de pilotage l'exécute. */
    bossReading(outputs) {
        const d = BossBrain.decide(outputs);
        const lines = [];
        if (d.mode === 'approach') lines.push("Déplacement " + outputs[0].toFixed(2) + " > 0,5 : arrive (s'approcher en spirale)");
        else if (d.mode === 'retreat') lines.push("Déplacement " + outputs[0].toFixed(2) + " < 0,5 : flee (reculer)");
        else lines.push("Déplacement " + outputs[0].toFixed(2) + " ≈ 0,5 : rester à distance");
        lines.push("Latéral " + outputs[5].toFixed(2) + " : seek d'un point " + (d.strafe >= 0 ? "à droite" : "à gauche") + " sur le cercle");
        const names = { attack: "hallebarde", charge: "ruée (comme pursue)", breath: "souffle", dodge: "esquive (evade)" };
        for (const k of ['attack', 'charge', 'breath', 'dodge']) if (d[k]) lines.push("Sortie « " + names[k] + " » au-dessus de 0,6 : prête");
        return lines;
    },

    /** Sorties d'un Creux en mots : les poids de ses comportements. */
    packReading(outputs) {
        const d = PackBrain.decide(outputs);
        const pct = v => Math.round(v * 100) + " %";
        return ["pursue " + pct(d.pursue) + " · flanc " + pct(d.flank) + " · evade " + pct(d.evade) + " · flocking " + pct(d.flock),
            d.bite ? "Morsure au-dessus de 0,6 : il mord dès qu'il est à portée" : "Morsure sous 0,6 : il attend"];
    },

    /** Couleur d'une activation (0 sombre → 1 or). */
    shade(v) {
        const k = Math.max(0, Math.min(1, v));
        return [40 + 215 * k, 50 + 160 * k, 80 + 10 * k];
    },

    /**
     * Dessine le réseau dans le rectangle (x, y, w, h). `view` : { nn, activations, inputLabels, outputLabels,
     * thresholds (par sortie, ou undefined), title, reading (lignes de texte) }.
     */
    draw(view, x, y, w, h) {
        const { nn, activations } = view;
        if (!nn || !activations) return;
        push();
        noStroke();
        fill(8, 10, 16, 230);
        rect(x, y, w, h, 10);
        fill(255, 215, 120);
        textAlign(LEFT, TOP);
        textSize(13);
        text(view.title || "Réseau de neurones", x + 14, y + 10, w - 28);
        const labelW = Math.min(118, w * 0.27);
        const top = y + 62, bottom = y + h - 16 - (view.reading ? view.reading.length * 16 + 10 : 0);
        const L = NetworkView.layout(nn.sizes, x + labelW + 12, top, w - 2 * labelW - 24, bottom - top);
        // Liaisons : épaisseur et opacité selon le signal ; or si le poids est positif, bleu s'il est négatif
        const edges = NetworkView.signals(nn, activations);
        const strongest = edges.length ? edges[0].signal || 1 : 1;
        for (let k = edges.length - 1; k >= 0; k--) {
            const e = edges[k];
            const a = L.layers[e.l][e.i], b = L.layers[e.l + 1][e.j];
            const s = e.signal / strongest;
            stroke(e.w >= 0 ? color(255, 190, 80, 40 + 200 * s) : color(90, 170, 255, 40 + 200 * s));
            strokeWeight(0.5 + 3 * s);
            line(a.x, a.y, b.x, b.y);
        }
        // Neurones
        noStroke();
        const last = nn.sizes.length - 1;
        L.layers.forEach((layer, l) => {
            const r = Math.max(4, Math.min(9, (bottom - top) / layer.length / 2.6));
            layer.forEach((p, i) => {
                const v = activations[l][i];
                const th = l === last && view.thresholds ? view.thresholds[i] : undefined;
                const on = th !== undefined && v > th;
                if (on) {
                    fill(255, 210, 90, 90);
                    circle(p.x, p.y, r * 3.2);
                }
                const c = NetworkView.shade(v);
                fill(c[0], c[1], c[2]);
                stroke(on ? color(255, 230, 140) : color(20));
                strokeWeight(on ? 2 : 1);
                circle(p.x, p.y, r * 2);
                noStroke();
                textSize(10);
                if (l === 0 && view.inputLabels) {
                    fill(200);
                    textAlign(RIGHT, CENTER);
                    text(view.inputLabels[i] + " " + v.toFixed(2), p.x - r - 4, p.y);
                } else if (l === last && view.outputLabels) {
                    fill(on ? color(255, 220, 120) : color(210));
                    textAlign(LEFT, CENTER);
                    text(view.outputLabels[i] + " " + v.toFixed(2), p.x + r + 4, p.y);
                }
            });
        });
        // Légende des colonnes et lecture en mots
        fill(150);
        textSize(10);
        textAlign(CENTER, TOP);
        const names = ["entrées"].concat(nn.sizes.slice(1, -1).map(() => "cachés"), ["sorties"]);
        L.layers.forEach((layer, l) => text(names[l], layer[0].x, top - 14));
        if (view.reading) {
            textAlign(LEFT, TOP);
            textSize(12);
            fill(255, 225, 150);
            view.reading.forEach((line, k) => text("→ " + line, x + 14, bottom + 8 + k * 16, w - 28));
        }
        pop();
    }
};
