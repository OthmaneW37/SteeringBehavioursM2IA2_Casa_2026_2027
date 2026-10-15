// Tache de sang : là où le chevalier est mort, comme dans les jeux Souls. Entité visible du monde,
// donc sous-classe de Vehicle, immobile. Elle rappelle au joueur l'endroit et la cause de sa mort.
class Bloodstain extends Vehicle {
    constructor(x, y, label, seed = 1) {
        super(x, y, null);
        this.vel.set(0, 0);
        this.maxSpeed = 0;
        this.maxForce = 0;
        this.r = 18;
        this.label = label;
        // Forme irrégulière tirée une fois (aléatoire injecté par la graine)
        let s = seed >>> 0 || 1;
        const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
        this.blobs = [];
        for (let i = 0; i < 6; i++) this.blobs.push({ x: (rnd() - 0.5) * 26, y: (rnd() - 0.5) * 18, r: 8 + rnd() * 12 });
    }

    show(timeSeconds, near) {
        push();
        translate(this.pos.x, this.pos.y);
        noStroke();
        const pulse = 0.75 + 0.25 * Math.sin(timeSeconds * 2 + this.pos.x);
        fill(150, 10, 10, 160 * pulse);
        for (const b of this.blobs) circle(b.x, b.y, b.r * 2);
        if (near) {
            fill(240, 220, 200);
            textAlign(CENTER, BOTTOM);
            textSize(11);
            text(this.label, 0, -18);
        }
        pop();
    }
}

// Au plus MAX_STAINS taches sont gardées (les plus anciennes s'effacent).
Bloodstain.MAX_STAINS = 8;

// Taches de sang gardées dans le navigateur (localStorage protégé, stockage injecté).
Bloodstain.KEY = 'gardienDuBrouillard.bloodstains.v1';

/** Texte de la tache selon la cause de la mort. */
Bloodstain.labelFor = function (cause) {
    const causes = { hallebarde: "la hallebarde", 'ruée': "la ruée", brume: "la brume" };
    return "Ici, vaincu par " + (causes[cause] || "le Gardien");
};

/** Ajoute une tache ; au-delà de MAX_STAINS, la plus ancienne disparaît. Retourne la liste. */
Bloodstain.add = function (list, x, y, cause, seed) {
    list.push(new Bloodstain(x, y, Bloodstain.labelFor(cause), seed));
    while (list.length > Bloodstain.MAX_STAINS) list.shift();
    return list;
};

Bloodstain.save = function (storage, list) {
    try {
        if (!storage) return false;
        storage.setItem(Bloodstain.KEY, JSON.stringify(list.map(b => ({ x: b.pos.x, y: b.pos.y, label: b.label }))));
        return true;
    } catch (e) {
        return false;
    }
};

/** Liste relue (entrées invalides ignorées) ; jamais d'exception. */
Bloodstain.load = function (storage) {
    try {
        const data = storage ? JSON.parse(storage.getItem(Bloodstain.KEY) || '[]') : [];
        if (!Array.isArray(data)) return [];
        return data
            .filter(d => d && Number.isFinite(d.x) && Number.isFinite(d.y) && typeof d.label === 'string')
            .slice(-Bloodstain.MAX_STAINS)
            .map((d, i) => new Bloodstain(d.x, d.y, d.label.slice(0, 60), i + 1));
    } catch (e) {
        return [];
    }
};
