/**
 * Géométrie des circuits, sans p5 : points sous forme de tableaux [x, y] ou [x, y, l]
 * (l = facteur de largeur local, pour les passages étroits).
 *
 * Les calculs du circuit généré (grille « LEGO », Catmull-Rom, lissage, ré-échantillonnage,
 * murs, checkpoints tous les 4 points, départ à 5 % du tracé) sont ceux de la version
 * d'origine de Track.js, simplement rendus purs : l'aléatoire est injecté (rng).
 */
const TrackGeometry = {
    SPACING: 8,        // distance entre deux points du tracé ré-échantillonné
    CP_STEP: 4,        // un checkpoint tous les 4 points
    MARGIN: 100,       // marge totale autour du circuit dans le canvas
    NORMAL_SPAN: 15,   // demi-fenêtre (en points) pour estimer la normale du circuit généré

    /** Spline de Catmull-Rom fermée, sur toutes les coordonnées de chaque point. */
    interpolate(points, resolution = 10) {
        const out = [];
        const n = points.length;
        const dims = points[0].length;
        for (let i = 0; i < n; i++) {
            const p0 = points[(i - 1 + n) % n], p1 = points[i];
            const p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
            // Même boucle flottante que l'original (le nombre de pas en dépend)
            for (let t = 0; t < 1; t += 1 / resolution) {
                const t2 = t * t, t3 = t2 * t;
                const p = [];
                for (let d = 0; d < dims; d++) {
                    p.push(0.5 * (
                        (2 * p1[d]) +
                        (-p0[d] + p2[d]) * t +
                        (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 +
                        (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3
                    ));
                }
                out.push(p);
            }
        }
        return out;
    },

    /** Ré-échantillonnage à espacement uniforme ; un nombre entier de segments ferme la boucle. */
    resample(points, spacing = TrackGeometry.SPACING) {
        const n = points.length;
        const dims = points[0].length;
        const seg = [];
        let total = 0;
        for (let i = 0; i < n; i++) {
            const a = points[i], b = points[(i + 1) % n];
            const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
            seg.push(d);
            total += d;
        }
        const count = Math.round(total / spacing);
        const step = total / count;
        const out = [];
        let acc = 0, cur = 0;
        for (let i = 0; i < count; i++) {
            const target = i * step;
            while (acc + seg[cur] < target && cur < n - 1) {
                acc += seg[cur];
                cur++;
            }
            const t = (target - acc) / seg[cur];
            const a = points[cur], b = points[(cur + 1) % n];
            const p = [];
            for (let d = 0; d < dims; d++) p.push(a[d] + (b[d] - a[d]) * t);
            out.push(p);
        }
        return out;
    },

    /** Lissage laplacien multi-passes avec une pincée d'aléatoire (circuit généré). */
    smooth(points, factor, iterations, difficulty, rng) {
        let current = points.map(p => p.slice());
        const jaggedness = (difficulty / 50) * 0.15; // map(difficulté, 0, 50, 0, 0.15)
        for (let iter = 0; iter < iterations; iter++) {
            const next = [];
            const n = current.length;
            for (let i = 0; i < n; i++) {
                const prev = current[(i - 1 + n) % n], p = current[i], nxt = current[(i + 1) % n];
                const jitterX = (rng() - 0.5) * jaggedness * 100;
                const jitterY = (rng() - 0.5) * jaggedness * 100;
                const midX = (prev[0] + nxt[0]) / 2 + jitterX;
                const midY = (prev[1] + nxt[1]) / 2 + jitterY;
                next.push([p[0] + (midX - p[0]) * factor, p[1] + (midY - p[1]) * factor]);
            }
            current = next;
        }
        return current;
    },

    /**
     * Circuit généré (moteur « LEGO » d'origine) : boucle aléatoire sur une grille dont
     * la taille des cases dépend de la largeur, longueur selon la complexité.
     * Retourne { center, tiles } dans le repère du canvas (avant normalisation).
     */
    generate(W, H, trackWidth, difficulty, rng) {
        const cellSize = Math.max(40, trackWidth * 1.5);
        const cols = Math.floor(W / cellSize);
        const rows = Math.floor(H / cellSize);
        const grid = [];
        for (let i = 0; i < cols; i++) grid[i] = new Array(rows).fill(false);

        let path = [];
        const start = [Math.floor(cols / 2), Math.floor(rows / 2)];
        let attempts = 0;
        const maxAttempts = 50000;

        function findLoop(x, y, tx, ty, current, minLen) {
            attempts++;
            if (attempts > maxAttempts) return false;
            if (current.length >= minLen && Math.abs(x - tx) + Math.abs(y - ty) === 1) return true;
            if (current.length >= cols * rows * 0.98) return false;
            const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]].sort(() => rng() - 0.5);
            for (const [dx, dy] of directions) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !grid[nx][ny]) {
                    grid[nx][ny] = true;
                    current.push([nx, ny]);
                    if (findLoop(nx, ny, tx, ty, current, minLen)) return true;
                    current.pop();
                    grid[nx][ny] = false;
                }
            }
            return false;
        }

        let success = false;
        if (cols > 0 && rows > 0) {
            grid[start[0]][start[1]] = true;
            path.push(start);
            const targetLen = Math.min(cols * rows - 2, 10 + Math.floor(difficulty * 2.5));
            success = findLoop(start[0], start[1], start[0], start[1], path, targetLen);
        }
        if (!success || path.length < 4) {
            // Repli : ovale sur la grille
            path = [[1, 1], [cols - 2, 1], [cols - 2, rows - 2], [1, rows - 2]];
        }

        const cellW = W / cols, cellH = H / rows;
        const tiles = [];
        const world = [];
        for (const [gx, gy] of path) {
            tiles.push({ x: (gx + 0.5) * cellW, y: (gy + 0.5) * cellH, w: cellW, h: cellH, gx: gx, gy: gy });
            world.push([(gx + 0.5) * cellW, (gy + 0.5) * cellH]);
        }
        const passes = Math.max(3, 15 - Math.floor(difficulty / 4));
        let smooth = TrackGeometry.interpolate(world, 15);
        smooth = TrackGeometry.smooth(smooth, 0.5, passes, difficulty, rng);
        return { center: TrackGeometry.resample(smooth, TrackGeometry.SPACING), tiles: tiles };
    },

    /**
     * Tracé central d'un circuit défini par des points de contrôle (données de circuits.js).
     * L'espacement est ajusté pour que le nombre de points soit un multiple de CP_STEP :
     * les checkpoints sont alors régulièrement espacés, y compris entre le dernier et le premier.
     */
    fromControlPoints(points, resolution = 12) {
        const smooth = TrackGeometry.interpolate(points, resolution);
        let total = 0;
        for (let i = 0; i < smooth.length; i++) {
            const a = smooth[i], b = smooth[(i + 1) % smooth.length];
            total += Math.hypot(b[0] - a[0], b[1] - a[1]);
        }
        const blocks = Math.max(1, Math.round(total / (TrackGeometry.SPACING * TrackGeometry.CP_STEP)));
        return TrackGeometry.resample(smooth, total / (blocks * TrackGeometry.CP_STEP));
    },

    /**
     * Construit murs et checkpoints à partir du tracé central, puis centre et met
     * à l'échelle le tout dans un canvas W × H (marge MARGIN).
     * options : width (largeur de base), normalSpan, maxScale (1 = ne jamais agrandir), tiles.
     * Retourne des segments simples { a: {x, y}, b: {x, y} }.
     */
    build(center, W, H, options) {
        const width = options.width;
        const span = options.normalSpan || TrackGeometry.NORMAL_SPAN;
        const maxScale = options.maxScale === undefined ? 1 : options.maxScale;
        const n = center.length;
        const inner = [], outer = [];
        for (let i = 0; i < n; i++) {
            const p1 = center[(i - span + n) % n], p2 = center[(i + span) % n];
            let nx = -(p2[1] - p1[1]), ny = p2[0] - p1[0];
            const len = Math.hypot(nx, ny) || 1;
            nx /= len; ny /= len;
            const p = center[i];
            const halfW = (p.length > 2 ? p[2] * width : width) / 2;
            inner.push([p[0] + nx * halfW, p[1] + ny * halfW]);
            outer.push([p[0] - nx * halfW, p[1] - ny * halfW]);
        }

        // Normalisation : on centre la boîte englobante des murs dans le canvas
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of inner.concat(outer)) {
            if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
        }
        const trackW = (maxX - minX) || 1, trackH = (maxY - minY) || 1;
        const scale = Math.min(maxScale, Math.min((W - TrackGeometry.MARGIN) / trackW, (H - TrackGeometry.MARGIN) / trackH));
        const shiftX = (W - trackW * scale) / 2 - minX * scale;
        const shiftY = (H - trackH * scale) / 2 - minY * scale;
        const tr = p => [p[0] * scale + shiftX, p[1] * scale + shiftY];
        const innerT = inner.map(tr), outerT = outer.map(tr), centerT = center.map(tr);
        const tiles = (options.tiles || []).map(t => Object.assign({}, t, {
            x: t.x * scale + shiftX, y: t.y * scale + shiftY, w: t.w * scale, h: t.h * scale
        }));

        const seg = (p, q) => ({ a: { x: p[0], y: p[1] }, b: { x: q[0], y: q[1] } });
        const walls = [], checkpoints = [];
        for (let i = 0; i < n; i++) {
            walls.push(seg(innerT[i], innerT[(i + 1) % n]));
            walls.push(seg(outerT[i], outerT[(i + 1) % n]));
            if (i % TrackGeometry.CP_STEP === 0) checkpoints.push(seg(innerT[i], outerT[i]));
        }

        const startIdx = Math.floor(n * 0.05);
        const nextIdx = (startIdx + 10) % n;
        const sx = centerT[startIdx][0], sy = centerT[startIdx][1];
        const start = {
            x: sx, y: sy,
            angle: Math.atan2(centerT[nextIdx][1] - sy, centerT[nextIdx][0] - sx),
            checkpointIndex: (Math.floor(startIdx / TrackGeometry.CP_STEP) + 1) % checkpoints.length
        };
        return { center: centerT, inner: innerT, outer: outerT, walls, checkpoints, start, tiles, scale };
    },

    /** Vrai si les segments [p1, p2] et [p3, p4] se coupent (test d'orientation). */
    segmentsIntersect(p1, p2, p3, p4) {
        const ccw = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
        return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
    },

    /**
     * Murs qui se croisent (validation des circuits) : renvoie le nombre de croisements
     * entre segments non voisins des murs intérieur et extérieur.
     */
    wallCrossings(track) {
        const lines = [track.inner, track.outer];
        const segs = [];
        lines.forEach((pts, w) => {
            for (let i = 0; i < pts.length; i++) segs.push({ w, i, a: pts[i], b: pts[(i + 1) % pts.length], n: pts.length });
        });
        let count = 0;
        for (let s = 0; s < segs.length; s++) {
            for (let t = s + 1; t < segs.length; t++) {
                const A = segs[s], B = segs[t];
                if (A.w === B.w) {
                    const d = Math.abs(A.i - B.i);
                    if (d <= 1 || d >= A.n - 1) continue; // segments voisins
                }
                if (TrackGeometry.segmentsIntersect(A.a, A.b, B.a, B.b)) count++;
            }
        }
        return count;
    }
};
