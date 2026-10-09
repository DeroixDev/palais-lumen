// Every floor of the casino. To add one: copy a floor file, change layout and theme,
// and register it here. The elevator lists floors by their `floor` number.
import { registerRoom } from '../core/registry';
import { f1 } from './f1';
import { f2 } from './f2';
import { f3 } from './f3';
import { f4 } from './f4';
import { f5 } from './f5';

for (const f of [f1, f2, f3, f4, f5]) registerRoom(f);
