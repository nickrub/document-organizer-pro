// src/templateMatcher.js
class TemplateMatcher {
  constructor() {
    this.templates = this.initializeTemplates();
    console.log('🎯 Template Matcher inizializzato');
  }

  initializeTemplates() {
    return {
      enel: {
        company: 'ENEL',
        category: 'Bollette_Energia',
        indicators: ['enel', 'energia elettrica', 'e-distribuzione'],
        required_fields: ['codice cliente', 'kwh', 'periodo'],
        confidence_boost: 20,
        patterns: {
          amount: /totale da pagare[:\s]*€?\s*([\d.,]+)/i,
          code: /codice cliente[:\s]*(\w+)/i,
          period: /periodo[:\s]*dal[:\s]*([\d\/]+)[:\s]*al[:\s]*([\d\/]+)/i
        }
      },
      
      eni: {
        company: 'ENI',
        category: 'Bollette_Gas',
        indicators: ['eni', 'gas e luce', 'eni gas'],
        required_fields: ['cliente', 'smc', 'gas'],
        confidence_boost: 20,
        patterns: {
          amount: /importo totale[:\s]*€?\s*([\d.,]+)/i,
          consumption: /consumo[:\s]*([\d.,]+)\s*smc/i
        }
      },

      acea: {
        company: 'ACEA',
        category: 'Bollette_Acqua',
        indicators: ['acea', 'acqua', 'servizio idrico'],
        required_fields: ['utenza', 'mc', 'acqua'],
        confidence_boost: 20,
        patterns: {
          amount: /totale[:\s]*€?\s*([\d.,]+)/i,
          consumption: /([\d.,]+)\s*mc/i
        }
      },

      tim: {
        company: 'TIM',
        category: 'Bollette_Telefono',
        indicators: ['tim', 'telecom', 'telefono'],
        required_fields: ['linea', 'traffico'],
        confidence_boost: 20,
        patterns: {
          amount: /totale fattura[:\s]*€?\s*([\d.,]+)/i,
          phone: /(\d{3}[\s\-]?\d{3}[\s\-]?\d{4})/
        }
      },

      imu: {
        company: 'Comune',
        category: 'IMU',
        indicators: ['imu', 'imposta municipale', 'tributi', 'f24'],
        required_fields: ['codice tributo', 'immobile'],
        confidence_boost: 25,
        patterns: {
          amount: /€?\s*([\d.,]+)/,
          year: /(20\d{2})/,
          code: /codice tributo[:\s]*(\d+)/i
        }
      },

      tari: {
        company: 'Comune',
        category: 'TARI',
        indicators: ['tari', 'rifiuti', 'tarsu', 'tassa rifiuti'],
        required_fields: ['superficie', 'rifiuti'],
        confidence_boost: 25,
        patterns: {
          amount: /€?\s*([\d.,]+)/,
          surface: /superficie[:\s]*([\d.,]+)\s*mq/i
        }
      },

      vodafone: {
        company: 'VODAFONE',
        category: 'Bollette_Telefono',
        indicators: ['vodafone', 'mobile', 'telefonia'],
        required_fields: ['numero', 'piano'],
        confidence_boost: 20,
        patterns: {
          amount: /totale[:\s]*€?\s*([\d.,]+)/i,
          phone: /(\d{3}[\s\-]?\d{3}[\s\-]?\d{4})/
        }
      },

      wind: {
        company: 'WIND TRE',
        category: 'Bollette_Telefono',
        indicators: ['wind', 'tre', '3'],
        required_fields: ['utenza', 'traffico'],
        confidence_boost: 20,
        patterns: {
          amount: /importo[:\s]*€?\s*([\d.,]+)/i,
          phone: /(\d{3}[\s\-]?\d{3}[\s\-]?\d{4})/
        }
      }
    };
  }

  matchTemplate(text, filename = '', extractedData = {}) {
    const lowerText = text.toLowerCase();
    const lowerFilename = filename.toLowerCase();
    
    let bestMatch = null;
    let bestScore = 0;

    for (const [templateId, template] of Object.entries(this.templates)) {
      let score = 0;
      const matches = {
        indicators: [],
        fields: [],
        patterns: {}
      };

      // Verifica indicatori principali
      template.indicators.forEach(indicator => {
        if (lowerText.includes(indicator) || lowerFilename.includes(indicator)) {
          score += 10;
          matches.indicators.push(indicator);
        }
      });

      // Verifica campi richiesti
      template.required_fields.forEach(field => {
        if (lowerText.includes(field)) {
          score += 5;
          matches.fields.push(field);
        }
      });

      // Verifica pattern specifici
      if (template.patterns) {
        Object.entries(template.patterns).forEach(([key, pattern]) => {
          const match = text.match(pattern);
          if (match) {
            score += 8;
            matches.patterns[key] = match[1] || match[0];
          }
        });
      }

      // Bonus per azienda riconosciuta
      if (extractedData.companies && extractedData.companies.includes(template.company.toLowerCase())) {
        score += template.confidence_boost;
      }

      // Valuta se è il miglior match
      if (score > bestScore && score >= 15) { // Soglia minima
        bestScore = score;
        bestMatch = {
          template: templateId,
          company: template.company,
          category: template.category,
          confidence: Math.min(95, score + template.confidence_boost),
          matches: matches,
          extractedValues: matches.patterns
        };
      }
    }

    return bestMatch;
  }

  enhanceAnalysis(baseAnalysis, templateMatch) {
    if (!templateMatch) return baseAnalysis;

    return {
      ...baseAnalysis,
      company: templateMatch.company,
      category: templateMatch.category,
      confidence: Math.max(baseAnalysis.confidence, templateMatch.confidence),
      templateMatched: templateMatch.template,
      extractedValues: templateMatch.extractedValues,
      enhancedBy: 'template_matching'
    };
  }

  getTemplateStats() {
    return {
      totalTemplates: Object.keys(this.templates).length,
      categories: [...new Set(Object.values(this.templates).map(t => t.category))],
      companies: [...new Set(Object.values(this.templates).map(t => t.company))]
    };
  }
}

module.exports = TemplateMatcher;
