const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');
const DocumentProcessor = require('./src/documentProcessor');

class DocumentOrganizerApp {
  constructor() {
    this.mainWindow = null;
    this.documentProcessor = new DocumentProcessor();
    this.watchers = new Map();
    this.settings = this.loadSettings();
    
    console.log('🚀 Document Organizer Pro inizializzato');
  }

  async createWindow() {
    // ✅ SETUP IPC HANDLERS PRIMA DELLA FINESTRA
    this.setupIpcHandlers();
    
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1200,
      minHeight: 700,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      },
      titleBarStyle: 'hiddenInset',
      icon: path.join(__dirname, 'assets', 'icon.png'),
      show: false
    });

    await this.mainWindow.loadFile('src/index.html');
    
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      console.log('✅ Finestra principale mostrata');
    });

    if (process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  loadSettings() {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    const inputFolder = path.join(require('os').homedir(), 'DocumentsToOrganize');
    const outputFolder = path.join(require('os').homedir(), 'Documents', 'Organized');
    
    try {
      let settings = fs.readJsonSync(settingsPath);
      
      let needsUpdate = false;
      
      if (!settings.inputFolder) {
        settings.inputFolder = inputFolder;
        needsUpdate = true;
      }
      
      if (!settings.outputFolder) {
        settings.outputFolder = outputFolder;
        needsUpdate = true;
      }
      
      if (!settings.watchedFolders) {
        settings.watchedFolders = [inputFolder];
        needsUpdate = true;
      }
      
      if (!settings.categories) {
        settings.categories = this.getDefaultCategories();
        needsUpdate = true;
      }
      
      if (settings.autoOrganize === undefined) {
        settings.autoOrganize = true;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        console.log('🔄 Aggiornamento impostazioni...');
        this.saveSettings(settings);
      }
      
      return settings;
      
    } catch (error) {
      console.log('📝 Creazione nuove impostazioni...');
      
      const defaultSettings = {
        inputFolder: inputFolder,
        outputFolder: outputFolder,
        watchedFolders: [inputFolder],
        autoOrganize: true,
        categories: this.getDefaultCategories(),
        theme: 'light',
        language: 'it'
      };
      
      this.saveSettings(defaultSettings);
      return defaultSettings;
    }
  }

  saveSettings(settings) {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    fs.writeJsonSync(settingsPath, settings, { spaces: 2 });
    this.settings = settings;
    console.log('💾 Impostazioni salvate');
  }

  getDefaultCategories() {
    return {
      'IMU': { 
        keywords: ['imu', 'imposta municipale', 'comune', 'ravvedimento', 'f24'], 
        folder: 'Tasse/IMU',
        color: '#FF6B6B'
      },
      'TARI': { 
        keywords: ['tari', 'rifiuti', 'tarsu', 'tariffa rifiuti'], 
        folder: 'Tasse/TARI',
        color: '#4ECDC4'
      },
      'Bollette_Energia': { 
        keywords: ['energia elettrica', 'enel', 'eni', 'edison', 'kw', 'kwh', 'bolletta luce'], 
        folder: 'Bollette/Energia_Elettrica',
        color: '#45B7D1'
      },
      'Bollette_Gas': { 
        keywords: ['gas', 'metano', 'smc', 'metro cubo', 'bolletta gas'], 
        folder: 'Bollette/Gas',
        color: '#F7931E'
      },
      'Bollette_Acqua': { 
        keywords: ['acqua', 'acea', 'acquedotto', 'bolletta acqua'], 
        folder: 'Bollette/Acqua',
        color: '#96CEB4'
      },
      'Contratti': { 
        keywords: ['contratto', 'accordo', 'clausola', 'firma', 'locazione'], 
        folder: 'Contratti',
        color: '#FFEAA7'
      },
      'Banca': { 
        keywords: ['banca', 'conto corrente', 'iban', 'bonifico', 'estratto conto'], 
        folder: 'Documenti_Bancari',
        color: '#DDA0DD'
      },
      'Assicurazioni': {
        keywords: ['assicurazione', 'polizza', 'rc auto', 'kasko'],
        folder: 'Assicurazioni',
        color: '#98D8C8'
      }
    };
  }

  async ensureDirectories() {
    try {
      await fs.ensureDir(this.settings.inputFolder);
      console.log(`📁 Cartella input: ${this.settings.inputFolder}`);
      
      await fs.ensureDir(this.settings.outputFolder);
      console.log(`📁 Cartella output: ${this.settings.outputFolder}`);
      
      const readmePath = path.join(this.settings.inputFolder, 'README.txt');
      if (!fs.existsSync(readmePath)) {
        const readmeContent = `📁 DOCUMENT ORGANIZER PRO - CARTELLA INPUT

🎯 COME FUNZIONA:
- Trascina o copia i documenti in questa cartella
- Verranno automaticamente analizzati e organizzati
- I file verranno spostati nella cartella "Organized"

📋 TIPI DI FILE SUPPORTATI:
- PDF (bollette, contratti, documenti ufficiali)
- Immagini (JPG, PNG) con testo
- File di testo (.txt)

🗂️ CATEGORIE AUTOMATICHE:
- IMU/TARI → Tasse/
- Bollette Energia/Gas/Acqua → Bollette/
- Contratti → Contratti/
- Documenti Bancari → Documenti_Bancari/
- Assicurazioni → Assicurazioni/

⚙️ CONFIGURAZIONE:
Apri Document Organizer Pro per modificare le impostazioni.

📅 Creato il: ${new Date().toLocaleString('it-IT')}
versione: 1.0.0
`;
        fs.writeFileSync(readmePath, readmeContent);
        console.log('📄 README creato nella cartella input');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Errore creazione cartelle:', error);
      return false;
    }
  }

  setupFileWatchers() {
    console.log('🔍 Configurazione monitoraggio file...');
    
    this.watchers.forEach(watcher => watcher.close());
    this.watchers.clear();

    if (!this.settings.inputFolder || !this.settings.autoOrganize) {
      console.log('⏸️ Monitoraggio disabilitato');
      return;
    }

    const watcher = chokidar.watch(this.settings.inputFolder, {
      ignored: [
        /(^|[\/\\])\../, 
        /README\.txt$/,  
        /\.DS_Store$/,   
        /Thumbs\.db$/    
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    watcher.on('add', async (filePath) => {
      if (this.settings.autoOrganize) {
        console.log(`📄 Nuovo file rilevato: ${path.basename(filePath)}`);
        await this.processNewFile(filePath);
      }
    });

    watcher.on('error', error => {
      console.error('❌ Errore watcher:', error);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('watcher-error', error.message);
      }
    });

    this.watchers.set(this.settings.inputFolder, watcher);
    console.log('✅ Monitoraggio file attivo');
  }

  async processNewFile(filePath) {
    try {
      const analysis = await this.documentProcessor.analyzeDocument(filePath);
      const targetPath = await this.organizeFile(filePath, analysis);
      
      if (this.mainWindow) {
        this.mainWindow.webContents.send('file-auto-organized', {
          originalPath: filePath,
          targetPath: targetPath,
          analysis: analysis
        });
      }
      
      console.log(`✅ Auto-organizzato: ${path.basename(filePath)} → ${analysis.category}/${analysis.year}/`);
      
    } catch (error) {
      console.error('❌ Errore elaborazione automatica:', error);
      
      if (this.mainWindow) {
        this.mainWindow.webContents.send('file-auto-error', {
          filePath: filePath,
          error: error.message
        });
      }
    }
  }

  async organizeFile(filePath, analysis) {
    const fileName = path.basename(filePath);
    const year = analysis.year || new Date().getFullYear().toString();
    const category = this.settings.categories[analysis.category];
    
    let targetDir;
    if (category && category.folder) {
      targetDir = path.join(this.settings.outputFolder, category.folder, year);
    } else {
      targetDir = path.join(this.settings.outputFolder, 'Altri_Documenti', year);
    }

    await fs.ensureDir(targetDir);
    
    let targetPath = path.join(targetDir, fileName);
    let counter = 1;
    while (fs.existsSync(targetPath)) {
      const ext = path.extname(fileName);
      const name = path.basename(fileName, ext);
      targetPath = path.join(targetDir, `${name}_${counter}${ext}`);
      counter++;
    }

    await fs.move(filePath, targetPath);
    console.log(`📁 File spostato: ${fileName} → ${path.relative(this.settings.outputFolder, targetPath)}`);
    
    return targetPath;
  }

  setupIpcHandlers() {
    console.log('🔧 Configurazione IPC handlers...');

    ipcMain.handle('analyze-files', async (event, filePaths) => {
      const results = [];
      for (const filePath of filePaths) {
        try {
          const analysis = await this.documentProcessor.analyzeDocument(filePath);
          results.push({ filePath, analysis, success: true });
        } catch (error) {
          results.push({ filePath, error: error.message, success: false });
        }
      }
      return results;
    });

    ipcMain.handle('organize-file', async (event, filePath, analysis) => {
      try {
        const targetPath = await this.organizeFile(filePath, analysis);
        return { success: true, targetPath: targetPath };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('get-settings', () => {
      console.log('📤 Inviando impostazioni al frontend');
      return this.settings;
    });

    ipcMain.handle('toggle-auto-organize', (event, enabled) => {
      this.settings.autoOrganize = enabled;
      this.saveSettings(this.settings);
      
      if (enabled) {
        this.setupFileWatchers();
      } else {
        this.watchers.forEach(watcher => watcher.close());
        this.watchers.clear();
      }
      
      return this.settings.autoOrganize;
    });

    ipcMain.handle('open-input-folder', async () => {
      await this.ensureDirectories();
      shell.openPath(this.settings.inputFolder);
      return this.settings.inputFolder;
    });

    ipcMain.handle('open-output-folder', async () => {
      await this.ensureDirectories();
      shell.openPath(this.settings.outputFolder);
      return this.settings.outputFolder;
    });

    ipcMain.handle('get-folder-status', async () => {
      const inputExists = fs.existsSync(this.settings.inputFolder);
      const outputExists = fs.existsSync(this.settings.outputFolder);
      
      let inputFileCount = 0;
      if (inputExists) {
        try {
          const files = await fs.readdir(this.settings.inputFolder);
          inputFileCount = files.filter(f => 
            !f.startsWith('.') && 
            f !== 'README.txt' && 
            !f.endsWith('.DS_Store')
          ).length;
        } catch (error) {
          console.error('Errore conteggio file:', error);
        }
      }

      return {
        inputFolder: this.settings.inputFolder,
        outputFolder: this.settings.outputFolder,
        inputExists,
        outputExists,
        inputFileCount
      };
    });

    console.log('✅ IPC handlers configurati');
  }

  async initialize() {
    await app.whenReady();
    
    // ✅ ORDINE CORRETTO: Prima le cartelle, poi la finestra, poi il monitoraggio
    await this.ensureDirectories();
    await this.createWindow();
    this.setupFileWatchers();
    
    console.log('🚀 Document Organizer Pro avviato con successo!');
    console.log(`📥 Cartella input: ${this.settings.inputFolder}`);
    console.log(`📤 Cartella output: ${this.settings.outputFolder}`);
    console.log(`⚙️ Auto-organizzazione: ${this.settings.autoOrganize ? 'Attiva' : 'Disattiva'}`);
  }
}

const documentOrganizer = new DocumentOrganizerApp();
documentOrganizer.initialize();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await documentOrganizer.createWindow();
  }
});

app.on('before-quit', async () => {
  console.log('🧹 Pulizia risorse...');
  
  documentOrganizer.watchers.forEach(watcher => watcher.close());
  
  if (documentOrganizer.documentProcessor) {
    await documentOrganizer.documentProcessor.cleanup();
  }
  
  console.log('✅ Cleanup completato');
});

process.on('uncaughtException', (error) => {
  console.error('❌ Errore non catturato:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rifiutata non gestita:', reason);
});
