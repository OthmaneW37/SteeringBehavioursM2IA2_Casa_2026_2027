/**
 * Catalogue des circuits : données uniquement.
 *
 * Les points de contrôle sont donnés dans un canvas de référence 1000 × 700 ; le tracé
 * passe par eux (spline de Catmull-Rom fermée), puis il est centré et mis à l'échelle
 * dans le vrai canvas. Un point [x, y, l] porte un facteur de largeur local l
 * (1 = largeur de base, 0.45 = goulet).
 *
 * kind : 'genere'   circuit aléatoire des curseurs (complexité, largeur) : réglage d'origine
 *        'standard' circuits réguliers
 *        'tueur'    circuits difficiles (épingles, chicanes, goulets, ligne droite + virage serré)
 *
 * normalSpan : demi-fenêtre (en points du tracé) pour estimer la normale ; petite dans les
 * circuits à virages serrés, pour que les murs suivent fidèlement les épingles.
 *
 * Un test vérifie chaque circuit : points dans le canvas, checkpoints ordonnés, boucle
 * fermée, murs qui ne se croisent pas.
 */
const Circuits = {
    REFERENCE: { width: 1000, height: 700 },

    LIST: [
        {
            id: 'genere', kind: 'genere', name: "Circuit généré",
            description: "Boucle aléatoire réglée par les curseurs complexité et largeur (réglage d'origine)."
        },

        // --- Standards ---
        {
            id: 'ovale', kind: 'standard', name: "Ovale", width: 100, normalSpan: 8,
            description: "Un anneau large et régulier, pour apprendre à tourner.",
            points: [[880, 350], [829, 465], [690, 549], [500, 580], [310, 549], [171, 465],
                [120, 350], [171, 235], [310, 151], [500, 120], [690, 151], [829, 235]]
        },
        {
            id: 'haricot', kind: 'standard', name: "Haricot", width: 100, normalSpan: 8,
            description: "Un virage rentrant au milieu : il faut tourner dans les deux sens.",
            points: [[150, 200], [400, 120], [650, 180], [850, 150], [900, 350], [800, 550],
                [600, 590], [480, 450], [330, 580], [140, 470]]
        },
        {
            id: 'grand-prix', kind: 'standard', name: "Grand Prix", width: 95, normalSpan: 8,
            description: "Deux longues lignes droites reliées par des courbes moyennes et un S.",
            points: [[150, 140], [500, 110], [850, 140], [900, 290], [790, 365], [860, 520],
                [700, 610], [400, 610], [150, 560], [100, 350]]
        },

        // --- Tueurs ---
        {
            id: 'epingles', kind: 'tueur', name: "Les Épingles", width: 70, normalSpan: 3,
            description: "Six lignes verticales reliées par cinq virages en épingle de 180°.",
            points: [[150, 260], [150, 390], [150, 520], [159, 553], [183, 576], [215, 585], [248, 576],
                [271, 553], [280, 520], [280, 390], [280, 260], [289, 228], [313, 204], [345, 195],
                [377, 204], [401, 228], [410, 260], [410, 390], [410, 520], [419, 553], [443, 576],
                [475, 585], [508, 576], [531, 553], [540, 520], [540, 390], [540, 260], [549, 228],
                [573, 204], [605, 195], [638, 204], [661, 228], [670, 260], [670, 390], [670, 520],
                [679, 553], [703, 576], [735, 585], [768, 576], [791, 553], [800, 520], [800, 390],
                [800, 260], [800, 170], [792, 120], [770, 98], [740, 90], [500, 90], [260, 90],
                [210, 90], [180, 98], [158, 120], [150, 150]]
        },
        {
            id: 'chicanes', kind: 'tueur', name: "Les Chicanes", width: 70, normalSpan: 3,
            description: "Une ligne droite hachée de chicanes rapprochées : gauche, droite, gauche...",
            points: [[150, 570], [500, 580], [850, 570], [910, 470], [910, 260], [860, 160],
                [780, 150], [740, 215], [670, 215], [630, 150], [560, 150], [520, 215], [450, 215],
                [410, 150], [340, 150], [300, 215], [230, 215], [160, 200], [110, 280], [100, 470]]
        },
        {
            id: 'goulets', kind: 'tueur', name: "Les Goulets", width: 110, normalSpan: 6,
            description: "Une piste large qui se resserre brutalement à moins de la moitié en trois endroits.",
            points: [[150, 200, 1], [350, 110, 1], [550, 150, 0.45], [700, 120, 0.45], [870, 200, 1],
                [900, 400, 1], [780, 580, 0.5], [600, 600, 0.5], [450, 480, 1], [300, 590, 1],
                [130, 480, 0.45], [100, 330, 1]]
        },
        {
            id: 'ligne-droite-fatale', kind: 'tueur', name: "Ligne droite fatale", width: 70, normalSpan: 3,
            description: "De longues lignes droites qui finissent en épingle très serrée : il faut freiner.",
            points: [[200, 610], [500, 610], [820, 610], [855, 603], [873, 585], [880, 560], [873, 535],
                [855, 517], [820, 510], [600, 510], [380, 505], [320, 450], [330, 320], [450, 220],
                [650, 165], [800, 163], [835, 163], [863, 156], [883, 136], [890, 108], [883, 81],
                [863, 60], [835, 53], [800, 53], [500, 55], [200, 60], [120, 110], [95, 250], [95, 450], [120, 560]]
        }
    ],

    // Préréglages du menu « Jeu de circuits »
    SETS: {
        genere: { label: "Circuit généré (défaut)", ids: ['genere'] },
        standards: { label: "Circuits standards", ids: ['ovale', 'haricot', 'grand-prix'] },
        tueurs: { label: "Circuits tueurs", ids: ['epingles', 'chicanes', 'goulets', 'ligne-droite-fatale'] },
        melange: { label: "Mélange", ids: ['ovale', 'epingles', 'haricot', 'chicanes', 'grand-prix', 'goulets', 'ligne-droite-fatale'] }
    },

    ids() {
        return Circuits.LIST.map(c => c.id);
    },

    get(id) {
        const c = Circuits.LIST.find(c => c.id === id);
        if (!c) throw new RangeError("Circuit inconnu : " + id);
        return c;
    },

    /** Identifiant du préréglage correspondant à une liste, ou 'personnalise'. */
    setFor(ids) {
        for (const key in Circuits.SETS) {
            const set = Circuits.SETS[key].ids;
            if (set.length === ids.length && set.every((id, i) => ids[i] === id)) return key;
        }
        return 'personnalise';
    },

    /**
     * Géométrie d'un circuit de données dans un canvas W × H (TrackGeometry.build).
     * Le circuit généré passe par TrackGeometry.generate (voir Track.js).
     */
    build(def, W, H) {
        const center = TrackGeometry.fromControlPoints(def.points);
        return TrackGeometry.build(center, W, H, { width: def.width, normalSpan: def.normalSpan, maxScale: 1.6 });
    }
};
