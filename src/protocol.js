// SPDX-License-Identifier: GPL-3.0-only
export const PROTOCOL = 'usi-bridge-v1';
export function parseParentOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return /^(https?:)$/.test(url.protocol) && url.origin === value ? value : null;
  } catch { return null; }
}
export function validConnect(event, parent, origin) {
  const data = event.data;
  return Boolean(origin && event.source === parent && event.origin === origin &&
    data?.protocol === PROTOCOL && data.type === 'connect' &&
    typeof data.session_id === 'string' && data.session_id.length > 0 &&
    data.session_id.length <= 128 && event.ports?.length === 1);
}
/** 受信ポートのメッセージ種別。dispose はホストからの明示的な終了要求(エンジンを確実に停止する)。 */
export function classifyPortMessage(data) {
  if (data?.type === 'dispose') return 'dispose';
  return data?.type === 'command' && validCommand(data.line) ? 'command' : 'invalid';
}
export function validCommand(line) {
  // Exclude engine maintenance/training commands: the public bridge is a USI endpoint.
  return typeof line === 'string' && line.length <= 16384 && !/[\r\n\0]/.test(line) &&
    /^(?:usi|isready|usinewgame|stop|quit|ponderhit|gameover(?: (?:win|lose|draw))?|setoption name [^\r\n]+|position (?:sfen [^\r\n]+|startpos(?: moves [^\r\n]+)?)|go(?: [^\r\n]+)?)$/.test(line);
}
