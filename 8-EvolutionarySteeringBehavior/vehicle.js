// Daniel Shiffman
// The Coding Train
// Coding Challenge 69: Steering Evolution
// Part 1: https://youtu.be/flxOkx0yLrY
// Part 2: https://youtu.be/XaOVH8ZSRNA
// Part 3: https://youtu.be/vZUWTlK7D2Q
// Part 4: https://youtu.be/ykOcaInciBI
// Part 5: https://youtu.be/VnFF5V5DS8s

// https://editor.p5js.org/codingtrain/sketches/xgQNXkxx1

var mr = 0.01;

class Vehicle {
  constructor(x, y, dna) {
    this.acc = createVector(0, 0);
    this.vel = createVector(0, -2);
    this.pos = createVector(x, y);
    this.r = 4;
    this.maxSpeed = 5;
    this.maxForce = 0.5;

    // La vie, à zéro le véhicule est mort
    this.health = 1;

    // 4 gènes : poids de la force d'attraction vers la nourriture, 
    //           poids  de la force d'attraction vers le poison, 
    //           perception de la nourriture (rayon cercle de détection), 
    //           perception du poison (rayon cercle de détection)
    this.dna = [];

    // si le paramètre dna est défini alors on est dans un cas de mutation
    // si il est undefined alors on crée des gènes aléatoires pour un nouvel individu
    if (dna === undefined) {
      // Food weight
      this.dna[0] = random(-2, 2);
      // Poison weight
      this.dna[1] = random(-2, 2);
      // Food perception (rayon cercle de détection)
      this.dna[2] = random(0, 100);
      // Poison Perception (rayon cercle de détection)
      this.dna[3] = random(0, 100);
    } else {
      // Mutation lors d'un clonage, on va recréer 
      // un individu avec des gènes légèrement modifiés
      // poids des forces d'attraction / répulsion de la nourriture et du poison
      this.dna[0] = dna[0];
      // mr = mutation rate (en général très petit comme 0.01, soit une fois
      // sur 100)
      if (random(1) < mr) {
        // et on donne une petite variation aléatoire entre des très petites valeurs
        // ici entre -0.1 et 0.1
        this.dna[0] += random(-0.1, 0.1);
      }
      this.dna[1] = dna[1];
      if (random(1) < mr) {
        this.dna[1] += random(-0.1, 0.1);
      }
      // rayons de perception, +/- 10 pixels pour la mutation
      this.dna[2] = dna[2];
      if (random(1) < mr) {
        this.dna[2] += random(-10, 10);
      }
      this.dna[3] = dna[3];
      if (random(1) < mr) {
        this.dna[3] += random(-10, 10);
      }
    }
  }


  // Method to update location
  update() {

    // 60 fois par seconde, on perd de la vie, d'où la 
    // nécessité de se nourrir.
    // à chaque frame on perd 0.005 de vie, donc à 60 images par
    // seconde, on perd 0.3 de vie par seconde
    this.health -= 0.005;

    // Update velocity
    this.vel.add(this.acc);
    // Limit speed
    this.vel.limit(this.maxSpeed);
    this.pos.add(this.vel);
    // Reset accelerationelertion to 0 each cycle
    this.acc.mult(0);
  }

  applyForce(force) {
    // We could add mass here if we want A = F / M
    this.acc.add(force);
  }

  behaviors(good, bad) {
    // G = good (food)
    // B = bad (poison)
    // steerG = force qui attire vers la nourriture
    // steerB = force qui repousse du poison
    // 1er param = le tableau de nourriture (bonne ou poison)
    // 2ème param = ce qu'on va ajouter à la sante si on mange
    // sante = this.health
    // 3ème param = rayon de perception   
    const steerG = this.eat(good, 0.2, this.dna[2]);
    const steerB = this.eat(bad, -1, this.dna[3]);

    // on applique les poids des gènes
    steerG.mult(this.dna[0]);
    steerB.mult(this.dna[1]);

    // on applique les forces
    this.applyForce(steerG);
    this.applyForce(steerB);
  }

  clone() {
    // 2 sur mille de chances de clonage
    if (random(1) < 0.002) {
      return new Vehicle(this.pos.x, this.pos.y, this.dna);
    } else {
      return null;
    }
  }

  // comportement de recherche de nourriture
  // nutrition peut être positive (nourriture) ou négative (poison)
  // perception est le rayon de détection de la nourriture 
  // ou du poison
  eat(list, nutrition, perception) {
    let record = Infinity;
    let closest = null;

    // on parcourt la liste des éléments à manger
    // on cherche le plus proche
    for (let i = list.length - 1; i >= 0; i--) {
      const d = this.pos.dist(list[i]);

      // si l'élément est à portée
      // on le mange et on gagne de la vie ou on en perd
      // selon que c'est de la nourriture ou du poison
      // on a pris this.maxSpeed qui vaut 5 ici pour la distance
      // à partir de laquelle on mange l'élément. On aurait pu
      // definir une nouvelle variable
      if (d < 5) {
        list.splice(i, 1);
        this.health += nutrition;
      } else {
        // si l'élément n'est pas à portée, 
        // on cherche le plus proche
        if (d < record && d < perception) {
          // on garde en mémoire la distance et l'élément
          record = d;
          closest = list[i];
        }
      }
    }

    // This is the moment of eating!
    if (closest != null) {
      return this.seek(closest);
    }

    return createVector(0, 0);
  }

  // A method that calculates a steering force towards a target
  // STEER = DESIRED MINUS VELOCITY
  seek(target) {
    const desired = p5.Vector.sub(target, this.pos); // A vector pointing from the location to the target

    // Scale to maximum speed
    desired.setMag(this.maxSpeed);

    // Steering = Desired minus velocity
    const steer = p5.Vector.sub(desired, this.vel);
    steer.limit(this.maxForce); // Limit to maximum steering force

    return steer;
  }

  dead() {
    return (this.health <= 0)
  }

  display() {
    // Draw a triangle rotated in the direction of velocity
    const angle = this.vel.heading() + PI / 2;

    push();
    translate(this.pos.x, this.pos.y);
    rotate(angle);

    if (debug.checked()) {
      strokeWeight(3);
      stroke(0, 255, 0);
      noFill();
      line(0, 0, 0, -this.dna[0] * 25);
      strokeWeight(2);
      ellipse(0, 0, this.dna[2] * 2);
      stroke(255, 0, 0);
      line(0, 0, 0, -this.dna[1] * 25);
      ellipse(0, 0, this.dna[3] * 2);
    }

    const gr = color(0, 255, 0);
    const rd = color(255, 0, 0);
    // couleur qui varie en fonction de la santé de l'individu
    // lerpColor est une fonction p5 qui permet de faire une interpolation linéaire
    // entre deux couleurs. Ici on fait une interpolation linéaire entre la couleur rouge
    // et la couleur verte en fonction de la santé de l'individu
    const col = lerpColor(rd, gr, this.health);

    fill(col);
    stroke(col);
    strokeWeight(1);
    beginShape();
    vertex(0, -this.r * 2);
    vertex(-this.r, this.r * 2);
    vertex(this.r, this.r * 2);
    endShape(CLOSE);

    pop();
  }


  // Exerce une force renvoyant vers le centre du canvas si le véhicule s'approche
  // des bords du canvas
  boundaries() {
    const d = 25;

    let desired = null;

    // si le véhicule est trop à gauche ou trop à droite
    if (this.pos.x < d) {
      desired = createVector(this.maxSpeed, this.vel.y);
    } else if (this.pos.x > width - d) {
      desired = createVector(-this.maxSpeed, this.vel.y);
    }

    if (this.pos.y < d) {
      desired = createVector(this.vel.x, this.maxSpeed);
    } else if (this.pos.y > height - d) {
      desired = createVector(this.vel.x, -this.maxSpeed);
    }

    if (desired !== null) {
      desired.normalize();
      desired.mult(this.maxSpeed);
      const steer = p5.Vector.sub(desired, this.vel);
      steer.limit(this.maxForce);
      this.applyForce(steer);
    }
  }
}