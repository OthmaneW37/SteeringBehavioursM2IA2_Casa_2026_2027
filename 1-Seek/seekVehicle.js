class SeekVehicle extends Vehicle {
  static debug = false;
  drawVelocityVector() {
    if (SeekVehicle.debug) super.drawVelocityVector();
  }
}
