// Menu de l'écran titre : entrées, sélection au clavier (flèches, Entrée) ou à la souris. Module pur :
// le DOM affiche les entrées (boutons de index.html), ce module dit laquelle est choisie et lesquelles
// sont actives. « Continuer » n'est actif que s'il y a un combat à reprendre.
class TitleMenu {
    constructor(items = TitleMenu.ITEMS) {
        this.items = items.map(it => Object.assign({ enabled: true }, it));
        this.index = 0;
    }

    current() {
        return this.items[this.index];
    }

    find(id) {
        const i = this.items.findIndex(it => it.id === id);
        if (i < 0) throw new RangeError("Entrée de menu inconnue : " + id);
        return i;
    }

    /** Active ou désactive une entrée ; si l'entrée choisie devient inactive, on passe à la suivante active. */
    setEnabled(id, enabled) {
        this.items[this.find(id)].enabled = !!enabled;
        if (!this.current().enabled) this.move(1);
    }

    /** Déplace le choix de `delta` entrées actives (le menu boucle). Retourne l'identifiant choisi. */
    move(delta) {
        const n = this.items.length;
        if (!this.items.some(it => it.enabled)) return null;
        const step = delta < 0 ? -1 : 1;
        let moves = Math.abs(delta) || 0;
        let i = this.index;
        if (moves === 0 && !this.items[i].enabled) moves = 1;
        while (moves > 0) {
            i = (i + step + n) % n;
            if (this.items[i].enabled) moves--;
        }
        this.index = i;
        return this.current().id;
    }

    /** Choisit une entrée (souris). Refusé si elle est inactive. */
    select(id) {
        const i = this.find(id);
        if (!this.items[i].enabled) return false;
        this.index = i;
        return true;
    }
}

TitleMenu.ITEMS = [
    { id: 'new', label: "Nouvelle partie" },
    { id: 'continue', label: "Continuer" },
    { id: 'pack', label: "La meute des Creux" },
    { id: 'train', label: "Entraîner" },
    { id: 'pantheon', label: "Panthéon" },
    { id: 'lab', label: "Laboratoire" },
    { id: 'options', label: "Options" }
];
