class Boundary {
    constructor(x1, y1, x2, y2, type = "wall") {
        // Sécurité contre les valeurs invalides
        if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
            x1 = x2 = y1 = y2 = 0;
        }
        this.a = createVector(x1, y1);
        this.b = createVector(x2, y2);
        this.type = type;
    }

    show() {
        if (this.type === "wall") {
            stroke(255);
            strokeWeight(2);
        } else if (this.type === "checkpoint") {
            stroke(0, 255, 0, 40);
            strokeWeight(1);
        }
        line(this.a.x, this.a.y, this.b.x, this.b.y);
        strokeWeight(1);
    }
}

function showTiles() {
    if (!currentTiles || currentTiles.length === 0) return;
    push();
    rectMode(CENTER);
    noFill();
    stroke(255, 255, 255, 20); // Gris très léger
    strokeWeight(1);
    for (let t of currentTiles) {
        // Dessin de la "carte"
        rect(t.x, t.y, t.w, t.h, 4);

        // Petite indication de type (optionnel)
        fill(255, 255, 255, 5);
        rect(t.x, t.y, t.w * 0.9, t.h * 0.9, 2);
    }
    pop();
}

// Tracé du circuit généré, gardé tant que la taille du canvas et les curseurs ne changent pas
var generatedTrackCache = null;

/**
 * Construit le circuit `id` (voir circuits.js) dans le canvas courant et remplit
 * les variables globales : walls, checkpoints, ligne de départ, tuiles.
 * regenerate = true force un nouveau tirage du circuit généré (curseurs modifiés).
 */
function buildCircuit(id, regenerate = false) {
    const def = Circuits.get(id);
    let track;
    if (def.kind === 'genere') {
        const key = [width, height, TRACK_WIDTH, TRACK_DIFFICULTY].join('x');
        if (regenerate || !generatedTrackCache || generatedTrackCache.key !== key) {
            const g = TrackGeometry.generate(width, height, TRACK_WIDTH, TRACK_DIFFICULTY, Math.random);
            generatedTrackCache = { key: key, center: g.center, tiles: g.tiles };
        }
        track = TrackGeometry.build(generatedTrackCache.center, width, height,
            { width: TRACK_WIDTH, tiles: generatedTrackCache.tiles });
    } else {
        track = Circuits.build(def, width, height);
    }

    walls = track.walls.map(s => new Boundary(s.a.x, s.a.y, s.b.x, s.b.y, "wall"));
    checkpoints = track.checkpoints.map(s => new Boundary(s.a.x, s.a.y, s.b.x, s.b.y, "checkpoint"));
    currentTiles = track.tiles;
    currentTrackPath = track.center;
    currentCircuitId = id;

    startX = track.start.x;
    startY = track.start.y;
    startAngle = track.start.angle;
    startCheckpointIndex = track.start.checkpointIndex;
    return track;
}

/** Monde courant, tel que le reçoivent l'entraîneur et la course. */
function currentWorld() {
    return {
        walls: walls, checkpoints: checkpoints, width: width, height: height,
        start: { x: startX, y: startY, angle: startAngle, checkpointIndex: startCheckpointIndex }
    };
}
