const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const mime = require('mime-types');
const OCREngine = require('./ocrEngine');
const TemplateMatcher = require('./templateMatcher');

class DocumentProcessor {
  constructor() {
    this.ocrEngine = new OCREngine();
    this.templateMatcher = new TemplateMatcher();
    this.categories = this.getDefaultCategories();
    
    console.log('📋 Document Processor Enhanced inizializzato');
  }

  async analyzeDocument(filePath) {
    try {
      console.log(`🔍 Analisi Enhanced: ${path.basename(filePath)}`);
      
      const mimeType = mime.lookup(filePath);
      let extractedText = '';
      let ocrData = null;
      let processingMethod = 'unknown';
      let confidence = 50;

      // FASE 1: Estrazione testo base
      if (mimeType === 'application/pdf') {
        extractedText = await this.extractTextFromPDF(filePath);
        processingMethod = 'PDF parsing';
        confidence = 70;
      } else if (mimeType && mimeType.startsWith('image/')) {
        // NUOVA FUNZIONALITÀ: OCR per immagini
        try {
          ocrData = await this.ocrEngine.extractTextFromImage(filePath);
          extractedText = ocrData.text;
          processingMethod = 'OCR avanzato';
          confidence = Math.max(60, ocrData.confidence);
          console.log(`📸 OCR completato con confidence: ${ocrData.confidence}%`);
        } catch (ocrError) {
          console.log('⚠️ OCR fallito, uso analisi filename');
          extractedText = await this.analyzeImageByFilename(filePath);
          processingMethod = 'Analisi filename (OCR fallito)';
          confidence = 40;
        }
      } else if (mimeType && mimeType.startsWith('text/')) {
        extractedText = await this.extractTextFromFile(filePath);
        processingMethod = 'File di testo';
        confidence = 80;
      } else {
        extractedText = await this.analyzeImageByFilename(filePath);
        processingMethod = 'Analisi filename';
        confidence = 30;
      }

      // FASE 2: Classificazione base
      const baseClassification = this.classifyDocument(extractedText, path.basename(filePath));
      
      // FASE 3: Template matching (NUOVA FUNZIONALITÀ)
      const templateMatch = this.templateMatcher.matchTemplate(
        extractedText, 
        path.basename(filePath),
        ocrData?.extractedData
      );

      // FASE 4: Combinazione risultati
      let finalClassification = baseClassification;
      if (templateMatch) {
        finalClassification = this.templateMatcher.enhanceAnalysis(baseClassification, templateMatch);
        console.log(`🎯 Template match: ${templateMatch.template} (${templateMatch.company})`);
      }

      // FASE 5: Estrazione metadata avanzata
      const metadata = this.extractMetadata(extractedText);
      if (ocrData?.extractedData) {
        Object.assign(metadata, ocrData.extractedData);
      }

      const year = this.extractYear(extractedText, filePath);
      
      const result = {
        filename: path.basename(filePath),
        fullPath: filePath,
        extractedText: this.sanitizeText(extractedText).substring(0, 500) + (extractedText.length > 500 ? '...' : ''),
        category: finalClassification.category,
        confidence: finalClassification.confidence,
        keywords: finalClassification.keywords,
        company: finalClassification.company || 'Sconosciuta',
        templateMatched: finalClassification.templateMatched || null,
        year: year,
        metadata: metadata,
        fileSize: (await fs.stat(filePath)).size,
        mimeType: mimeType,
        processingMethod: processingMethod,
        ocrConfidence: ocrData?.confidence || null,
        enhancedBy: finalClassification.enhancedBy || 'base_classification',
        analyzedAt: new Date().toISOString()
      };

      console.log(`✅ Analisi Enhanced completata: ${result.filename} → ${result.category} (${result.confidence}% confidence) via ${processingMethod}`);
      return result;

    } catch (error) {
      console.error(`❌ Errore analisi enhanced ${path.basename(filePath)}:`, error.message);
      throw new Error(`Errore analisi documento: ${error.message}`);
    }
  }

  async extractTextFromPDF(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer, {
        max: 200,
        version: 'v1.10.100'
      });
      
      const text = data.text || '';
      console.log(`📄 PDF: ${text.length} caratteri estratti`);
      return text;
    } catch (error) {
      console.error(`❌ Errore lettura PDF:`, error.message);
      return this.analyzeImageByFilename(filePath);
    }
  }

  async analyzeImageByFilename(filePath) {
    const fileName = path.basename(filePath, path.extname(filePath));
    const fullPath = filePath;
    
    console.log(`📸 Analisi immagine per nome file: ${fileName}`);
    
    let analyzedText = fileName
      .toLowerCase()
      .replace(/[-_]/g, ' ')
      .replace(/(\d{4})/g, ' $1 ')
      .replace(/(\d{2})(\d{2})(\d{4})/g, '$1/$2/$3 ')
      .replace(/(\d{1,2})(\d{1,2})(\d{4})/g, '$1/$2/$3 ')
      .replace(/([a-z])(\d)/g, '$1 $2')
      .replace(/(\d)([a-z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();

    const parentDir = path.basename(path.dirname(fullPath)).toLowerCase();
    if (parentDir && parentDir !== '.' && parentDir !== 'documentstoorganize') {
      analyzedText += ' ' + parentDir.replace(/[-_]/g, ' ');
    }

    const expansions = this.getKeywordExpansions();
    Object.keys(expansions).forEach(keyword => {
      if (analyzedText.includes(keyword)) {
        analyzedText += ' ' + expansions[keyword];
      }
    });

    console.log(`📄 Risultato analisi filename: "${analyzedText.substring(0, 100)}..."`);
    return analyzedText;
  }

  getKeywordExpansions() {
    return {
      'bolletta': 'bolletta fattura documento pagamento',
      'fattura': 'fattura bolletta documento commerciale',
      'enel': 'enel energia elettrica bolletta luce',
      'eni': 'eni gas bolletta metano',
      'acea': 'acea acqua bolletta idrico',
      'telecom': 'telecom tim telefono bolletta',
      'tim': 'tim telecom telefono bolletta',
      'wind': 'wind tre telefono bolletta',
      'vodafone': 'vodafone telefono bolletta',
      'contratto': 'contratto accordo documento legale',
      'affitto': 'contratto locazione affitto canone',
      'locazione': 'contratto locazione affitto immobile',
      'mutuo': 'banca mutuo finanziamento prestito',
      'prestito': 'banca prestito finanziamento credito',
      'estratto': 'banca estratto conto movimento',
      'bonifico': 'banca bonifico pagamento trasferimento',
      'imu': 'imu imposta municipale tasse tributi',
      'tari': 'tari rifiuti tasse tarsu',
      'tassa': 'tassa imposta tributo pagamento',
      'f24': 'f24 tasse pagamento modello',
      'ricevuta': 'ricevuta pagamento quietanza',
      'polizza': 'assicurazione polizza copertura',
      'assicurazione': 'assicurazione polizza protezione',
      'rc': 'assicurazione rc auto responsabilità civile',
      'kasko': 'assicurazione kasko auto copertura'
    };
  }

  async extractTextFromFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      console.log(`📄 File di testo: ${content.length} caratteri`);
      return content;
    } catch (error) {
      throw new Error(`Errore lettura file di testo: ${error.message}`);
    }
  }

  classifyDocument(text, filename) {
    const lowerText = text.toLowerCase();
    const lowerFilename = filename.toLowerCase();
    const scores = {};

    Object.keys(this.categories).forEach(categoryKey => {
      const category = this.categories[categoryKey];
      let score = 0;
      const foundKeywords = [];

      category.keywords.forEach(keyword => {
        const keywordLower = keyword.toLowerCase();
        
        const textMatches = (lowerText.match(new RegExp(`\\b${this.escapeRegex(keywordLower)}\\b`, 'gi')) || []).length;
        const filenameMatches = (lowerFilename.match(new RegExp(`\\b${this.escapeRegex(keywordLower)}\\b`, 'gi')) || []).length;
        
        if (textMatches > 0 || filenameMatches > 0) {
          foundKeywords.push(keyword);
          score += (textMatches * category.weight) + (filenameMatches * 4 * category.weight);
        }
      });

      if (category.aliases) {
        category.aliases.forEach(alias => {
          const aliasLower = alias.toLowerCase();
          const textMatches = (lowerText.match(new RegExp(`\\b${this.escapeRegex(aliasLower)}\\b`, 'gi')) || []).length;
          const filenameMatches = (lowerFilename.match(new RegExp(`\\b${this.escapeRegex(aliasLower)}\\b`, 'gi')) || []).length;
          
          if (textMatches > 0 || filenameMatches > 0) {
            foundKeywords.push(alias);
            score += (textMatches * category.weight * 0.8) + (filenameMatches * 3 * category.weight);
          }
        });
      }

      scores[categoryKey] = { score: score, keywords: foundKeywords };
    });

    let bestCategory = 'Altri_Documenti';
    let bestScore = 0;
    let bestKeywords = [];

    Object.keys(scores).forEach(categoryKey => {
      if (scores[categoryKey].score > bestScore) {
        bestCategory = categoryKey;
        bestScore = scores[categoryKey].score;
        bestKeywords = scores[categoryKey].keywords;
      }
    });

    let confidence = Math.min(95, Math.max(25, bestScore * 12));
    
    const filenameBoost = bestKeywords.some(keyword => 
      filename.toLowerCase().includes(keyword.toLowerCase())
    );
    if (filenameBoost && confidence < 85) {
      confidence += 10;
    }

    return {
      category: bestCategory,
      confidence: Math.round(confidence),
      keywords: [...new Set(bestKeywords)]
    };
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  extractYear(text, filePath = '') {
    const sources = [text, path.basename(filePath)].join(' ');
    
    const yearRegex = /20\d{2}/g;
    const years = sources.match(yearRegex);
    
    if (years && years.length > 0) {
      const currentYear = new Date().getFullYear();
      const validYears = years
        .map(y => parseInt(y))
        .filter(y => y >= 2000 && y <= currentYear + 1)
        .sort((a, b) => b - a);
      
      if (validYears.length > 0) {
        return validYears[0].toString();
      }
    }
    
    return new Date().getFullYear().toString();
  }

  extractMetadata(text) {
    const metadata = {};
    
    try {
      const amountRegex = /(?:€|euro)\s*(\d+(?:[.,]\d{1,2})?)/gi;
      const amounts = [];
      let match;
      while ((match = amountRegex.exec(text)) !== null) {
        amounts.push(parseFloat(match[1].replace(',', '.')));
      }
      if (amounts.length > 0) {
        metadata.amounts = amounts;
        metadata.totalAmount = amounts.reduce((sum, amount) => sum + amount, 0);
      }

      const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/g;
      const dates = [];
      while ((match = dateRegex.exec(text)) !== null) {
        const day = match[1];
        const month = match[2];
        const year = match[3].length === 2 ? '20' + match[3] : match[3];
        dates.push(`${day}/${month}/${year}`);
      }
      if (dates.length > 0) {
        metadata.dates = [...new Set(dates)];
      }

      const cfRegex = /[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/g;
      const codiciFiscali = text.match(cfRegex);
      if (codiciFiscali) {
        metadata.codiciFiscali = [...new Set(codiciFiscali)];
      }

      const ibanRegex = /IT\d{2}[A-Z]\d{3}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{3}/g;
      const ibans = text.match(ibanRegex);
      if (ibans) {
        metadata.ibans = [...new Set(ibans)];
      }

      const protocolRegex = /(?:n\.?\s*|numero\s+|prot\.?\s*)(\d{4,})/gi;
      const protocols = [];
      while ((match = protocolRegex.exec(text)) !== null) {
        protocols.push(match[1]);
      }
      if (protocols.length > 0) {
        metadata.protocols = [...new Set(protocols)];
      }

    } catch (error) {
      console.error('Errore estrazione metadata:', error);
    }

    return metadata;
  }

  sanitizeText(text) {
    return text
      .replace(/[^\w\s\u00C0-\u017F.,;:!?()€$%&+-=]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getDefaultCategories() {
    return {
      'IMU': { 
        keywords: ['imu', 'imposta municipale', 'comune', 'ravvedimento', 'f24'], 
        folder: 'Tasse/IMU',
        color: '#FF6B6B',
        weight: 1.0
      },
      'TARI': { 
        keywords: ['tari', 'rifiuti', 'tarsu', 'tariffa rifiuti'], 
        folder: 'Tasse/TARI',
        color: '#4ECDC4',
        weight: 1.0
      },
      'Bollette_Energia': { 
        keywords: ['energia elettrica', 'enel', 'eni', 'edison', 'kw', 'kwh', 'bolletta luce'], 
        folder: 'Bollette/Energia_Elettrica',
        color: '#45B7D1',
        weight: 1.0
      },
      'Bollette_Gas': { 
        keywords: ['gas', 'metano', 'smc', 'metro cubo', 'bolletta gas'], 
        folder: 'Bollette/Gas',
        color: '#F7931E',
        weight: 1.0
      },
      'Bollette_Acqua': { 
        keywords: ['acqua', 'acea', 'acquedotto', 'bolletta acqua'], 
        folder: 'Bollette/Acqua',
        color: '#96CEB4',
        weight: 1.0
      },
      'Bollette_Telefono': {
        keywords: ['tim', 'vodafone', 'wind', 'tre', 'telefono', 'mobile'],
        folder: 'Bollette/Telefono',
        color: '#9B59B6',
        weight: 1.0
      },
      'Contratti': { 
        keywords: ['contratto', 'accordo', 'clausola', 'firma', 'locazione'], 
        folder: 'Contratti',
        color: '#FFEAA7',
        weight: 1.0
      },
      'Banca': { 
        keywords: ['banca', 'conto corrente', 'iban', 'bonifico', 'estratto conto'], 
        folder: 'Documenti_Bancari',
        color: '#DDA0DD',
        weight: 1.0
      },
      'Assicurazioni': {
        keywords: ['assicurazione', 'polizza', 'rc auto', 'kasko'],
        folder: 'Assicurazioni',
        color: '#98D8C8',
        weight: 1.0
      }
    };
  }

  getSupportedFileTypes() {
    return {
      'PDF': {
        extensions: ['.pdf'],
        description: 'Documenti PDF con testo estraibile',
        processing: 'Estrazione testo completa'
      },
      'Immagini': {
        extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp'],
        description: 'Immagini con OCR avanzato e analisi nome file',
        processing: 'OCR Tesseract + analisi intelligente'
      },
      'Testo': {
        extensions: ['.txt', '.rtf'],
        description: 'File di testo puro',
        processing: 'Lettura diretta contenuto'
      }
    };
  }

  async cleanup() {
    console.log('✅ Document Processor Enhanced cleanup...');
    await this.ocrEngine.terminate();
    console.log('✅ Cleanup completato');
  }
}

module.exports = DocumentProcessor;
