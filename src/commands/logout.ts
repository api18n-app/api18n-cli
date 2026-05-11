import kleur from 'kleur';
import { clearCredentials, readCredentials } from '../credentials.js';

export function runLogout(): void {
  const existing = readCredentials();
  if (!existing) {
    console.log(kleur.gray('You are not signed in.'));
    return;
  }
  clearCredentials();
  console.log(kleur.green('✓'), 'Signed out.');
}
