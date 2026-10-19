/**
 * Voiture pilotée par un réseau de neurones.
 *
 * Séparation de Reynolds :
 *   - sélection de l'action : le réseau lit les capteurs et choisit virage, poussée (et frein) ;
 *   - steering : vitesse désirée → force = désirée − vitesse, limitée à maxForce ;
 *   - locomotion : applyForce puis update (vitesse limitée, position).
 *
 * Toutes les valeurs physiques viennent du type de voiture (carTypes.js) ; la Berline
 * reproduit exactement les constantes de la version d'origine.
 *
 * options : { type, sizes, start: {x, y, angle, checkpointIndex}, lapsToFinish }
 * Une étape de simulation correspond à 1/60 s (Car.STEP_SECONDS).
 */
class Car {
    constructor(brain, options = {}) {
        this.type = options.type || CarTypes.get(CarTypes.DEFAULT);
        const start = options.start ||
            { x: startX, y: startY, angle: startAngle, checkpointIndex: startCheckpointIndex };

        // Physique
        this.pos = createVector(start.x + random(-3, 3), start.y + random(-3, 3));
        // Démarrage avec une petite vitesse dans la bonne direction pour éviter le "sur place"
        this.vel = p5.Vector.fromAngle(start.angle || 0);
        this.vel.mult(1.0);
        this.acc = createVector(0, 0);

        this.width = this.type.width;
        this.height = this.type.height;
        this.maxForce = this.type.maxForce;

        this.dead = false;
        this.finished = false; // A-t-elle terminé ses tours ?
        this.score = 0;       // Score pur (checkpoints et tours)
        this.fitness = 0;     // Score calculé

        this.checkpointIndex = start.checkpointIndex || 0; // Prochain checkpoint à valider
        this.checkpointsPassed = 0; // Progression totale (classement en course)
        this.wrongWayCount = 0;   // Détection de sens inverse
        this.laps = 0;            // Nombre de tours
        this.lapsToFinish = options.lapsToFinish || 1;
        this.lapFrames = [];      // Image de fin de chaque tour (temps au tour)
        this.frameCount = 0; // Cycle de vie
        this.startPos = this.pos.copy();

        // Compteurs anti-camping
        this.framesStalled = 0;
        this.framesSinceLastCheckpoint = 0;
        this.prevPos = this.pos.copy(); // Pour détecter les rotations sur place
        this.framesMovingSlowly = 0;

        // Dernières sorties du réseau (affichage) et état du frein
        this.lastOutputs = null;
        this.braking = false;

        if (brain) {
            this.brain = brain.copy();
        } else {
            this.brain = new NeuralNetwork(options.sizes || [NB_ASSETS, 20, 2]);
        }

        this.rays = [];
        for (let i = 0; i < NB_RAYS; i++) {
            this.rays[i] = new Ray();
        }
    }

    /** Vitesse max : facteur du type × curseur de vitesse de référence. */
    maxSpeed() {
        return this.type.speedFactor * GAME_SPEED_LIMIT;
    }

    dispose() {
        this.brain.dispose();
    }

    mutate(rate) {
        this.brain.mutate(rate);
    }

    // Locomotion : accélération = force / masse (inertie du type)
    applyForce(force) {
        this.acc.add(p5.Vector.div(force, this.type.mass));
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
        this.vel.limit(this.maxSpeed());
        this.pos.add(this.vel);
        this.acc.mult(0);

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

        // 1. DÉTECTION SENS INVERSE
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

        if (d < CHECKPOINT_RADIUS) {
            this.checkpointIndex = (this.checkpointIndex + 1) % cps.length;
            this.checkpointsPassed++;
            this.score += 50;
            this.framesSinceLastCheckpoint = 0;
            this.wrongWayCount = 0; // Reset si on avance bien

            if (this.checkpointIndex === 0) {
                this.laps++;
                this.lapFrames.push(this.frameCount);
                this.score += 200;
                if (this.laps >= this.lapsToFinish) {
                    this.finished = true;
                    this.dead = true;
                }
            }
        }
    }

    /** Collision avec un mur ou sortie du canvas. */
    checkWalls(wallList, w, h) {
        if (this.dead) return;
        for (let wall of wallList) {
            if (distPointToSegment(this.pos, wall.a, wall.b) < this.width / 1.8) {
                this.dead = true;
                return; // Une seule collision suffit
            }
        }
        if (this.pos.x < 0 || this.pos.x > w || this.pos.y < 0 || this.pos.y > h) {
            this.dead = true;
        }
    }

    // Perception : distances aux murs le long des rayons, puis vitesse normalisée
    look(walls) {
        const inputs = [];
        let heading = this.vel.heading();
        const sight = this.type.sightDist;
        const fov = this.type.fov;

        // Rayons 0 à 4 : éventail devant la voiture (champ de vision du type)
        // Rayons 5 et 6 : perpendiculaires, à gauche (-90°) puis à droite (+90°) du cap.
        // Ils servent à longer un mur et à voir les virages serrés avant de les toucher.
        for (let i = 0; i < NB_RAYS; i++) {
            let angle;
            if (i < FAN_RAYS) {
                angle = heading - fov / 2 + (i * fov) / (FAN_RAYS - 1);
            } else {
                angle = heading + (i === FAN_RAYS ? -Math.PI / 2 : Math.PI / 2);
            }

            this.rays[i].setDir(angle);
            this.rays[i].setPos(this.pos.x, this.pos.y);

            let closest = null;
            let record = sight;

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

            inputs[i] = map(record, 0, sight, 1, 0);
            this.rays[i].end = closest;
        }

        // Le dernier input est la vitesse normalisée
        inputs[NB_RAYS] = map(this.vel.mag(), 0, this.maxSpeed(), 0, 1);

        return inputs;
    }

    // Décision (réseau) puis steering : la force est appliquée, la locomotion se fait dans update()
    think(walls) {
        let inputs = this.look(walls);
        let outputs = this.brain.predict(inputs);
        this.lastOutputs = outputs;
        this.steerFromOutputs(outputs);
    }

    /**
     * Sorties du réseau → forces. outputs[0] : virage, outputs[1] : poussée,
     * outputs[2] (optionnel) : frein, actif au-dessus de CarTypes.BRAKE_THRESHOLD.
     */
    steerFromOutputs(outputs) {
        const type = this.type;
        const vmax = this.maxSpeed();
        let turnForce = map(outputs[0], 0, 1, -type.maxTurn, type.maxTurn);
        let thrust = map(outputs[1], 0, 1, 0, vmax);

        // AIDE AU DÉMARRAGE : Première demi-seconde, on pousse forcément un peu
        if (this.frameCount < 30) {
            thrust = max(thrust, vmax * 0.5);
        }

        // Frein appris : on coupe la poussée (on garde la vitesse actuelle) et on décélère
        this.braking = outputs.length > 2 && outputs[2] > CarTypes.BRAKE_THRESHOLD;
        if (this.braking) thrust = this.vel.mag();

        let currentHeading = this.vel.heading();
        let desiredHeading = currentHeading + turnForce;
        let desiredVel = p5.Vector.fromAngle(desiredHeading);
        desiredVel.setMag(thrust);

        let steer = p5.Vector.sub(desiredVel, this.vel);
        steer.limit(this.maxForce);

        // Adhérence : une partie seulement de la force latérale « accroche » la route
        if (type.grip < 1 && this.vel.mag() > 0) {
            let dir = this.vel.copy().normalize();
            let along = p5.Vector.mult(dir, steer.dot(dir));
            let lateral = p5.Vector.sub(steer, along).mult(type.grip);
            steer = along.add(lateral);
        }

        this.applyForce(steer);

        if (this.braking) {
            // Décélération du type : force = décélération × masse (applyForce divise par la masse)
            let speed = this.vel.mag();
            let brake = this.vel.copy().setMag(-Math.min(type.brakeDecel, speed) * type.mass);
            this.applyForce(brake);
        }
    }

    show(isBest) {
        if (this.dead && !isBest) return; // Cache les morts sauf le meilleur passée

        const c = this.type.color;
        push();
        translate(this.pos.x, this.pos.y);
        rotate(this.vel.heading());
        rectMode(CENTER);

        if (isBest) {
            fill(0, 255, 0); // Vert pour le meilleur
            stroke(0, 255, 0);
        } else {
            fill(c[0], c[1], c[2], this.type.id === 'berline' ? 50 : 150);
            stroke(c[0], c[1], c[2], this.type.id === 'berline' ? 100 : 220);
        }

        if (this.dead) fill(255, 0, 0, 100); // Rouge si mort (mais affiché)

        rect(0, 0, this.height, this.width);
        if (this.braking) {
            // Feux stop
            noStroke();
            fill(255, 0, 0);
            rect(-this.height / 2, -this.width / 3, 2, 3);
            rect(-this.height / 2, this.width / 3, 2, 3);
        }
        pop();

        // Dessin des rayons
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

// Durée simulée d'une étape (la simulation avance à pas fixe)
Car.STEP_SECONDS = 1 / 60;
