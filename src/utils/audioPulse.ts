/** Detect attacks in native FFT frames; no clock-generated beats or BPM guess. */
export class AudioPulseEnvelope {
  private previous = new Float32Array(52);
  private receivedAt = 0;
  private fluxMean = 0.008;
  private fluxPeak = 0.025;
  private lastBeat = -Infinity;
  private impulse = 0;
  private envelope = 0;
  private velocity = 0;

  step(bands: ArrayLike<number>, receivedAt: number, now: number, dt: number): number {
    const fresh = receivedAt > 0 && now - receivedAt < 300;
    this.impulse *= Math.exp(-dt / 0.18);
    if (fresh && receivedAt !== this.receivedAt) {
      const frameDt = this.receivedAt
        ? Math.min(0.1, (receivedAt - this.receivedAt) / 1000)
        : dt;
      let flux = 0, energy = 0, weights = 0;
      for (let i = 2; i < 52; i++) {
        const value = (bands[i] ?? 0) / 255;
        const weight = i < 28 ? 1.4 : 0.6;
        flux += Math.max(0, value - this.previous[i]!) * weight;
        energy += value * weight;
        weights += weight;
        this.previous[i] = value;
      }
      flux /= weights;
      energy /= weights;
      // Initialize from the first frame, rather than interpreting startup as a kick.
      if (this.receivedAt && energy > 0.035) {
        const threshold = Math.max(0.002, this.fluxMean * 1.35);
        this.fluxPeak = Math.max(flux, this.fluxPeak * Math.exp(-frameDt / 3), 0.004);
        if (flux > threshold && now - this.lastBeat >= 180) {
          const strength = (flux - this.fluxMean * 0.4) / this.fluxPeak;
          this.impulse = Math.max(this.impulse, Math.min(1, Math.max(0.5, strength * 1.25)));
          this.lastBeat = now;
        }
      }
      this.fluxMean += (flux - this.fluxMean) * (1 - Math.exp(-frameDt / 1.2));
      this.receivedAt = receivedAt;
    }
    if (!fresh) this.impulse = 0;
    // A damped spring gives each real attack a continuous swell and soft landing.
    // Small integration steps keep the motion stable on lower-refresh displays.
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const acceleration = (this.impulse - this.envelope) * 400 - this.velocity * 38;
      this.velocity += acceleration * h;
      this.envelope += this.velocity * h;
    }
    // Eight percent is visible on the large stage while keeping the layout fixed.
    return 1 + Math.min(1, Math.max(0, this.envelope)) * 0.08;
  }
}
