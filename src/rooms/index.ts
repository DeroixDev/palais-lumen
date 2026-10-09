// Every room in the casino. To add one: copy lobby.ts, change layout and theme,
// register it here and add a door to it from an existing room.
import { registerRoom } from '../core/registry';
import { lobby } from './lobby';
import { vip } from './vip';

registerRoom(lobby);
registerRoom(vip);
