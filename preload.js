const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('minimize-app'),
  maximize: () => ipcRenderer.send('maximize-app'),
  close: () => ipcRenderer.send('close-app'),
  writeClipboard: (text) => ipcRenderer.send('write-clipboard', text),
  getActiveWindowInfo: () => ipcRenderer.sendSync('get-active-window-info'),
  updateRecordingState: (state) => ipcRenderer.send('update-recording-state', state),
  sendTranscriptionToOverlay: (text) => ipcRenderer.send('send-transcription-to-overlay', text),
  sendWaveformToOverlay: (waveform) => ipcRenderer.send('send-waveform-to-overlay', waveform),
  pasteTranscription: (pasteMethod) => ipcRenderer.send('paste-transcription', pasteMethod),
  onWaveformUpdate: (callback) => {
    const subscription = (event, wave) => callback(wave);
    ipcRenderer.on('waveform-update', subscription);
    return () => ipcRenderer.removeListener('waveform-update', subscription);
  },
  
  onRecordingToggled: (callback) => {
    const subscription = (event, isRecording) => callback(isRecording);
    ipcRenderer.on('recording-toggled', subscription);
    return () => ipcRenderer.removeListener('recording-toggled', subscription);
  },
  
  onStartRecording: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('start-recording', subscription);
    return () => ipcRenderer.removeListener('start-recording', subscription);
  },
  
  onStopRecording: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('stop-recording', subscription);
    return () => ipcRenderer.removeListener('stop-recording', subscription);
  },

  onTranscriptionPreview: (callback) => {
    const subscription = (event, text) => callback(text);
    ipcRenderer.on('transcription-preview', subscription);
    return () => ipcRenderer.removeListener('transcription-preview', subscription);
  },

  onNavigateTo: (callback) => {
    const subscription = (event, page) => callback(page);
    ipcRenderer.on('navigate-to', subscription);
    return () => ipcRenderer.removeListener('navigate-to', subscription);
  },

  saveTempWav: (arrayBuffer) => ipcRenderer.invoke('save-temp-wav', arrayBuffer),
  transcribeWhisperCpp: (args) => ipcRenderer.invoke('transcribe-whisper-cpp', args),
  startWhisperServer: (args) => ipcRenderer.invoke('start-whisper-server', args),
  stopWhisperServer: () => ipcRenderer.invoke('stop-whisper-server'),
  transcribeCustomCmd: (args) => ipcRenderer.invoke('transcribe-custom-cmd', args),
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  selectFolder: (options) => ipcRenderer.invoke('select-folder', options),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  setupNativeWhisper: (args) => ipcRenderer.invoke('setup-native-whisper', args),
  onNativeDownloadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('native-setup-progress', subscription);
    return () => ipcRenderer.removeListener('native-setup-progress', subscription);
  },
  onUpdateAvailable: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('update-available', subscription);
    return () => ipcRenderer.removeListener('update-available', subscription);
  },
  checkFileExists: (filePath) => ipcRenderer.invoke('check-file-exists', filePath),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path')
});
