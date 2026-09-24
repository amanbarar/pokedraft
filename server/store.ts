import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RoomRecord } from './rooms.ts';

/** Debounced JSON-file persistence for rooms. */
export class RoomStore {
  private pending: NodeJS.Timeout | null = null;

  constructor(private file: string, private getRooms: () => RoomRecord[]) {}

  load(): RoomRecord[] {
    if (!existsSync(this.file)) return [];
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as RoomRecord[];
    } catch (err) {
      console.error(`Could not read ${this.file}, starting fresh`, err);
      return [];
    }
  }

  scheduleSave() {
    if (this.pending) return;
    this.pending = setTimeout(() => this.flush(), 500);
  }

  flush() {
    if (this.pending) clearTimeout(this.pending);
    this.pending = null;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.getRooms()));
    renameSync(tmp, this.file);
  }
}
