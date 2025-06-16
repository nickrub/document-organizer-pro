// src/ocrEngine.js
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs-extra');

class OCREngine {
  constructor() {
    this.worker = null;
    this.isInitialized = false;
    this.languages = ['ita', 'eng'];
    console.log('🔍 OCR Engine inizializzato');
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      console.log('🚀 Inizializzazione OCR Worker...');
      this.worker = await Tesseract.createWorker(this.languages, 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      await this.worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ€$.,;:!?()[]{}/@#%&*+-=',
        tessedit_pageseg_mode: Tesseract.PSM.AUTO_OSD,
      });
      
      this.isInitialized = true;
      console.log('✅ OCR Worker pronto');
    } catch (error) {
      console.error('❌ Errore inizializzazione OCR:', error);
      throw error;
    }
  }

  async preprocessImage(imagePath) {
    try {
      console.log('🔧 Preprocessing immagine...');
      const optimizedPath = imagePath.replace(/\.(jpg|jpeg|png|gif)$/i, '_ocr_temp.png');
      
      await sharp(imagePath)
        .greyscale()
        .normalize()
        .sharpen()
        .threshold(128)
        .png({ quality: 100 })
        .toFile(optimizedPath);
      
      console.log('✅ Preprocessing completato');
      return optimizedPath;
    } catch (error) {
      console.error('❌ Errore preprocessing:', error);
      return imagePath;
    }
  }

  async extractTextFromImage(imagePath) {
    try {
      await this.initialize();
      console.log(`🔍 Estrazione OCR da: ${path.basename(imagePath)}`);
      
      const optimizedPath = await this.preprocessImage(imagePath);
      const { data } = await this.worker.recognize(optimizedPath);
      
      if (optimizedPath !== imagePath) {
        await fs.remove(optimizedPath).catch(() => {});
      }
      
      const result = {
        text: data.text,
        confidence: Math.round(data.confidence),
        words: data.words.filter(word => word.confidence > 30),
        extractedData: this.extractStructuredData(data.text)
      };
      
      console.log(`✅ OCR completato: ${result.text.length} caratteri, confidence: ${result.confidence}%`);
      return result;
      
    } catch (error) {
      console.error('❌ Errore OCR:', error);
      throw new Error(`Errore OCR: ${error.message}`);
    }
  }

  extractStructuredData(text) {
    return {
      amounts: this.extractAmounts(text),
      dates: this.extractDates(text),
      codes: this.extractCodes(text),
      companies: this.extractCompanies(text)
    };
  }

  extractAmounts(text) {
    const patterns = [
      /€\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/g,
      /(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*€/g
    ];
    
    const amounts = [];
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const amount = parseFloat(match[1].replace(',', '.'));
        if (!isNaN(amount)) amounts.push(amount);
      }
    });
    
    return [...new Set(amounts)];
  }

  extractDates(text) {
    const pattern = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g;
    const dates = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
      dates.push(match[0]);
    }
    return [...new Set(dates)];
  }

  extractCodes(text) {
    return {
      codiciFiscali: [...new Set((text.match(/[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/g) || []))],
      ibans: [...new Set((text.match(/IT\d{2}[A-Z]\d{3}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{3}/g) || []))]
    };
  }

  extractCompanies(text) {
    const companies = ['enel', 'eni', 'acea', 'tim', 'vodafone', 'wind', 'tre'];
    return companies.filter(company => 
      text.toLowerCase().includes(company)
    );
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      console.log('🔍 OCR Worker terminato');
    }
  }
}

module.exports = OCREngine;
