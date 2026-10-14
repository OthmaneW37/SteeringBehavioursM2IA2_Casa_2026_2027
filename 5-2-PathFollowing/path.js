
class Path {
    constructor(x1, y1, x2, y2) {
      this.start = createVector(x1, y1);
      this.end = createVector(x2, y2);
      this.radius = 40;
    }
  
    show() {
      stroke(255);
      strokeWeight(2);
      line(this.start.x, this.start.y, this.end.x, this.end.y);
  
      // second parametre  de stroke() est l'opacité
      stroke(255, 20);
      strokeWeight(this.radius * 2);
      line(this.start.x, this.start.y, this.end.x, this.end.y);
    }
  }
  