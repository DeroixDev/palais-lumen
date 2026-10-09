// Every floor of the casino. To add one: copy a floor file, change layout and theme,
// and register it here. The elevator lists floors by their `floor` number.
import { registerRoom } from '../core/registry';
import { foyer } from './foyer';
import { f1 } from './f1';
import { f2 } from './f2';
import { f3 } from './f3';
import { f4 } from './f4';
import { f5 } from './f5';
import { f1side } from './f1side';
import { f2side } from './f2side';
import { f3side } from './f3side';
import { f4techno } from './f4techno';
import { f4hiphop } from './f4hiphop';

for (const f of [foyer, f1, f2, f3, f4, f5, f1side, f2side, f3side, f4techno, f4hiphop]) registerRoom(f);
