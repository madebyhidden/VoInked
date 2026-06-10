function downsampleBuffer(buffer, sampleRate, outSampleRate = 16000) {
  if (outSampleRate === sampleRate) {
    return buffer;
  }
  const sampleRateRatio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : buffer[offsetBuffer];
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

/**
 * Helper to record audio using MediaRecorder and decode it to 16kHz mono WAV for Whisper.
 */
export class AudioRecorder {
  constructor() {
    this.audioContext = null;
    this.stream = null;
    this.source = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }

  async start(onWaveformCallback) {
    this.chunks = [];
    
    // Request microphone access
    this.stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      } 
    });

    // Start MediaRecorder (native, robust)
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };
    this.mediaRecorder.start(100); // collect chunks every 100ms

    // Set up AudioContext & Analyser solely for visualizer rendering
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextClass();
    await this.audioContext.resume();
    
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 256;
    this.source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const drawWave = () => {
      if (!this.stream) return;
      analyser.getByteFrequencyData(dataArray);
      onWaveformCallback(Array.from(dataArray));
      requestAnimationFrame(drawWave);
    };
    drawWave();
  }

  async stop() {
    if (!this.mediaRecorder) return null;

    return new Promise((resolve) => {
      this.mediaRecorder.onstop = async () => {
        // Stop audio tracks
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }

        if (this.audioContext) {
          await this.audioContext.close();
          this.audioContext = null;
        }

        if (this.chunks.length === 0) {
          resolve(null);
          return;
        }

        // Combine chunks into single audio blob (WebM/Opus)
        const audioBlob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
        
        try {
          const arrayBuffer = await audioBlob.arrayBuffer();
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          // Decode raw audio context to Float32Array PCM at default hardware sample rate (highly compatible)
          const tempCtx = new AudioContextClass();
          const decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer);
          const float32DataOriginal = decodedBuffer.getChannelData(0);
          const originalSampleRate = decodedBuffer.sampleRate;
          await tempCtx.close();

          // Resample to 16000Hz in pure Javascript
          const float32Data = downsampleBuffer(float32DataOriginal, originalSampleRate, 16000);
          resolve(float32Data);
        } catch (e) {
          console.error('Failed to decode recording:', e);
          resolve(null);
        }
      };

      this.mediaRecorder.stop();
    });
  }
}

export function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  function floatTo16BitPCM(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  }

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM) */
  view.setUint16(20, 1, true);
  /* channel count (mono) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate */
  view.setUint32(28, sampleRate * 2, true);
  /* block align */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  floatTo16BitPCM(view, 44, samples);

  return buffer;
}
