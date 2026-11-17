const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// Execute the actual worklet at common device rates and compare emitted PCM.
for (const rate of [16000, 44100, 48000]) {
  let Processor;
  const chunks = [];
  const sandbox = {sampleRate: rate, AudioWorkletProcessor: class { constructor() { this.port = {postMessage: data => chunks.push(data)}; } },
    registerProcessor: (_, cls) => { Processor = cls; }, ArrayBuffer, DataView, Math};
  vm.runInNewContext(fs.readFileSync('echohealth/web/pcm-worklet.js', 'utf8'), sandbox);
  const processor = new Processor();
  const blocks = Math.ceil(rate * 4 / 128);
  for (let block = 0; block < blocks; block++) {
    const input = Float32Array.from({length:128}, (_, i) => .5 * Math.sin(2 * Math.PI * 440 * (block * 128 + i) / rate));
    assert.equal(processor.process([[input]]), true);
  }
  assert.equal(chunks.length, 2, `chunk count at ${rate}`);
  const view = new DataView(chunks[0]);
  assert.equal(view.byteLength, 62400);
  let error = 0;
  for (let i = 0; i < 31200; i++) error += Math.abs(view.getInt16(i*2, true) / 32768 - .5 * Math.sin(2*Math.PI*440*i/16000));
  assert.ok(error / 31200 < .002, `resampling accuracy at ${rate}`);
}
console.log('Worklet PCM tests passed: 16 kHz, 44.1 kHz, 48 kHz');
