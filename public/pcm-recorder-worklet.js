// public/pcm-recorder-worklet.js

class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    // Buffer size ~40ms of 16kHz audio = 640 samples
    this.bufferSize = 640;
    this.buffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // Mono Float32Array (-1.0 to 1.0)
    const inputSampleRate = sampleRate; // Browser native sample rate (e.g. 44100 or 48000)
    const ratio = inputSampleRate / this.targetSampleRate;

    // Linear downsampling to 16kHz & Float32 -> Int16 PCM conversion
    for (let i = 0; i < channelData.length; i += ratio) {
      const idx = Math.floor(i);
      let s = channelData[idx];

      // Clamp value between -1 and 1
      s = Math.max(-1, Math.min(1, s));
      // Convert to 16-bit PCM integer
      const pcm16 = s < 0 ? s * 0x8000 : s * 0x7FFF;

      this.buffer[this.bufferIndex++] = Math.round(pcm16);

      // Once we have a ~40ms chunk (640 samples), dispatch it to the main thread
      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage(this.buffer.buffer, [this.buffer.buffer]);
        this.buffer = new Int16Array(this.bufferSize);
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-recorder-worklet', PCMRecorderProcessor);