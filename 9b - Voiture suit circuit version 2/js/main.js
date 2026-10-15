// Globals defined in globals.js

function setup() {
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent('canvas-container');
    tf.setBackend('cpu');

    setupTrack(true); // Full regen au démarrage

    for (let i = 0; i < TOTAL_POP; i++) {
        cars[i] = new Car();
    }

    // Gestion des Sliders
    const speedSlider = document.getElementById('speedSlider');
    const speedDisplay = document.getElementById('speedVal');
    if (speedSlider && speedDisplay) {
        speedSlider.addEventListener('input', () => {
            GAME_SPEED_LIMIT = parseInt(speedSlider.value);
            speedDisplay.innerText = GAME_SPEED_LIMIT;
        });
    }

    const diffSlider = document.getElementById('diffSlider');
    const diffDisplay = document.getElementById('diffVal');
    if (diffSlider && diffDisplay) {
        diffSlider.addEventListener('input', () => {
            TRACK_DIFFICULTY = parseInt(diffSlider.value);
            diffDisplay.innerText = TRACK_DIFFICULTY;
            trainingFinished = false;
            setupTrack(true); // Regen totale si on change la complexité
        });
    }

    const widthSlider = document.getElementById('widthSlider');
    const widthDisplay = document.getElementById('widthVal');
    if (widthSlider && widthDisplay) {
        widthSlider.addEventListener('input', () => {
            TRACK_WIDTH = parseInt(widthSlider.value);
            widthDisplay.innerText = TRACK_WIDTH;
            trainingFinished = false;
            setupTrack(true); // REGEN TOTALE quand on change la largeur pour adapter la grille
        });
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    setupTrack();
}

function draw() {
    background(30);
    showTiles(); // Rendu des "Cartes" LEGO

    // 1. Logique Voitures
    let maxScore = -1;
    let bestDist = Infinity;
    bestCar = null;

    for (let i = cars.length - 1; i >= 0; i--) {
        let car = cars[i];

        car.look(walls); // On regarde TOUS les murs (pas les checkpoints)
        car.think(walls);
        car.update();

        // Checkpoints
        car.checkCheckpoints(checkpoints);

        // Morts (Collision murs)
        checkCollisions(car);

        // Score += 1 pour survie (petit bonus)
        // Le vrai score vient des checkpoints
        // car.score += 0.1; // DÉSACTIVÉ : On veut que les checkpoints comptent uniquement

        // Sauvegarde morts
        if (car.dead) {
            savedCars.push(cars.splice(i, 1)[0]);
            // Si c'était le meilleur, on le garde en réf visuelle jusqu'à la fin de la frame si possible
            // (compliqué si sorti du tableau, on simplifie)
        } else {
            // Trouver le leader actuel
            // On veut le max score. En cas d'égalité, celui qui est le plus proche du prochain checkpoint.

            let distToNext = Infinity;
            if (checkpoints.length > 0) {
                let goal = checkpoints[car.checkpointIndex % checkpoints.length];
                // Distance au centre du checkpoint
                let center = p5.Vector.add(goal.a, goal.b).div(2);
                distToNext = p5.Vector.dist(car.pos, center);
            }

            // Si meilleur score, ou score égal mais plus proche du but
            if (car.score > maxScore || (car.score === maxScore && distToNext < bestDist)) {
                maxScore = car.score;
                bestDist = distToNext;
                bestCar = car;
            }
        }
    }

    // 2. Nouvelle génération
    if (cars.length === 0) {
        nextGeneration();
        generation++;
    }

    // 3. Dessin

    // Afficher les Checkpoints (d'abord pour être dessous)
    for (let i = 0; i < checkpoints.length; i++) {
        checkpoints[i].show();
        // Affichage du numéro du checkpoint pour debug
        let center = p5.Vector.add(checkpoints[i].a, checkpoints[i].b).div(2);
        fill(255, 100);
        noStroke();
        textSize(10);
        textAlign(CENTER, CENTER);
        text(i, center.x, center.y);
    }

    // Afficher les Murs
    for (let wall of walls) {
        wall.show();
    }

    // Afficher les voitures (sauf la meilleure qu'on dessine à la fin)
    for (let car of cars) {
        if (car !== bestCar) car.show(false);
    }

    // Afficher la meilleure (pour qu'elle soit au dessus)
    if (bestCar) {
        bestCar.show(true);
        // Debug : Ligne vers le prochain checkpoint
        if (checkpoints.length > 0) {
            let target = checkpoints[bestCar.checkpointIndex % checkpoints.length];
            // Centre du checkpoint
            let center = p5.Vector.add(target.a, target.b).div(2);
            stroke(0, 0, 255);
            line(bestCar.pos.x, bestCar.pos.y, center.x, center.y);
        }
    } else if (cars.length > 0) {
        cars[0].show(true); // Fallback
    }

    drawHUD();
}

function checkCollisions(car) {
    // Collision Murs UNIQUEMENT (pas checkpoints)
    for (let w of walls) {
        if (distPointToSegment(car.pos, w.a, w.b) < car.width / 1.8) {
            car.dead = true;
            return; // Une seule collision suffit
        }
    }

    // Limites écran
    if (car.pos.x < 0 || car.pos.x > width || car.pos.y < 0 || car.pos.y > height) {
        car.dead = true;
    }

    // Timeout ? Si score n'augmente pas... (à faire plus tard)
}

function drawHUD() {
    // Ombre portée pour la lisibilité
    fill(0, 150);
    noStroke();
    textSize(18);
    textAlign(LEFT);

    const marginX = 50;
    const startY = 32;
    const spacing = 25;

    // Dessin du texte (Ombre)
    text("Génération: " + generation, marginX + 1, startY + 1);
    text("Voitures en vie: " + cars.filter(c => !c.dead).length, marginX + 1, startY + spacing + 1);

    let bestScoreCurrent = 0;
    if (cars.length > 0) {
        bestScoreCurrent = Math.max(...cars.map(c => c.score));
    }
    text("Meilleur score: " + bestScoreCurrent.toFixed(0), marginX + 1, startY + spacing * 2 + 1);

    // Dessin du texte (Principal)
    fill(255);
    text("Génération: " + generation, marginX, startY);
    text("Voitures en vie: " + cars.filter(c => !c.dead).length, marginX, startY + spacing);
    text("Meilleur score: " + bestScoreCurrent.toFixed(0), marginX, startY + spacing * 2);

    if (trainingFinished) {
        textAlign(CENTER, CENTER);
        textSize(48);
        fill(0, 255, 0);
        stroke(0);
        strokeWeight(4);
        text("ENTRAÎNEMENT TERMINÉ", width / 2, height / 2);
        noStroke();
        textAlign(LEFT); // Reset for subsequent draws if needed
        textSize(16); // Reset for subsequent draws if needed
    }
}
