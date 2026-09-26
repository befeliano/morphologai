// Kayıt işlemcisi (AudioWorklet): mikrofon örneklerini ~85 ms'lik bloklar hâlinde ana iş parçacığına iletir.
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = true;
    this.size = 4096;
    this.buf = new Float32Array(this.size);
    this.len = 0;
    this.port.onmessage = (e) => {
      const { cmd } = e.data || {};
      if (cmd === 'pause') this.recording = false;
      else if (cmd === 'resume') this.recording = true;
      else if (cmd === 'flush') { this.flush(); this.port.postMessage({ type: 'flushed' }); }
    };
  }

  flush() {
    if (!this.len) return;
    const out = this.buf.slice(0, this.len);
    this.port.postMessage({ type: 'chunk', samples: out }, [out.buffer]);
    this.len = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length || !this.recording) return true;
    const ch0 = input[0];
    const ch1 = input[1];
    for (let i = 0; i < ch0.length; i++) {
      this.buf[this.len++] = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
      if (this.len === this.size) this.flush();
    }
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
