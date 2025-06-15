const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const mime = require('mime-types');

class DocumentProcessor {
  constructor() {
    this.categories = {
      'IMU': { 
        keywords: ['imu', 'imposta municipale', 'comune', 'ravvedimento', 'f24', 'tributi', 'ici'], 
        weight: 1.0,
        aliases: ['ici', 'imposta comunale']
      },
      'TARI': { 
        keywords: ['tari', 'rifiuti', 'tarsu', 'tariffa rifiuti', 'tassa rifiuti', 'igiene urbana'], 
        weight: 1.0,
        aliases: ['tarsu', 'tia']
      },
      'Bollette_Energia': { 
        keywords: ['energia elettrica', 'enel', 'eni', 'edison', 'acea energia', 'kw', 'kwh', 'bolletta luce', 'elettrica'], 
        weight: 1.0,
        aliases: ['luce', 'corrente elettrica']
      },
      'Bollette_Gas': { 
        keywords: ['gas', 'metano', 'smc', 'metro cubo', 'bolletta gas', 'eni gas'], 
        weight: 1.0,
        aliases: ['gas naturale', 'metano']
      },
      'Bollette_Acqua': { 
        keywords: ['acqua', 'acea', 'acquedotto', 'bolletta acqua', 'idrico', 'servizio idrico'], 
        weight: 1.0,
        aliases: ['idrica', 'acquedotto']
      },
      'Contratti': { 
        keywords: ['contratto', 'accordo', 'clausola', 'firma', 'locazione', 'affitto', 'canone'], 
        weight: 1.0,
        aliases: ['accordo', 'patto']
      },
      'Banca': { 
        keywords: ['banca', 'conto corrente', 'iban', 'bonifico', 'estratto conto', 'movimento', 'unicredit', 'intesa'], 
        weight: 1.0,
        aliases: ['bancario', 'finanziario']
      },
      'Assicurazioni': {
        keywords: ['assicurazione', 'polizza', 'rc auto', 'kasko', 'copertura assicurativa', 'premio'],
        weight: 1.0,
        aliases: ['polizza', 'copertura']
      }
    };
    
    console.log('📋 Document Processor inizializzato');
  }

  async analyzeDocument(filePath) {
    try {
      console.log(`🔍 Analisi: ${path.basename(filePath)}`);
      
      const mimeType = mime.lookup(filePath);
      let extractedText = '';
      let processingMethod = 'unknown';

      if (mimeType === 'application/pdf') {
        extractedText = await this.extractTextFromPDF(filePath);
        processingMethod = 'PDF parsing';
      } else if (mimeType && mimeType.startsWith('image/')) {
        extractedText = await this.analyzeImageByFilename(filePath);
        processingMethod = 'Analisi filename (immagine)';
      } else if (mimeType && mimeType.startsWith('text/')) {
        extractedText = await this.extractTextFromFile(filePath);
        processingMethod = 'File di testo';
      } else {
        extractedText = await this.analyzeImageByFilename(filePath);
        processingMethod = 'Analisi filename (tipo sconosciuto)';
      }

      const classification = this.classifyDocument(extractedText, path.basename(filePath));
      const year = this.extractYear(extractedText, filePath);
      const metadata = this.extractMetadata(extractedText);

      const result = {
        filename: path.basename(filePath),
        fullPath: filePath,
        extractedText: this.sanitizeText(extractedText).substring(0, 500) + (extractedText.length > 500 ? '...' : ''),
        category: classification.category,
        confidence: classification.confidence,
        keywords: classification.keywords,
        year: year,
        metadata: metadata,
        fileSize: (await fs.stat(filePath)).size,
        mimeType: mimeType,
        processingMethod: processingMethod,
        analyzedAt: new Date().toISOString()
      };

      console.log(`✅ Analisi completata: ${result.filename} → ${result.category} (${result.confidence}% confidence) via ${processingMethod}`);
      return result;

    } catch (error) {
      console.error(`❌ Errore analisi ${path.basename(filePath)}:`, error.message);
      throw new Error(`Errore analisi documento: ${error.message}`);
    }
  }

  async extractTextFromPDF(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer, {
        max: 100,
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

  getSupportedFileTypes() {
    return {
      'PDF': {
        extensions: ['.pdf'],
        description: 'Documenti PDF con testo estraibile',
        processing: 'Estrazione testo completa'
      },
      'Immagini': {
        extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp'],
        description: 'Immagini con analisi basata su nome file',
        processing: 'Analisi nome file intelligente'
      },
      'Testo': {
        extensions: ['.txt', '.rtf'],
        description: 'File di testo puro',
        processing: 'Lettura diretta contenuto'
      }
    };
  }

  async cleanup() {
    console.log('✅ Document Processor cleanup completato');
  }
}

module.exports = DocumentProcessor;
