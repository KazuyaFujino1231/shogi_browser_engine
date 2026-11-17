// SPDX-License-Identifier: GPL-3.0-only
import { loadEngine } from './loader.js';
import { validCommand } from './protocol.js';
let engine;
const output = document.querySelector('#output');
const status = document.querySelector('#status');
const write = (line) => { output.textContent = (output.textContent + line + '\n').slice(-100000); };
document.querySelector('#start').onclick = async (event) => {
  event.target.disabled = true;
  status.textContent = 'エンジンを準備しています…';
  try {
    const loaded = await loadEngine(write);
    engine = loaded.module;
    status.textContent = loaded.engine.evaluation_model;
    document.querySelector('#send').disabled = false;
    engine.postMessage('usi');
  } catch (error) { status.textContent = error.message; }
};
document.querySelector('#commands').onsubmit = (event) => {
  event.preventDefault();
  const command = document.querySelector('#command').value;
  if (!engine || !validCommand(command)) return;
  write('> ' + command);
  engine.postMessage(command);
};
window.addEventListener('pagehide', () => engine?.terminate(), { once: true });
