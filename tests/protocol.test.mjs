import test from 'node:test';
import assert from 'node:assert/strict';
import { parseParentOrigin, validConnect, validCommand } from '../src/protocol.js';
test('accept only a canonical HTTP origin', () => {
  assert.equal(parseParentOrigin('https://example.com'), 'https://example.com');
  for (const origin of ['null', 'javascript:alert(1)', 'https://example.com/path', 'https://a.com@b.com', 'https://a.com/']) assert.equal(parseParentOrigin(origin), null);
});
test('bind the transferred port to the exact parent origin and window', () => {
  const parent = {};
  const event = { source: parent, origin: 'https://example.com', ports: [{}], data: {protocol:'usi-bridge-v1',type:'connect',session_id:'test'} };
  assert.equal(validConnect(event, parent, event.origin), true);
  assert.equal(validConnect({...event,source:{}},parent,event.origin),false);
  assert.equal(validConnect({...event,origin:'https://evil.example'},parent,event.origin),false);
  assert.equal(validConnect({...event,ports:[]},parent,event.origin),false);
});
test('USI commands exclude newline injection and maintenance commands', () => {
  for (const command of ['usi','isready','stop','quit','position startpos','position sfen 4k4/9 b - 1','go movetime 3000','setoption name Threads value 1']) assert.equal(validCommand(command),true);
  for (const command of ['usi\nquit','usi\rquit','learn','gensfen random',null,'x'.repeat(17000)]) assert.equal(validCommand(command),false);
});
import { classifyPortMessage } from '../src/protocol.js';
test('port messages are classified: dispose is an explicit host request, anything else must be a valid command', () => {
  assert.equal(classifyPortMessage({ type: 'dispose' }), 'dispose');
  assert.equal(classifyPortMessage({ type: 'command', line: 'isready' }), 'command');
  for (const data of [null, undefined, {}, { type: 'command', line: 'learn' }, { type: 'command' }, { type: 'x' }]) assert.equal(classifyPortMessage(data), 'invalid');
});
