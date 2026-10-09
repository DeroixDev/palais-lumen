// Every game in the casino. To add one: create src/games/<name>/<name>.ts that
// exports a GameDefinition, register it here, then place it in a room (src/rooms).
import { registerGame } from '../core/registry';
import { slots } from './slots/slots';
import { roulette } from './roulette/roulette';

registerGame(slots);
registerGame(roulette);
