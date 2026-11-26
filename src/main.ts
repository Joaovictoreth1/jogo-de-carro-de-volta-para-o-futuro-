import '@fontsource/orbitron/latin-400.css';
import '@fontsource/orbitron/latin-600.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import '@fontsource/vt323/latin-400.css';
import './styles.css';

import { browserAudioContextFactory, SynthAudio } from './audio/synth';
import { HighScoreStore, resolveStorage } from './core/storage';
import { isWebGLAvailable } from './core/webgl';
import { SunsetRace } from './game/game';

function showUnsupported(): void {
  for (const id of ['start-screen', 'ui-layer', 'mobile-controls']) {
    document.getElementById(id)?.setAttribute('hidden', '');
  }
  document.getElementById('unsupported-screen')?.removeAttribute('hidden');
}

function boot(): void {
  if (!isWebGLAvailable(() => document.createElement('canvas'))) {
    showUnsupported();
    return;
  }

  const highScore = new HighScoreStore(resolveStorage(() => window.localStorage));
  let game: SunsetRace | null = null;
  const audio = new SynthAudio(browserAudioContextFactory(), () => game?.mood ?? { combo: 1, overdrive: false });

  try {
    game = new SunsetRace(window, audio, highScore);
  } catch (error) {
    console.error('Failed to start the renderer', error);
    showUnsupported();
  }
}

boot();
