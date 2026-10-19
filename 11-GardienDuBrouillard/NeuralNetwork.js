/**
 * Réseau de neurones dense, entièrement en JavaScript (aucune rétropropagation :
 * il n'est entraîné que par l'algorithme génétique, qui mute ses poids).
 *
 * Architecture : un tableau de tailles [entrées, cachée1, ..., cachéeN, sorties].
 * Toutes les couches utilisent la sigmoïde, comme la version TensorFlow.js d'origine :
 * chaque sortie est donc dans [0, 1].
 *
 * Constructeurs acceptés :
 *   new NeuralNetwork([6, 20, 2])      // tableau de tailles
 *   new NeuralNetwork(6, 20, 2)        // ancienne forme (entrées, cachée, sorties)
 *   new NeuralNetwork([6, 16, 8, 3], rng)  // aléatoire injecté (tests reproductibles)
 *
 * Initialisation identique à la couche dense de TensorFlow.js :
 * poids « Glorot uniforme » (bornes ±sqrt(6 / (entrées + sorties))) et biais nuls.
 *
 * Les activations de chaque couche sont gardées dans des tampons pré-alloués
 * (this.activations) : l'affichage du réseau les lit sans rien recalculer.
 */
class NeuralNetwork {
    constructor(a, b, c, d) {
        let sizes, rng;
        if (Array.isArray(a)) {
            sizes = a;
            rng = typeof b === 'function' ? b : Math.random;
        } else {
            sizes = [a, b, c];
            rng = typeof d === 'function' ? d : Math.random;
        }
        NeuralNetwork.checkSizes(sizes);
        this.sizes = sizes.slice();

        // Compatibilité avec l'ancien code (une seule couche cachée)
        this.input_nodes = this.sizes[0];
        this.hidden_nodes = this.sizes[1];
        this.output_nodes = this.sizes[this.sizes.length - 1];

        this.weights = [];
        this.biases = [];
        for (let l = 0; l < this.sizes.length - 1; l++) {
            const nIn = this.sizes[l], nOut = this.sizes[l + 1];
            const limit = Math.sqrt(6 / (nIn + nOut));
            const w = new Float32Array(nIn * nOut);
            for (let k = 0; k < w.length; k++) w[k] = (rng() * 2 - 1) * limit;
            this.weights.push(w);
            this.biases.push(new Float32Array(nOut));
        }
        this.activations = this.sizes.map(n => new Float32Array(n));
    }

    /** Vérifie un tableau de tailles : au moins 3 couches, entiers ≥ 1. */
    static checkSizes(sizes) {
        if (!Array.isArray(sizes) || sizes.length < 3) {
            throw new RangeError("Le réseau doit avoir une entrée, au moins une couche cachée et une sortie.");
        }
        for (const n of sizes) {
            if (!Number.isInteger(n) || n < 1) {
                throw new RangeError("Taille de couche invalide : " + n);
            }
        }
    }

    /** Nombre total de paramètres (poids + biais). */
    paramCount() {
        let total = 0;
        for (let l = 0; l < this.weights.length; l++) total += this.weights[l].length + this.biases[l].length;
        return total;
    }

    /**
     * Propagation avant. Les poids de la couche l sont rangés ligne par ligne :
     * weights[l][j * nIn + i] relie l'entrée i au neurone j.
     * Retourne une copie des sorties (Float32Array), comme dataSync() le faisait.
     */
    predict(inputs) {
        const first = this.activations[0];
        if (!inputs || inputs.length !== first.length) {
            throw new RangeError("Le réseau attend " + first.length + " entrées.");
        }
        for (let i = 0; i < first.length; i++) first[i] = inputs[i];

        for (let l = 0; l < this.weights.length; l++) {
            const input = this.activations[l];
            const output = this.activations[l + 1];
            const w = this.weights[l], bias = this.biases[l];
            const nIn = input.length;
            for (let j = 0; j < output.length; j++) {
                let sum = bias[j];
                const row = j * nIn;
                for (let i = 0; i < nIn; i++) sum += w[row + i] * input[i];
                output[j] = 1 / (1 + Math.exp(-sum)); // sigmoïde
            }
        }
        return this.activations[this.activations.length - 1].slice();
    }

    copy() {
        const clone = Object.create(NeuralNetwork.prototype);
        clone.sizes = this.sizes.slice();
        clone.input_nodes = this.input_nodes;
        clone.hidden_nodes = this.hidden_nodes;
        clone.output_nodes = this.output_nodes;
        clone.weights = this.weights.map(w => w.slice());
        clone.biases = this.biases.map(b => b.slice());
        clone.activations = this.sizes.map(n => new Float32Array(n));
        return clone;
    }

    /**
     * Mutation gaussienne : chaque poids ou biais a une probabilité `rate`
     * de recevoir un bruit de moyenne 0 et d'écart-type NeuralNetwork.MUTATION_STD.
     * `rng` (uniforme dans [0, 1[) et `gaussian` (normale centrée réduite) sont injectables.
     */
    mutate(rate, rng = Math.random, gaussian = NeuralNetwork.gaussian) {
        const std = NeuralNetwork.MUTATION_STD;
        const groups = this.weights.concat(this.biases);
        for (const values of groups) {
            for (let k = 0; k < values.length; k++) {
                if (rng() < rate) values[k] += gaussian() * std;
            }
        }
    }

    /** Rien à libérer (gardé pour compatibilité avec la version TensorFlow.js). */
    dispose() { }

    /** Données sérialisables (sauvegarde d'un cerveau). */
    toJSON() {
        return {
            sizes: this.sizes.slice(),
            weights: this.weights.map(w => Array.from(w)),
            biases: this.biases.map(b => Array.from(b))
        };
    }

    /** Reconstruit un réseau à partir de toJSON(), en vérifiant chaque dimension. */
    static fromJSON(data) {
        if (!data || typeof data !== 'object') throw new TypeError("Cerveau absent ou illisible.");
        NeuralNetwork.checkSizes(data.sizes);
        const nn = new NeuralNetwork(data.sizes, () => 0.5);
        const layers = data.sizes.length - 1;
        if (!Array.isArray(data.weights) || data.weights.length !== layers ||
            !Array.isArray(data.biases) || data.biases.length !== layers) {
            throw new RangeError("Nombre de couches de poids incohérent.");
        }
        for (let l = 0; l < layers; l++) {
            const w = data.weights[l], b = data.biases[l];
            if (!Array.isArray(w) || w.length !== nn.weights[l].length ||
                !Array.isArray(b) || b.length !== nn.biases[l].length) {
                throw new RangeError("Dimensions des poids incohérentes (couche " + (l + 1) + ").");
            }
            for (const v of w.concat(b)) {
                if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError("Poids non numérique.");
            }
            nn.weights[l].set(w);
            nn.biases[l].set(b);
        }
        return nn;
    }

    /** Loi normale centrée réduite : randomGaussian de p5 s'il existe, sinon Box-Muller. */
    static gaussian() {
        if (typeof randomGaussian === 'function') return randomGaussian(0, 1);
        let u = 0;
        while (u === 0) u = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
    }
}

// Écart-type du bruit de mutation (identique à la version d'origine : randomGaussian(0, 0.1))
NeuralNetwork.MUTATION_STD = 0.1;
