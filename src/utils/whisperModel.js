export class WhisperModelManager {
  constructor() {
    this.worker = null;
    this.status = 'idle'; // idle, loading, ready, transcribing, error
    this.currentModelName = '';
    this.currentDevice = 'webgpu'; // webgpu or wasm
    this.currentMirror = 'https://hf-mirror.com';
    this.onStatusChange = null;
    this.onProgress = null;
    this.resolveTranscription = null;
    this.rejectTranscription = null;
  }

  init(modelName = 'Xenova/whisper-tiny', device = 'webgpu', hfMirror = 'https://hf-mirror.com', onStatusChange = null, onProgress = null) {
    if (onStatusChange) this.onStatusChange = onStatusChange;
    if (onProgress) this.onProgress = onProgress;
    
    const prevModel = this.currentModelName;
    const prevDevice = this.currentDevice;
    const prevMirror = this.currentMirror;
    this.currentModelName = modelName;
    this.currentDevice = device;
    this.currentMirror = hfMirror;
 
    if (this.worker) {
      // Worker already exists. If loading a different model, post a load message.
      if (prevModel !== modelName || prevDevice !== device || prevMirror !== hfMirror) {
        this.status = 'loading';
        if (this.onStatusChange) this.onStatusChange('loading', `Switching model to ${modelName} on ${device.toUpperCase()}...`);
        this.worker.postMessage({ type: 'load', modelName, device, hfMirror });
      }
      return;
    }

    this.status = 'loading';
    if (this.onStatusChange) this.onStatusChange('loading', 'Initializing Web Worker...');

    // Load web worker using Vite-compatible URL format
    this.worker = new Worker(
      new URL('./whisperWorker.js', import.meta.url),
      { type: 'module' }
    );

    this.worker.addEventListener('message', (event) => {
      const { status, message, progress, file, text, duration, error } = event.data;

      if (status === 'loading') {
        this.status = 'loading';
        if (this.onStatusChange) this.onStatusChange('loading', message);
      } else if (status === 'progress') {
        if (this.onProgress) {
          this.onProgress({
            file,
            progress: Math.round(progress)
          });
        }
      } else if (status === 'ready') {
        this.status = 'ready';
        this.currentDevice = event.data.device || device;
        if (this.onStatusChange) this.onStatusChange('ready', message || `AI model is loaded on ${this.currentDevice.toUpperCase()}.`);
      } else if (status === 'transcribing') {
        this.status = 'transcribing';
        if (this.onStatusChange) this.onStatusChange('transcribing', message);
      } else if (status === 'completed') {
        this.status = 'ready';
        if (this.onStatusChange) this.onStatusChange('ready', `Transcribed in ${duration}s.`);
        if (this.resolveTranscription) {
          this.resolveTranscription({ text, duration });
        }
      } else if (status === 'error' || error) {
        this.status = 'error';
        if (this.onStatusChange) this.onStatusChange('error', error || message);
        if (this.rejectTranscription) {
          this.rejectTranscription(new Error(error || message));
        }
      }
    });

    this.worker.addEventListener('error', (errorEvent) => {
      console.error('Web worker error caught:', errorEvent);
      this.status = 'error';
      const errMsg = errorEvent.message || 'Web Worker crashed (likely out of memory). Try switching to whisper.cpp runtime.';
      if (this.onStatusChange) this.onStatusChange('error', errMsg);
      if (this.rejectTranscription) {
        this.rejectTranscription(new Error(errMsg));
      }
    });

    // Trigger load
    this.worker.postMessage({ type: 'load', modelName, device, hfMirror });
  }

  async transcribe(audioInput, options = {}) {
    if (this.status === 'transcribing') {
      throw new Error('Transcription already in progress.');
    }

    const modelToUse = options.modelName || this.currentModelName || 'Xenova/whisper-tiny';

    return new Promise(async (resolve, reject) => {
      this.resolveTranscription = resolve;
      this.rejectTranscription = reject;

      try {
        // Auto-initialize worker if not initialized yet
        if (!this.worker) {
          this.init(modelToUse);
        }

        let float32Data;
        if (audioInput instanceof Float32Array) {
          float32Data = audioInput;
        } else if (audioInput) {
          // Decode Blob/File
          const arrayBuffer = await audioInput.arrayBuffer();
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          const tempCtx = new AudioContextClass();
          const decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer);
          const rawPCM = decodedBuffer.getChannelData(0);
          const originalRate = decodedBuffer.sampleRate;
          await tempCtx.close();

          // Resample inline to 16000Hz if needed
          if (originalRate !== 16000) {
            const ratio = originalRate / 16000;
            const newLen = Math.round(rawPCM.length / ratio);
            float32Data = new Float32Array(newLen);
            let offsetResult = 0;
            let offsetBuffer = 0;
            while (offsetResult < float32Data.length) {
              const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
              let accum = 0;
              let count = 0;
              for (let i = offsetBuffer; i < nextOffsetBuffer && i < rawPCM.length; i++) {
                accum += rawPCM[i];
                count++;
              }
              float32Data[offsetResult] = count > 0 ? accum / count : rawPCM[offsetBuffer];
              offsetResult++;
              offsetBuffer = nextOffsetBuffer;
            }
          } else {
            float32Data = rawPCM;
          }
        } else {
          throw new Error('No audio input provided to transcribe.');
        }

        if (this.worker) {
          this.worker.postMessage({
            type: 'transcribe',
            audioData: float32Data,
            modelName: modelToUse,
            device: options.device || this.currentDevice || 'webgpu',
            hfMirror: options.hfMirror || this.currentMirror || 'https://hf-mirror.com',
            options
          });
        } else {
          reject(new Error('Worker could not be initialized.'));
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.status = 'idle';
      this.currentModelName = '';
    }
  }
}
export const whisperManager = new WhisperModelManager();
export default whisperManager;
