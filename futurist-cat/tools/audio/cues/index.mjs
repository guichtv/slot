// Cue registry: order here = order in manifest.json.
import ui from './ui.mjs';
import game from './game.mjs';
import celebrate from './celebrate.mjs';
import music from './music.mjs';
import ambience from './ambience.mjs';

export const CUES = [...ui, ...game, ...celebrate, ...music, ...ambience];
