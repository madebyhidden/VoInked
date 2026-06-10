import { 
  pipeline, 
  env, 
  AutoModelForSpeechSeq2Seq, 
  WhisperForConditionalGeneration,
  LiteWhisperForConditionalGeneration,
  MoonshineForConditionalGeneration
} from '@huggingface/transformers';

// Prevent Rollup tree-shaking of essential models
const _keepSpeechModels = [
  AutoModelForSpeechSeq2Seq,
  WhisperForConditionalGeneration,
  LiteWhisperForConditionalGeneration,
  MoonshineForConditionalGeneration
];
console.log("Initialized ASR worker pipeline. Bundled models:", _keepSpeechModels.map(m => m.name).join(', '));

// Disable local model path checks, always fetch from HF CDN and cache locally in IndexedDB
env.allowLocalModels = false;

let pipe = null;
let currentModelName = '';
let currentDevice = '';

async function getPipeline(targetModel, device = 'webgpu', progressCallback) {
  if (pipe && currentModelName === targetModel && currentDevice === device) return pipe;
  
  if (currentModelName !== targetModel || currentDevice !== device) {
    pipe = null;
  }
  
  try {
    pipe = await pipeline('automatic-speech-recognition', targetModel, {
      progress_callback: progressCallback,
      device: device,
    });
    currentDevice = device;
  } catch (err) {
    if (device === 'webgpu') {
      console.warn("WebGPU not supported or failed to compile. Falling back to CPU (WASM):", err);
      pipe = await pipeline('automatic-speech-recognition', targetModel, {
        progress_callback: progressCallback,
        device: 'wasm',
      });
      currentDevice = 'wasm';
    } else {
      throw err;
    }
  }
  
  currentModelName = targetModel;
  return pipe;
}

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
  const { type, audioData, options, modelName, device, hfMirror } = event.data;
  const targetDevice = device || 'webgpu';
  const targetMirror = hfMirror || 'https://hf-mirror.com';

  if (type === 'load') {
    const targetModel = modelName || 'Xenova/whisper-tiny';
    env.remoteHost = targetMirror;
    try {
      self.postMessage({ status: 'loading', message: `Initializing model ${targetModel} on ${targetDevice}...` });
      
      await getPipeline(targetModel, targetDevice, (data) => {
        if (data.status === 'initiate') {
          self.postMessage({
            status: 'loading',
            message: `Initiating download of ${data.file || 'model components'}...`
          });
        } else if (data.status === 'progress') {
          self.postMessage({
            status: 'progress',
            file: data.file,
            progress: data.progress,
            loaded: data.loaded,
            total: data.total
          });
        } else if (data.status === 'done') {
          self.postMessage({
            status: 'loading',
            message: `Finished downloading ${data.file || 'model components'}. Preparing compilation...`
          });
        } else if (data.status === 'ready') {
          self.postMessage({
            status: 'loading',
            message: `Loaded ${data.file || 'model components'}. Compiling ONNX model...`
          });
        }
      });

      self.postMessage({ 
        status: 'ready', 
        message: `Whisper AI is ready with ${targetModel} on ${currentDevice.toUpperCase()}!`,
        device: currentDevice
      });
    } catch (error) {
      self.postMessage({ status: 'error', message: 'Failed to load model: ' + error.message });
    }
  }

  if (type === 'transcribe') {
    try {
      const targetModel = modelName || currentModelName || 'Xenova/whisper-tiny';
      const runDevice = device || currentDevice || 'webgpu';
      const targetMirror = hfMirror || 'https://hf-mirror.com';
      env.remoteHost = targetMirror;
      if (!pipe || currentModelName !== targetModel || currentDevice !== runDevice) {
        self.postMessage({ status: 'loading', message: `Model not loaded. Loading ${targetModel} on ${runDevice}...` });
        await getPipeline(targetModel, runDevice);
      }

      self.postMessage({ status: 'transcribing', message: `Analyzing audio on ${currentDevice.toUpperCase()}...` });

      // Run transcription
      const startTime = performance.now();
      
      // We pass the mono Float32Array to the pipeline
      const result = await pipe(audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language: options?.language || null, // null auto-detects language
        task: 'transcribe',
        return_timestamps: false
      });

      const duration = ((performance.now() - startTime) / 1000).toFixed(2);
      
      self.postMessage({
        status: 'completed',
        text: result.text,
        duration: duration,
        device: currentDevice
      });
    } catch (error) {
      self.postMessage({ status: 'error', message: 'Transcription failed: ' + error.message });
    }
  }
});
