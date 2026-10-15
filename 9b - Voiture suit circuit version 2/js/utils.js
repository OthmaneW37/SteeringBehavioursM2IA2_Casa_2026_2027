/**
 * Calcule la distance entre un point p et un segment [a, b].
 * Utilise la projection vectorielle pour trouver le point le plus proche sur le segment.
 */
function distPointToSegment(p, a, b) {
    let pa = p5.Vector.sub(p, a);
    let ba = p5.Vector.sub(b, a);
    let h = constrain(pa.dot(ba) / ba.magSq(), 0, 1);
    return pa.sub(ba.mult(h)).mag();
}

/**
 * Fonction gaussienne aléatoire (approximation Box-Muller ou simple somme).
 * p5.js a randomGaussian(), mais au cas où ou pour contrôle précis.
 */
// p5.js fournit déjà randomGaussian(mean, sd)
