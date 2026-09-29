/**
 * Creates and resumes an AudioContext synchronously, inside the user's
 * click/tap/key handler. Browsers (iOS Safari especially) only allow audio
 * to start from a context unlocked during such a gesture — so this tiny
 * helper ships with the page, while the audio engine itself is loaded on
 * demand afterwards.
 */
export function unlockAudioContext(): AudioContext {
  const context = new AudioContext({ latencyHint: "interactive" });
  // A silent one-sample buffer played inside the gesture completes the unlock on iOS.
  const silent = context.createBufferSource();
  silent.buffer = context.createBuffer(1, 1, context.sampleRate);
  silent.connect(context.destination);
  silent.start();
  void context.resume();
  return context;
}
