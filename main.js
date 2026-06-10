import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray, clipboard, screen, nativeImage, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import fs from 'fs';
import https from 'https';
import http from 'http';

function downloadFileWithRedirects(urlStr, destPath, progressCallback, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects'));
    }

    const parsedUrl = new URL(urlStr);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    client.get(urlStr, (res) => {
      const { statusCode } = res;
      
      // Handle redirection
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        // Handle relative redirect URL
        if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
          redirectUrl = new URL(redirectUrl, parsedUrl.origin).toString();
        }
        return downloadFileWithRedirects(redirectUrl, destPath, progressCallback, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
      }

      if (statusCode !== 200) {
        return reject(new Error(`Failed to download: status code ${statusCode}`));
      }

      const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      let downloadedBytes = 0;
      const fileStream = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        fileStream.write(chunk);
        if (progressCallback && totalBytes > 0) {
          progressCallback(downloadedBytes, totalBytes);
        }
      });

      res.on('end', () => {
        fileStream.end();
        resolve();
      });

      res.on('error', (err) => {
        fileStream.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });

      fileStream.on('error', (err) => {
        fileStream.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function findExecutable(dirPath, binaryName) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const found = findExecutable(fullPath, binaryName);
      if (found) return found;
    } else if (file.toLowerCase() === binaryName.toLowerCase()) {
      return fullPath;
    }
  }
  return null;
}

function detectNvidiaGpu() {
  return new Promise((resolve) => {
    exec('nvidia-smi', (err) => {
      resolve(!err);
    });
  });
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let isRecording = false;
let keyListenerProcess = null;
let whisperServerProcess = null;
let activeWhisperServerModel = '';
let activeWhisperServerPort = 8080;

function startWhisperServer(binaryPath, modelPath, port = 8080) {
  return new Promise((resolve, reject) => {
    if (whisperServerProcess) {
      if (activeWhisperServerModel === modelPath && activeWhisperServerPort === port) {
        console.log('whisper-server is already running with the requested model.');
        return resolve(true);
      }
      stopWhisperServer();
    }

    const dir = path.dirname(binaryPath);
    const serverBinary = path.join(dir, process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server');

    if (!fs.existsSync(serverBinary)) {
      const err = new Error(`whisper-server binary not found at: ${serverBinary}`);
      console.error(err);
      return reject(err);
    }

    const args = [
      '-m', modelPath,
      '--port', port.toString(),
      '--host', '127.0.0.1',
      '-fa'
    ];

    console.log(`Spawning whisper-server: "${serverBinary}" ${args.join(' ')}`);
    whisperServerProcess = spawn(serverBinary, args, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    activeWhisperServerModel = modelPath;
    activeWhisperServerPort = port;

    let started = false;
    let errorOutput = '';

    const timeout = setTimeout(() => {
      if (!started) {
        console.error('whisper-server start timed out (15s)');
        reject(new Error('whisper-server start timed out. Stderr: ' + errorOutput));
      }
    }, 15000);

    whisperServerProcess.stdout.on('data', (data) => {
      const line = data.toString();
      console.log(`[whisper-server stdout] ${line}`);
      if (line.includes('HTTP server running') || line.includes('model loaded') || line.includes('whisper_init_from_file_with_params') || line.includes('create_backend')) {
        setTimeout(() => {
          if (!started) {
            started = true;
            clearTimeout(timeout);
            resolve(true);
          }
        }, 500);
      }
    });

    whisperServerProcess.stderr.on('data', (data) => {
      const line = data.toString();
      console.warn(`[whisper-server stderr] ${line}`);
      errorOutput += line;
      if (line.includes('HTTP server running') || line.includes('model loaded') || line.includes('whisper_init_from_file_with_params') || line.includes('create_backend')) {
        setTimeout(() => {
          if (!started) {
            started = true;
            clearTimeout(timeout);
            resolve(true);
          }
        }, 500);
      }
    });

    whisperServerProcess.on('close', (code) => {
      console.log(`whisper-server process closed with code ${code}`);
      whisperServerProcess = null;
      activeWhisperServerModel = '';
      if (!started) {
        clearTimeout(timeout);
        reject(new Error(`whisper-server exited immediately with code ${code}. Stderr: ${errorOutput}`));
      }
    });

    whisperServerProcess.on('error', (err) => {
      console.error('Failed to start whisper-server process:', err);
      whisperServerProcess = null;
      activeWhisperServerModel = '';
      if (!started) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

function stopWhisperServer() {
  if (whisperServerProcess) {
    console.log('Stopping whisper-server background process...');
    try {
      whisperServerProcess.kill();
    } catch (e) {
      console.error('Failed to kill whisper-server process:', e);
    }
    whisperServerProcess = null;
    activeWhisperServerModel = '';
  }
}

const isDev = !app.isPackaged;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false, // Frameless window for premium design
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Prevent Caret Browsing (F7 popup) in mainWindow
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F7') {
      event.preventDefault();
    }
  });

  const startUrl = isDev 
    ? 'http://localhost:5173' 
    : `file://${path.join(__dirname, 'dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle minimize to tray
  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
}

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const overlayWidth = 480;
  const overlayHeight = 80;
  const x = Math.round((width - overlayWidth) / 2);
  const y = Math.round(height - 110); // positioned bottom center
  
  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false, // Prevents window from stealing focus
    resizable: false,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Prevent Caret Browsing (F7 popup) in overlayWindow
  overlayWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F7') {
      event.preventDefault();
    }
  });

  const overlayUrl = isDev
    ? 'http://localhost:5173/#/overlay'
    : `file://${path.join(__dirname, 'dist/index.html')}#/overlay`;

  overlayWindow.loadURL(overlayUrl);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWklEQVQ4T2N8z8AARAwDGMCoBkgYgMNEwQA8BmA1gE0DhgHkGUAxgJgGDCpguIQC/4kDAHYuEAX9109iAAAAAElFTkSuQmCC');
  
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'VoiceInk Dashboard', click: () => showMainWindow() },
    { label: 'Start Recording (Ctrl+Alt+R)', click: () => toggleRecording() },
    { type: 'separator' },
    { label: 'Settings', click: () => { showMainWindow(); mainWindow.webContents.send('navigate-to', 'settings'); } },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setToolTip('VoiceInk - Voice to Text');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    showMainWindow();
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function toggleRecording() {
  isRecording = !isRecording;
  if (mainWindow) {
    mainWindow.webContents.send('recording-toggled', isRecording);
  }
  if (overlayWindow) {
    if (isRecording) {
      overlayWindow.showInactive(); // Show without taking focus
      overlayWindow.webContents.send('start-recording');
    } else {
      overlayWindow.webContents.send('stop-recording');
      setTimeout(() => {
        if (!isRecording && overlayWindow) overlayWindow.hide();
      }, 1000);
    }
  }
}

function startGlobalKeyListener() {
  const args = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command',
    `
    $signature = '[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);';
    $type = Add-Type -MemberDefinition $signature -Name "Win32Keyboard" -Namespace "Win32" -PassThru;
    $isHolding = $false;
    while ($true) {
        $ctrl = [Win32.Win32Keyboard]::GetAsyncKeyState(17);
        $winL = [Win32.Win32Keyboard]::GetAsyncKeyState(91);
        $winR = [Win32.Win32Keyboard]::GetAsyncKeyState(92);
        $pressed = ($ctrl -lt 0) -and (($winL -lt 0) -or ($winR -lt 0));
        if ($pressed -and -not $isHolding) {
            $isHolding = $true;
            Write-Output 'KEYDOWN';
        } elseif (-not $pressed -and $isHolding) {
            $isHolding = $false;
            Write-Output 'KEYUP';
        }
        Start-Sleep -Milliseconds 5;
    }
    `
  ];

  try {
    keyListenerProcess = spawn('powershell.exe', args);
    
    keyListenerProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output.includes('KEYDOWN')) {
        if (!isRecording) {
          toggleRecording();
        }
      } else if (output.includes('KEYUP')) {
        if (isRecording) {
          toggleRecording();
        }
      }
    });

    keyListenerProcess.stderr.on('data', (data) => {
      console.error('PowerShell listener error:', data.toString());
    });
  } catch (err) {
    console.error('Failed to start global key hook process:', err);
  }
}

function checkForUpdates() {
  const options = {
    hostname: 'api.github.com',
    path: '/repos/madebyhidden/VoInked/releases/latest',
    method: 'GET',
    headers: {
      'User-Agent': 'VoiceInk-App'
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        if (res.statusCode !== 200) {
          console.warn(`Update check failed with status code ${res.statusCode}`);
          return;
        }
        const release = JSON.parse(data);
        if (!release.tag_name) return;
        const latestVersion = release.tag_name.replace(/^v/, ''); // remove leading 'v'
        const currentVersion = app.getVersion();
        
        console.log(`Update check: current version ${currentVersion}, latest version ${latestVersion}`);
        
        if (latestVersion !== currentVersion) {
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update-available', {
                version: release.tag_name,
                notes: release.body,
                url: release.html_url
              });
            }
          }, 5000);
        }
      } catch (err) {
        console.error('Failed to parse update release data:', err);
      }
    });
  });

  req.on('error', (err) => {
    console.error('Update check request error:', err);
  });

  req.end();
}

// App lifecycle
app.whenReady().then(() => {
  createMainWindow();
  createOverlayWindow();
  createTray();
  startGlobalKeyListener(); // Start background Win+Ctrl hook listener
  checkForUpdates();

  // Register backup keyboard shortcut Ctrl+Alt+R
  globalShortcut.register('CommandOrControl+Alt+R', () => {
    toggleRecording();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (keyListenerProcess) {
    keyListenerProcess.kill();
  }
  stopWhisperServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC listeners
ipcMain.on('minimize-app', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-app', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('close-app', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.on('write-clipboard', (event, text) => {
  clipboard.writeText(text);
});

ipcMain.on('get-active-window-info', (event) => {
  event.returnValue = { title: 'Active Document', owner: 'Text Editor' };
});

ipcMain.on('update-recording-state', (event, state) => {
  isRecording = state;
  if (overlayWindow) {
    if (isRecording) {
      overlayWindow.show();
    } else {
      setTimeout(() => {
        if (!isRecording && overlayWindow) overlayWindow.hide();
      }, 800);
    }
  }
});

ipcMain.on('send-transcription-to-overlay', (event, text) => {
  if (overlayWindow) {
    overlayWindow.webContents.send('transcription-preview', text);
  }
});

ipcMain.on('send-waveform-to-overlay', (event, waveformData) => {
  if (overlayWindow) {
    overlayWindow.webContents.send('waveform-update', waveformData);
  }
});

ipcMain.on('paste-transcription', (event, pasteMethod) => {
  let keyPattern = '^v'; // default: Ctrl+V
  if (pasteMethod === 'ctrl_shift_v') {
    keyPattern = '^+v'; // Ctrl+Shift+V
  } else if (pasteMethod === 'shift_insert') {
    keyPattern = '+{INSERT}'; // Shift+Insert
  }

  setTimeout(() => {
    const pasteCommand = `powershell -Command "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('${keyPattern}')"`;
    exec(pasteCommand);
  }, 120);
});

ipcMain.handle('save-temp-wav', async (event, arrayBuffer) => {
  try {
    const tempPath = path.join(app.getPath('temp'), 'voiceink_record.wav');
    await fs.promises.writeFile(tempPath, Buffer.from(arrayBuffer));
    return tempPath;
  } catch (err) {
    console.error('Failed to save temporary WAV file:', err);
    throw err;
  }
});

ipcMain.handle('transcribe-whisper-cpp', async (event, { binaryPath, modelPath, wavPath, language }) => {
  if (whisperServerProcess) {
    try {
      console.log(`Sending transcription request to background server at http://127.0.0.1:${activeWhisperServerPort}/inference`);
      
      const fileBuffer = await fs.promises.readFile(wavPath);
      const fileBlob = new Blob([fileBuffer], { type: 'audio/wav' });

      const formData = new FormData();
      formData.append('file', fileBlob, 'audio.wav');
      if (language && language !== 'auto') {
        formData.append('language', language.split('-')[0]); // e.g. 'ru'
      }
      formData.append('temperature', '0.0');
      formData.append('response_format', 'json');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(`http://127.0.0.1:${activeWhisperServerPort}/inference`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok) {
        const result = await response.json();
        console.log('Background server response successfully received!');
        return (result.text || '').trim();
      } else {
        console.warn(`Background server returned error ${response.status}. Falling back to CLI...`);
      }
    } catch (err) {
      console.warn('Background server transcription request failed. Falling back to CLI...', err.message);
    }
  }

  // Fallback to CLI if server is not running or request failed
  return new Promise((resolve, reject) => {
    const args = [
      '-m', modelPath,
      '-f', wavPath,
      '-nt' // No timestamps
    ];
    if (language && language !== 'auto') {
      args.push('-l', language.split('-')[0]); // e.g. 'ru-RU' -> 'ru'
    }
    
    console.log(`Spawning whisper.cpp: "${binaryPath}" ${args.join(' ')}`);
    const child = spawn(binaryPath, args);
    let stdoutText = '';
    let stderrText = '';

    child.stdout.on('data', (data) => {
      stdoutText += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderrText += data.toString();
    });

    child.on('close', (code) => {
      console.log(`whisper.cpp process exited with code ${code}`);
      if (code === 0) {
        resolve(stdoutText.trim());
      } else {
        reject(new Error(`whisper.cpp failed with code ${code}. Stderr: ${stderrText}`));
      }
    });

    child.on('error', (err) => {
      console.error('Failed to start whisper.cpp process:', err);
      reject(err);
    });
  });
});

ipcMain.handle('start-whisper-server', async (event, { binaryPath, modelPath, port }) => {
  try {
    await startWhisperServer(binaryPath, modelPath, port || 8080);
    return { success: true };
  } catch (err) {
    console.error('Failed to start whisper server:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('stop-whisper-server', async () => {
  stopWhisperServer();
  return { success: true };
});

ipcMain.handle('transcribe-custom-cmd', async (event, { commandTemplate, wavPath, modelPath, language }) => {
  return new Promise((resolve, reject) => {
    try {
      const langCode = language ? language.split('-')[0] : 'auto';
      let cmd = commandTemplate
        .replace('{input_file}', `"${wavPath}"`)
        .replace('{model_path}', `"${modelPath}"`)
        .replace('{lang}', langCode);

      console.log(`Executing native command: ${cmd}`);
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.error(`Command execution failed: ${error.message}`);
          reject(new Error(`Command failed: ${stderr || error.message}`));
        } else {
          resolve(stdout.trim());
        }
      });
    } catch (err) {
      reject(err);
    }
  });
});

ipcMain.handle('select-file', async (event, { title, filters }) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: title || 'Select File',
      properties: ['openFile'],
      filters: filters || []
    });
    return result.canceled ? null : result.filePaths[0];
  } catch (err) {
    console.error('Failed to open select file dialog:', err);
    throw err;
  }
});

ipcMain.handle('select-folder', async (event, { title }) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: title || 'Select Directory',
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  } catch (err) {
    console.error('Failed to open select folder dialog:', err);
    throw err;
  }
});

ipcMain.on('open-external', (event, url) => {
  try {
    shell.openExternal(url);
  } catch (err) {
    console.error('Failed to open external link:', err);
  }
});

ipcMain.handle('check-file-exists', async (event, filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (e) {
    return false;
  }
});

ipcMain.handle('get-user-data-path', async (event) => {
  return app.getPath('userData');
});

ipcMain.handle('setup-native-whisper', async (event, { modelName, hfMirror, backend }) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const sendProgress = (status, progress, message) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send('native-setup-progress', { status, progress, message });
    }
  };

  try {
    const userDataPath = app.getPath('userData');
    const binDir = path.join(userDataPath, 'bin');
    const modelsDir = path.join(userDataPath, 'models');

    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
    if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

    let binaryPath = '';

    if (process.platform === 'win32') {
      const isNvidia = await detectNvidiaGpu();
      const backendFolder = backend || (isNvidia ? 'cuda12' : 'blas');
      const specificBinDir = path.join(binDir, backendFolder);
      if (!fs.existsSync(specificBinDir)) fs.mkdirSync(specificBinDir, { recursive: true });

      const existingBinary = findExecutable(specificBinDir, 'whisper-cli.exe') || 
                             findExecutable(specificBinDir, 'whisper-cli') || 
                             findExecutable(specificBinDir, 'main.exe') || 
                             findExecutable(specificBinDir, 'main');
      if (existingBinary && fs.existsSync(existingBinary)) {
        binaryPath = existingBinary;
        sendProgress('downloading-bin', 100, `whisper.cpp ${backendFolder} engine is already installed.`);
      } else {
        let zipUrl = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.6/whisper-blas-bin-x64.zip';
        if (backendFolder === 'cuda12') {
          zipUrl = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.6/whisper-cublas-12.4.0-bin-x64.zip';
        } else if (backendFolder === 'cuda11') {
          zipUrl = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.6/whisper-cublas-11.8.0-bin-x64.zip';
        } else if (backendFolder === 'cpu') {
          zipUrl = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.6/whisper-bin-x64.zip';
        }
        
        const zipPath = path.join(specificBinDir, 'whisper.zip');
        
        // Step 1: Download binary zip
        sendProgress('downloading-bin', 0, `Downloading whisper.cpp native engine (${backendFolder})...`);
        await downloadFileWithRedirects(zipUrl, zipPath, (downloaded, total) => {
          const pct = Math.round((downloaded / total) * 100);
          sendProgress('downloading-bin', pct, `Downloading whisper.cpp native engine (${backendFolder})... (${pct}%)`);
        });

        // Step 2: Extract binary zip
        sendProgress('extracting-bin', 0, `Extracting native engine files (${backendFolder})...`);
        await new Promise((resolve, reject) => {
          const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${specificBinDir}' -Force"`;
          exec(cmd, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Clean up zip
        try {
          fs.unlinkSync(zipPath);
        } catch (e) {}

        // Find extracted binary path
        binaryPath = findExecutable(specificBinDir, 'whisper-cli.exe') || 
                     findExecutable(specificBinDir, 'whisper-cli') || 
                     findExecutable(specificBinDir, 'main.exe') || 
                     findExecutable(specificBinDir, 'main');

        if (!binaryPath) {
          throw new Error(`Failed to find whisper-cli.exe or main.exe in extracted archive for ${backendFolder}.`);
        }
      }
    } else {
      // macOS or Linux: Skip binary download, try to auto-detect installed paths
      sendProgress('downloading-bin', 100, 'Checking if whisper.cpp is installed locally...');
      const commonPaths = [
        '/opt/homebrew/bin/whisper-cpp',
        '/usr/local/bin/whisper-cpp',
        '/usr/bin/whisper-cpp',
        '/opt/homebrew/bin/whisper-cli',
        '/usr/local/bin/whisper-cli',
        '/usr/bin/whisper-cli',
        '/usr/bin/main'
      ];
      for (const p of commonPaths) {
        if (fs.existsSync(p)) {
          binaryPath = p;
          break;
        }
      }

      if (!binaryPath) {
        try {
          const detected = await new Promise((resolve) => {
            exec('which whisper-cpp', (err, stdout) => {
              if (!err && stdout.trim()) resolve(stdout.trim());
              else {
                exec('which whisper-cli', (err2, stdout2) => {
                  if (!err2 && stdout2.trim()) resolve(stdout2.trim());
                  else resolve('');
                });
              }
            });
          });
          if (detected) binaryPath = detected;
        } catch (e) {}
      }
    }

    // Step 3: Resolve model name and download GGML model
    let modelFile = 'ggml-base.bin';
    const lowerName = modelName.toLowerCase();
    if (lowerName.includes('large-v3-turbo-q5_0') || lowerName.includes('large-v3-turbo-q5') || lowerName.includes('q5_0')) {
      modelFile = 'ggml-large-v3-turbo-q5_0.bin';
    } else if (lowerName.includes('large-v3-turbo')) {
      modelFile = 'ggml-large-v3-turbo.bin';
    } else if (lowerName.includes('large-v3')) {
      modelFile = 'ggml-large-v3.bin';
    } else if (lowerName.includes('large')) {
      modelFile = 'ggml-large-v3-turbo-q5_0.bin'; // Default to quantized large for resource efficiency
    } else if (lowerName.includes('medium')) {
      modelFile = 'ggml-medium.bin';
    } else if (lowerName.includes('small')) {
      modelFile = 'ggml-small.bin';
    } else if (lowerName.includes('base')) {
      modelFile = 'ggml-base.bin';
    } else if (lowerName.includes('tiny')) {
      modelFile = 'ggml-tiny.bin';
    }

    const mirror = hfMirror || 'https://hf-mirror.com';
    const modelUrl = `${mirror}/ggerganov/whisper.cpp/resolve/main/${modelFile}`;
    const destModelPath = path.join(modelsDir, modelFile);

    sendProgress('downloading-model', 0, `Downloading GGML model (${modelFile})...`);
    await downloadFileWithRedirects(modelUrl, destModelPath, (downloaded, total) => {
      const pct = Math.round((downloaded / total) * 100);
      sendProgress('downloading-model', pct, `Downloading GGML model (${modelFile})... (${pct}%)`);
    });

    sendProgress('completed', 100, 'Native Whisper setup completed successfully!');
    return {
      binaryPath,
      modelPath: destModelPath
    };

  } catch (err) {
    console.error('Error during native whisper setup:', err);
    sendProgress('error', 0, `Setup failed: ${err.message}`);
    throw err;
    }
});

