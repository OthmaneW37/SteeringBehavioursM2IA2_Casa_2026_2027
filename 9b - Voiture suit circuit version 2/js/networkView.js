/**
 * Affichage en direct du réseau de la voiture en tête (panneau dessiné sur le canvas).
 *
 * Colonnes : entrées, couches cachées, sorties. Les neurones s'allument selon leur
 * activation courante (lue dans brain.activations, rien n'est recalculé). Les connexions
 * ont une épaisseur proportionnelle à |poids| et une couleur selon le signe
 * (bleu positif, rouge négatif).
 *
 * Pour rester léger, les connexions sont dessinées une seule fois dans un tampon
 * (createGraphics) et redessinées seulement quand le cerveau affiché change,
 * au plus toutes les REDRAW_MS millisecondes. Les calculs de position et de style
 * sont des fonctions pures, testées sous Node.
 */
const NetworkView = {
    WIDTH: 300,
    HEIGHT: 220,
    PADDING: 16,
    REDRAW_MS: 400,
    INPUT_LABELS: ["R1", "R2", "R3", "R4", "R5", "Gauche", "Droite", "Vit"],
    OUTPUT_LABELS: ["Virage", "Poussée", "Frein"],

    /** Positions des neurones : une colonne par couche, centrée verticalement. */
    layout(sizes, w, h, padding = NetworkView.PADDING) {
        const cols = sizes.length;
        const usableW = w - 2 * padding - 40; // place pour les étiquettes de sortie
        return sizes.map((n, l) => {
            const x = padding + 18 + (cols === 1 ? 0 : (l * usableW) / (cols - 1));
            const gap = Math.min(22, (h - 2 * padding) / Math.max(1, n));
            const top = h / 2 - (gap * (n - 1)) / 2;
            const nodes = [];
            for (let i = 0; i < n; i++) nodes.push({ x: x, y: top + i * gap });
            return nodes;
        });
    },

    /** Rayon d'un neurone : plus petit dans les couches nombreuses. */
    nodeRadius(n) {
        return Math.max(1.5, Math.min(6, 90 / n));
    },

    /** Plus grand |poids| du réseau (normalisation des épaisseurs). */
    maxAbsWeight(brain) {
        let m = 0;
        for (const w of brain.weights) for (let k = 0; k < w.length; k++) if (Math.abs(w[k]) > m) m = Math.abs(w[k]);
        return m || 1;
    },

    /** Style d'une connexion : épaisseur et couleur RGBA selon le poids. */
    edgeStyle(weight, maxAbs) {
        const t = Math.min(1, Math.abs(weight) / maxAbs);
        const alpha = Math.round(30 + 200 * t);
        return {
            weight: 0.3 + 2.7 * t,
            color: weight >= 0 ? [56, 189, 248, alpha] : [248, 113, 113, alpha]
        };
    },

    /** Couleur d'un neurone selon son activation dans [0, 1] (éteint → jaune vif). */
    nodeColor(activation) {
        const a = Math.max(0, Math.min(1, activation));
        return [Math.round(40 + 215 * a), Math.round(40 + 200 * a), Math.round(60 * (1 - a)) + 20];
    },

    /** Texte des sorties : virage (gauche/droite), poussée, frein. */
    outputTexts(outputs) {
        if (!outputs) return [];
        const texts = [];
        const turn = outputs[0] * 2 - 1;
        texts.push("Virage : " + (turn < 0 ? "gauche " : "droite ") + Math.abs(turn).toFixed(2));
        if (outputs.length > 1) texts.push("Poussée : " + outputs[1].toFixed(2));
        if (outputs.length > 2) {
            texts.push("Frein : " + outputs[2].toFixed(2) + (outputs[2] > CarTypes.BRAKE_THRESHOLD ? " (actif)" : ""));
        }
        return texts;
    }
};

/** Panneau p5 avec tampon des connexions. */
class NetworkPanel {
    constructor() {
        this.buffer = null;
        this.brain = null;
        this.lastRedraw = -Infinity;
    }

    renderEdges(brain) {
        const W = NetworkView.WIDTH, H = NetworkView.HEIGHT;
        if (!this.buffer) this.buffer = createGraphics(W, H);
        const g = this.buffer;
        g.clear();
        const pos = NetworkView.layout(brain.sizes, W, H);
        const maxAbs = NetworkView.maxAbsWeight(brain);
        for (let l = 0; l < brain.weights.length; l++) {
            const w = brain.weights[l];
            const nIn = brain.sizes[l];
            for (let j = 0; j < brain.sizes[l + 1]; j++) {
                for (let i = 0; i < nIn; i++) {
                    const s = NetworkView.edgeStyle(w[j * nIn + i], maxAbs);
                    g.stroke(s.color[0], s.color[1], s.color[2], s.color[3]);
                    g.strokeWeight(s.weight);
                    g.line(pos[l][i].x, pos[l][i].y, pos[l + 1][j].x, pos[l + 1][j].y);
                }
            }
        }
        this.brain = brain;
        this.lastRedraw = millis();
    }

    draw(car, x, y) {
        const W = NetworkView.WIDTH, H = NetworkView.HEIGHT;
        push();
        translate(x, y);
        noStroke();
        fill(10, 15, 25, 210);
        rect(0, 0, W, H + 46, 8);
        if (!car) { pop(); return; }

        const brain = car.brain;
        if (brain !== this.brain && millis() - this.lastRedraw > NetworkView.REDRAW_MS) this.renderEdges(brain);
        if (this.buffer && this.brain && this.brain.sizes.join() === brain.sizes.join()) image(this.buffer, 0, 0);

        const pos = NetworkView.layout(brain.sizes, W, H);
        for (let l = 0; l < pos.length; l++) {
            const r = NetworkView.nodeRadius(pos[l].length);
            for (let i = 0; i < pos[l].length; i++) {
                const c = NetworkView.nodeColor(brain.activations[l][i]);
                stroke(0);
                strokeWeight(0.5);
                fill(c[0], c[1], c[2]);
                circle(pos[l][i].x, pos[l][i].y, r * 2);
            }
        }

        // Étiquettes des entrées et des sorties
        noStroke();
        fill(200);
        textSize(9);
        textAlign(RIGHT, CENTER);
        pos[0].forEach((p, i) => text(NetworkView.INPUT_LABELS[i] || "", p.x - 7, p.y));
        textAlign(LEFT, CENTER);
        const last = pos[pos.length - 1];
        last.forEach((p, i) => text(NetworkView.OUTPUT_LABELS[i] || "", p.x + 8, p.y));

        // Valeurs des sorties
        textSize(11);
        fill(230);
        textAlign(LEFT, TOP);
        NetworkView.outputTexts(car.lastOutputs).forEach((t, i) => text(t, 10 + (i % 2) * 145, H + 6 + Math.floor(i / 2) * 16));
        textSize(9);
        fill(140);
        textAlign(RIGHT, TOP);
        text("[" + brain.sizes.join("-") + "]  " + car.type.label, W - 8, 6);
        pop();
    }
}
