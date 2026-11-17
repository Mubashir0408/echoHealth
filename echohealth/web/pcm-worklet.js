// Resample the actual capture rate to 16 kHz; carry fractional positions across blocks.
class PCMProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.position = 0; this.base = 0; this.previous = 0; this.output = []; }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const step = sampleRate / 16000;
    while (this.position < this.base + channel.length - 1) {
      const local = this.position - this.base;
      const i = Math.floor(local), fraction = local - i;
      const a = i < 0 ? this.previous : channel[i];
      const b = channel[i + 1];
      const value = Math.max(-1, Math.min(1, a + (b - a) * fraction));
      this.output.push(Math.round(value * (value < 0 ? 32768 : 32767)));
      this.position += step;
      if (this.output.length === 31200) {
        const pcm = new ArrayBuffer(this.output.length * 2), view = new DataView(pcm);
        this.output.forEach((v, k) => view.setInt16(k * 2, v, true));
        this.port.postMessage(pcm, [pcm]); this.output = [];
      }
    }
    this.previous = channel[channel.length - 1]; this.base += channel.length;
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
