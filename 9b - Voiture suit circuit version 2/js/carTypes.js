/**
 * Types de voitures : données uniquement. Car.js lit toutes ses valeurs physiques ici.
 *
 * speedFactor  vitesse max = speedFactor × curseur « Vitesse max de référence » (6 par défaut)
 * maxForce     accélération max par image (limite de la force de pilotage)
 * maxTurn      écart d'angle max (radians) entre le cap actuel et le cap désiré
 * brakeDecel   décélération max quand le réseau freine (3e sortie > BRAKE_THRESHOLD)
 * grip         adhérence : part de la force latérale conservée (1 = colle à la route)
 * mass         inertie : accélération = force / masse
 * width,height taille (la collision utilise width)
 * sightDist    portée des capteurs (pixels) ; fov champ de vision (radians)
 *
 * La Berline reprend exactement les constantes d'origine
 * (maxForce 0.5, rectangle 10 × 20, capteurs 150 px sur PI / 1.5).
 */
const CarTypes = {
    DEFAULT: 'berline',
    BRAKE_THRESHOLD: 0.5,

    LIST: [
        {
            id: 'berline', label: "Berline", description: "Équilibrée : le réglage d'origine.",
            color: [255, 255, 255], speedFactor: 1, maxForce: 0.5, maxTurn: 0.5, brakeDecel: 0.3,
            grip: 1, mass: 1, width: 10, height: 20, sightDist: 150, fov: Math.PI / 1.5
        },
        {
            id: 'sportive', label: "Sportive", description: "Très rapide, freine mal, tourne moins vite.",
            color: [239, 68, 68], speedFactor: 1.5, maxForce: 0.55, maxTurn: 0.35, brakeDecel: 0.15,
            grip: 0.9, mass: 1, width: 10, height: 22, sightDist: 180, fov: Math.PI / 1.8
        },
        {
            id: 'citadine', label: "Citadine", description: "Petite et très maniable, vitesse modérée.",
            color: [56, 189, 248], speedFactor: 0.8, maxForce: 0.5, maxTurn: 0.9, brakeDecel: 0.35,
            grip: 1, mass: 0.8, width: 8, height: 14, sightDist: 130, fov: Math.PI / 1.3
        },
        {
            id: 'camion', label: "Camion", description: "Lourd : démarre lentement, freine fort, capteurs courts.",
            color: [245, 158, 11], speedFactor: 0.75, maxForce: 0.5, maxTurn: 0.4, brakeDecel: 0.6,
            grip: 1, mass: 2.5, width: 14, height: 30, sightDist: 100, fov: Math.PI / 1.5
        },
        {
            id: 'drift', label: "Drift", description: "Tourne très vite mais glisse : peu d'adhérence.",
            color: [168, 85, 247], speedFactor: 1, maxForce: 0.5, maxTurn: 1.0, brakeDecel: 0.25,
            grip: 0.35, mass: 1, width: 10, height: 18, sightDist: 150, fov: Math.PI / 1.4
        }
    ],

    ids() {
        return CarTypes.LIST.map(t => t.id);
    },

    get(id) {
        const type = CarTypes.LIST.find(t => t.id === id);
        if (!type) throw new RangeError("Type de voiture inconnu : " + id);
        return type;
    },

    /**
     * Type de la i-ème voiture d'une population : un type unique, ou une répartition
     * tournante entre les types choisis (« mélange »).
     */
    forIndex(selection, i) {
        const ids = selection.ids;
        return CarTypes.get(ids[i % ids.length]);
    }
};
