// Gestionnaire des insectes (les véhicules ordinaires de l'exemple). Il crée les insectes, impose
// un plafond (le plus ancien est retiré) et tient le nombre d'insectes « réglés » par le curseur :
// les insectes ajoutés à la main (touches s et w, glisser la souris) sont comptés dans le plafond
// mais le curseur ne les retire pas. Les insectes ne se créent pas eux-mêmes.
class InsectColony {
  static MAX_INSECTS = 60;
  // force max d'un insecte : basse, pour des trajectoires lisses (tourner prend du temps). L'évitement
  // d'obstacles, pondéré par Insect.AVOID_WEIGHT, reste assez fort pour contourner à temps.
  static MAX_FORCE = 0.1;

  // rng : retourne un nombre dans [0, 1[ (injecté pour les tests)
  constructor(rng = Math.random) {
    this.rng = rng;
    this.insects = [];
  }

  // insecte au hasard (espèce et vitesse tirées dans les limites de l'espèce), ou imposés par
  // options : { species, maxSpeed, maxForce, size, regular }
  add(x, y, options = {}) {
    const species = options.species ?? Insect.randomSpecies(this.rng);
    const [low, high] = Insect.SPECIES[species].speed;
    const speed = options.maxSpeed ?? low + (high - low) * this.rng();
    const insect = new Insect(x, y, speed, options.maxForce ?? InsectColony.MAX_FORCE, species);
    if (options.size !== undefined) insect.r = options.size;
    insect.regular = Boolean(options.regular);
    this.insects.push(insect);
    if (this.insects.length > InsectColony.MAX_INSECTS) this.insects.shift();
    return insect;
  }

  get regular() {
    return this.insects.filter(insect => insect.regular);
  }

  // ajuste le nombre d'insectes réglés par le curseur : en crée à des positions au hasard dans
  // le canvas, ou retire les derniers
  resize(n, width, height, size) {
    const target = Math.min(n, InsectColony.MAX_INSECTS);
    let regular = this.regular;
    while (regular.length < target) {
      this.add(this.rng() * width, this.rng() * height, { regular: true, size });
      regular = this.regular;
    }
    for (let i = regular.length - 1; i >= target; i--) this.insects.splice(this.insects.indexOf(regular[i]), 1);
  }

  // taille des insectes réglés par le curseur
  applySize(size) {
    for (const insect of this.regular) insect.r = size;
  }
}
