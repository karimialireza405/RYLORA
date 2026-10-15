# Visible, smooth cover pulse — 2026-10-15

The user found the initial average-bass scale effect imperceptible, then found a stronger fast-attack version too abrupt. The final motion uses real musical attacks to excite a damped spring, producing a gradual swell and soft return.

AudioPulseEnvelope measures positive differences between successive native FFT frames over bands 2–51, weighting low frequencies more strongly. An adaptive flux threshold and 180ms retrigger interval isolate attacks. Sustained unchanged audio does not generate repeating beats. An impulse decays over 180ms, driving a spring with frequency parameter 20 and damping ratio 0.95. Stable integration substeps run at at most 1/120 second. The cover updates at display refresh rate, independent of the approximately 30Hz FFT. Scale is capped at 1.08 without layout reflow. Reduced motion, pause, stale frames and hidden/offscreen cleanup remain supported.

Validation:

- Three behavior tests cover silence/steady audio without artificial beats, visible gradual expansion and settling on a real input attack, per-frame continuity, and stale-stream settling. All 30 frontend tests passed.
- In the running Windows app, 240 read-only samples during the user's actual playback measured scale 1.004–1.04663. The large cover's rendered width varied by 19.95 CSS pixels. The largest adjacent scale difference was 0.01145, with sample intervals no greater than 25.8ms. Both current cover and footer thumbnail were active. This sample did not mute, seek or alter playback.
- The preceding stronger transient version passed seven native checks for real-audio scale response, scale limits, pause settling and reduced-motion behavior. Its abrupt attack was then replaced with the tested spring interpolation. A first smooth-version run while the app was backgrounded exceeded the raw adjacent-sample delta threshold; the foreground read-only sample above verifies the displayed final motion.

The native app remains open with live changes. No music files, queue or metadata were changed by this implementation.
