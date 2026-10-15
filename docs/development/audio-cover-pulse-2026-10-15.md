# Audio-reactive cover pulse — 2026-10-15

The current playing cover subtly grows on bass attacks and settles back, using the native spectrum rather than a fixed repeating animation. Full player, listening panel and immersive covers inherit the pulse from their playing state; the transport thumbnail explicitly enables it during playback. Other library covers remain still.

`useAudioPulse` averages the lowest 24 native FFT bands and compares them with a 650ms moving baseline to emphasize rhythmic attacks. The envelope uses a 35ms attack and 200ms release, with scale capped at 1.024. DOM scale updates run at approximately 30fps without React updates or layout reflow. Pausing eases scale back to 1; reduced motion disables the pulse. Hidden/offscreen elements suspend drawing, and unmounting releases the shared spectrum consumer. Pulse works independently of the visualizer visibility preference.

Seven checks passed in the running native application during real, temporarily muted playback. Both the main cover and footer responded; 100 samples ranged from scale 1.00226 to 1.00658 on the current song. Scale stayed within the cap, paused covers returned to 1, and reduced motion kept them still while playing. The test restored the native playback position, playing state, mute setting, route and in-memory preferences. No music files, queue entries or metadata were changed.
