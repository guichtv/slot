// Cue registry: order here = order in manifest.json.
import ui from './ui.mjs';
import game from './game.mjs';
import celebrate from './celebrate.mjs';

export const CUES = [...ui, ...game, ...celebrate];
