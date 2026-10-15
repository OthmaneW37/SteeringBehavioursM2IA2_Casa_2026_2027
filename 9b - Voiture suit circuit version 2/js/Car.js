class Car {
    constructor(brain) {
        // Physique
        this.pos = createVector(startX + random(-3, 3), startY + random(-3, 3));
        // Démarrage avec une petite vitesse dans la bonne direction pour éviter le "sur place"
        let angle = window.startAngle || 0;
        this.vel = p5.Vector.fromAngle(angle);
        this.vel.mult(1.0); // Plus d'impulsion au départ
        this.acc = createVector(0, 0);

        this.width = 10;
        this.height = 20;
        this.maxForce = 0.5; // Augmenté pour mieux tourner à haute vitesse

        this.dead = false;
        this.finished = false; // A-t-elle terminé le circuit ?
        this.score = 0;       // Score pur (temps)
        this.fitness = 0;     // Score calculé

        this.checkpointIndex = window.startCheckpointIndex || 0; // Prochain checkpoint à valider
        this.wrongWayCount = 0;   // Détection de sens inverse
        this.laps = 0;            // Nombre de tours
        this.frameCount = 0; // Cycle de vie
        this.startPos = this.pos.copy();

        // Nouveaux compteurs pour anti-camping
        this.framesStalled = 0;
        this.framesSinceLastCheckpoint = 0;
        this.prevPos = this.pos.copy(); // Pour détecter les rotations sur place
        this.framesMovingSlowly = 0;

        if (brain) {
            this.brain = brain.copy();
        } else {
            this.brain = new NeuralNetwork(NB_ASSETS, 20, 2);
        }

        this.rays = [];
        for (let i = 0; i < NB_ASSETS - 1; i++) {
            this.rays[i] = new Ray();
        }
    }

    dispose() {
        this.brain.dispose();
    }

    mutate(rate) {
        this.brain.mutate(rate);
    }

    applyForce(force) {
        this.acc.add(force);
    }

    update() {
        if (this.dead) return;

        this.frameCount++;

        // COUP DE POUCE RADICAL : Si après 60 frames (1s) on n'a tjs pas bougé de 40px
        if (this.frameCount === 60) {
            if (p5.Vector.dist(this.pos, this.startPos) < 40) {
                this.dead = true;
                return;
            }
        }

        this.vel.add(this.acc);
        this.vel.limit(GAME_SPEED_LIMIT);
        this.pos.add(this.vel);
        this.acc.mult(0);

        // On perd de la vie à chaque frame pour forcer à aller vite (optionnel)
        // Ici on utilise simplement le franchissement de checkpoints

        // ANTI-CAMPING : On vérifie si la voiture progresse vraiment
        // Même si elle a de la vitesse, si elle tourne en rond elle n'avancera pas

        this.framesMovingSlowly++;
        if (this.framesMovingSlowly > 60) {
            let distMoved = p5.Vector.dist(this.pos, this.prevPos);
            if (distMoved < 20) { // Moins de 20px en 1 seconde = sur place ou toupie
                this.framesStalled += 60;
            } else {
                this.framesStalled = 0;
                this.prevPos = this.pos.copy();
            }
            this.framesMovingSlowly = 0;
        }

        this.framesSinceLastCheckpoint++;

        // Si bloqué 120 frames (~2s cumulées) ou pas de checkpoint en 1200 frames (~20s)
        if (this.framesStalled > 120 || this.framesSinceLastCheckpoint > 1200) {
            this.dead = true;
        }
    }

    checkCheckpoints(cps) {
        if (this.dead || cps.length === 0) return;

        // 1. DÉTECTION SENS INVERSE (Anti-Triche Vérotielle)
        // On compare le vecteur vitesse de la voiture avec la direction théorique du circuit
        if (this.frameCount > 100 && this.vel.mag() > 0.5) {
            let cp1 = cps[this.checkpointIndex];
            let cp2 = cps[(this.checkpointIndex + 1) % cps.length];

            // Calcul du milieu des segments pour obtenir le vecteur direction du circuit
            let center1 = createVector((cp1.a.x + cp1.b.x) / 2, (cp1.a.y + cp1.b.y) / 2);
            let center2 = createVector((cp2.a.x + cp2.b.x) / 2, (cp2.a.y + cp2.b.y) / 2);
            let trackDir = p5.Vector.sub(center2, center1).normalize();

            // Si le produit scalaire est négatif, la voiture va à l'envers
            if (this.vel.dot(trackDir) < -0.3) {
                this.wrongWayCount++;
                if (this.wrongWayCount > 100) { // Environ 1.6s à l'envers cumulées
                    this.dead = true;
                    return;
                }
            } else if (this.vel.dot(trackDir) > 0.2) {
                this.wrongWayCount = max(0, this.wrongWayCount - 5); // Remontée rapide si on va dans le bon sens
            }
        }

        // 2. PROGRESSION NORMALE
        let goal = cps[this.checkpointIndex];
        let d = distPointToSegment(this.pos, goal.a, goal.b);

        if (d < 40) {
            this.checkpointIndex = (this.checkpointIndex + 1) % cps.length;
            this.score += 50;
            this.framesSinceLastCheckpoint = 0;
            this.wrongWayCount = 0; // Reset si on avance bien

            if (this.checkpointIndex === 0) {
                this.laps++;
                this.score += 200;
                this.finished = true;
                this.dead = true;
            }
        }
    }

    look(walls) {
        const inputs = [];
        let heading = this.vel.heading();

        // On a NB_ASSETS - 1 rayons (5 rayons)
        let numRays = NB_ASSETS - 1;

        for (let i = 0; i < numRays; i++) {
            let angle = heading - FOV / 2 + (i * FOV) / (numRays - 1);
            if (numRays === 1) angle = heading;

            this.rays[i].setDir(angle);
            this.rays[i].setPos(this.pos.x, this.pos.y);

            let closest = null;
            let record = SIGHT_DIST;

            for (let wall of walls) {
                const pt = this.rays[i].cast(wall);
                if (pt) {
                    const d = p5.Vector.dist(this.pos, pt);
                    if (d < record) {
                        record = d;
                        closest = pt;
                    }
                }
            }

            inputs[i] = map(record, 0, SIGHT_DIST, 1, 0);
            this.rays[i].end = closest;
        }

        // Le dernier input est la vitesse normalisée
        inputs[NB_ASSETS - 1] = map(this.vel.mag(), 0, GAME_SPEED_LIMIT, 0, 1);

        return inputs;
    }

    think(walls) {
        let inputs = this.look(walls);
        let outputs = this.brain.predict(inputs);

        let turnForce = map(outputs[0], 0, 1, -this.maxForce, this.maxForce);
        let thrust = map(outputs[1], 0, 1, 0, GAME_SPEED_LIMIT);

        // AIDE AU DÉMARRAGE : Première demi-seconde, on pousse forcément un peu
        if (this.frameCount < 30) {
            thrust = max(thrust, GAME_SPEED_LIMIT * 0.5);
        }

        let currentHeading = this.vel.heading();
        let desiredHeading = currentHeading + turnForce;
        let desiredVel = p5.Vector.fromAngle(desiredHeading);
        desiredVel.setMag(thrust);

        let steer = p5.Vector.sub(desiredVel, this.vel);
        steer.limit(this.maxForce);

        this.applyForce(steer);
    }

    show(isBest) {
        if (this.dead && !isBest) return; // Cache les morts sauf le meilleur passée

        push();
        translate(this.pos.x, this.pos.y);
        rotate(this.vel.heading());
        rectMode(CENTER);

        if (isBest) {
            fill(0, 255, 0); // Vert pour le meilleur
            stroke(0, 255, 0);
        } else {
            fill(255, 50); // Blanc transparent pour les autres
            stroke(255, 100);
        }

        if (this.dead) fill(255, 0, 0, 100); // Rouge si mort (mais affiché)

        rect(0, 0, this.height, this.width);
        pop();

        // Dessin des rayons
        // On dessine maintenant pour tout le monde, mais plus discret pour les non-best
        if (!this.dead) {
            for (let r of this.rays) {
                if (r.end) {
                    if (isBest) {
                        stroke(255, 255, 0, 150); // Jaune vif pour le leader
                        strokeWeight(1);
                    } else {
                        stroke(255, 255, 255, 20); // Gris très transparent pour les autres
                        strokeWeight(0.5);
                    }
                    line(this.pos.x, this.pos.y, r.end.x, r.end.y);
                }
            }
        }
        strokeWeight(1);
    }
}

