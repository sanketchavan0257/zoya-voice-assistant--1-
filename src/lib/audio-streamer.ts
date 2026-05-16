export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private micStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private playbackQueue: Int16Array[] = [];
  private isPlaying = false;

  constructor(
    private micSampleRate = 16000,
    private speakerSampleRate = 24000
  ) {}

  async startMic(onAudioData: (base64Data: string) => void, existingStream?: MediaStream) {
    try {
      // Use existing stream if provided, otherwise request new one
      if (existingStream) {
        this.micStream = existingStream;
      } else {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      // Create AudioContext AFTER getting stream
      this.audioContext = new AudioContext();
      const nativeSampleRate = this.audioContext.sampleRate;
      console.log("Native sample rate:", nativeSampleRate);

      // Now safe to use audioContext
      this.source = this.audioContext.createMediaStreamSource(this.micStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.processor.onaudioprocess = (e) => {
        if (!this.audioContext) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const resampled = this.resample(inputData, nativeSampleRate, this.micSampleRate);
        const pcm16 = this.float32ToInt16(resampled);
        const base64 = this.arrayBufferToBase64(pcm16.buffer);
        onAudioData(base64);
      };

    } catch (error: any) {
      this.stopMic();
      console.error("Mic error:", error.name, error.message);
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        throw new Error("No microphone found. Please plug in a mic or check your settings.");
      } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new Error("Microphone permission denied. Please allow mic access in your browser.");
      } else {
        throw new Error(`Mic initialization failed: ${error.message}`);
      }
    }
  }

  private resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return input;
    const ratio = fromRate / toRate;
    const outputLength = Math.round(input.length / ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const pos = i * ratio;
      const index = Math.floor(pos);
      const frac = pos - index;
      const a = input[index] || 0;
      const b = input[index + 1] || 0;
      output[i] = a + frac * (b - a);
    }
    return output;
  }

  stopMic() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.micStream?.getTracks().forEach(track => track.stop());
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.processor = null;
    this.source = null;
    this.micStream = null;
    this.audioContext = null;
  }

  async play(base64Audio: string) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: this.speakerSampleRate });
    }
    
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const pcm16 = new Int16Array(bytes.buffer);
    this.playbackQueue.push(pcm16);
    
    if (!this.isPlaying) {
      this.processQueue();
    }
  }

  private async processQueue() {
    if (this.playbackQueue.length === 0 || !this.audioContext) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const pcm16 = this.playbackQueue.shift()!;
    const float32 = this.int16ToFloat32(pcm16);
    
    const buffer = this.audioContext.createBuffer(1, float32.length, this.speakerSampleRate);
    buffer.getChannelData(0).set(float32);
    
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.onended = () => this.processQueue();
    source.start();
  }

  stopPlayback() {
    this.playbackQueue = [];
    this.isPlaying = false;
  }

  private float32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  private int16ToFloat32(int16Array: Int16Array): Float32Array {
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 0x8000;
    }
    return float32Array;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}
