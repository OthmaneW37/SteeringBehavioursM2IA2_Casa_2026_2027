class NeuralNetwork {
    constructor(a, b, c, d) {
        if (a instanceof tf.Sequential) {
            this.model = a;
            this.input_nodes = b;
            this.hidden_nodes = c;
            this.output_nodes = d;
        } else {
            this.input_nodes = a;
            this.hidden_nodes = b;
            this.output_nodes = c;
            this.model = this.createModel();
        }
    }

    createModel() {
        const model = tf.sequential();

        // Couche cachée
        model.add(tf.layers.dense({
            units: this.hidden_nodes,
            inputShape: [this.input_nodes],
            activation: 'sigmoid' // ou 'relu'
        }));

        // Couche de sortie
        model.add(tf.layers.dense({
            units: this.output_nodes,
            activation: 'sigmoid' // Sortie entre 0 et 1 (pratique pour l'accélération)
        }));

        return model;
    }

    dispose() {
        this.model.dispose();
    }

    // Prédiction synchrone et nettoyée
    predict(inputs) {
        return tf.tidy(() => {
            const xs = tf.tensor2d([inputs]);
            const ys = this.model.predict(xs);
            const outputs = ys.dataSync(); // Récupère les données immédiatement
            return outputs;
        });
    }

    copy() {
        return tf.tidy(() => {
            const modelCopy = this.createModel();
            const weights = this.model.getWeights();
            const weightCopies = [];

            for (let i = 0; i < weights.length; i++) {
                weightCopies[i] = weights[i].clone();
            }

            modelCopy.setWeights(weightCopies);

            // On crée un nouveau NeuralNetwork avec ce modèle copié
            return new NeuralNetwork(
                modelCopy,
                this.input_nodes,
                this.hidden_nodes,
                this.output_nodes
            );
        });
    }

    mutate(rate) {
        tf.tidy(() => {
            const weights = this.model.getWeights();
            const mutatedWeights = [];

            for (let i = 0; i < weights.length; i++) {
                let tensor = weights[i];
                let shape = weights[i].shape;
                let values = tensor.dataSync().slice(); // Copie des valeurs

                for (let j = 0; j < values.length; j++) {
                    if (Math.random() < rate) {
                        // Mutation gaussienne
                        let w = values[j];
                        values[j] = w + randomGaussian(0, 0.1);
                        // On peut aussi limiter les poids ici si besoin
                    }
                }

                let newTensor = tf.tensor(values, shape);
                mutatedWeights[i] = newTensor;
            }

            this.model.setWeights(mutatedWeights);
        });
    }
}
