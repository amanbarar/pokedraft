const TOKEN_KEY = 'pokedraft:token';
const NAME_KEY = 'pokedraft:name';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

let memoryToken: string | null = null;

/** Secret per-browser token that lets you reclaim your seat after a refresh. */
export function getToken(): string {
  let token = read(TOKEN_KEY) ?? memoryToken;
  if (!token) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    write(TOKEN_KEY, token);
    memoryToken = token;
  }
  return token;
}

export function getName(): string {
  return read(NAME_KEY) ?? '';
}

export function setName(name: string) {
  write(NAME_KEY, name.trim());
}
