import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { registerFont } from 'canvas';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class FontManager {
  constructor() {
    this.fontsDir = path.join(__dirname, '..', 'fonts');
    this.registeredFonts = new Set();
    this.fontMap = new Map();
    
    // Ensure fonts directory exists
    if (!fs.existsSync(this.fontsDir)) {
      fs.mkdirSync(this.fontsDir, { recursive: true });
    }
    
    this.initializeFontMap();
  }
  
  initializeFontMap() {
    // Map frontend font families to Google Fonts API names
    this.fontMap.set('Montserrat, sans-serif', 'Montserrat');
    this.fontMap.set('Playfair Display, serif', 'Playfair Display');
    this.fontMap.set('Merriweather, serif', 'Merriweather');
    this.fontMap.set('Lora, serif', 'Lora');
    this.fontMap.set('Raleway, sans-serif', 'Raleway');
    this.fontMap.set('Open Sans, sans-serif', 'Open Sans');
    this.fontMap.set('Roboto, sans-serif', 'Roboto');
    this.fontMap.set('Lato, sans-serif', 'Lato');
    this.fontMap.set('Poppins, sans-serif', 'Poppins');
    this.fontMap.set('Nunito, sans-serif', 'Nunito');
    this.fontMap.set('Source Sans Pro, sans-serif', 'Source Sans Pro');
    this.fontMap.set('Bebas Neue, sans-serif', 'Bebas Neue');
    this.fontMap.set('Oswald, sans-serif', 'Oswald');
    this.fontMap.set('Dancing Script, cursive', 'Dancing Script');
    this.fontMap.set('Pacifico, cursive', 'Pacifico');
    this.fontMap.set('Great Vibes, cursive', 'Great Vibes');
    this.fontMap.set('Satisfy, cursive', 'Satisfy');
    this.fontMap.set('Kaushan Script, cursive', 'Kaushan Script');
    this.fontMap.set('Amatic SC, cursive', 'Amatic SC');
    this.fontMap.set('Caveat, cursive', 'Caveat');
    this.fontMap.set('Source Code Pro, monospace', 'Source Code Pro');
    this.fontMap.set('Fira Code, monospace', 'Fira Code');
    this.fontMap.set('JetBrains Mono, monospace', 'JetBrains Mono');
    this.fontMap.set('Roboto Mono, monospace', 'Roboto Mono');
  }
  
  async downloadFont(fontFamily, weights = ['400', '700']) {
    try {
      const googleFontName = this.fontMap.get(fontFamily);
      if (!googleFontName) {
        console.log(`Font ${fontFamily} not found in Google Fonts map, using fallback`);
        return false;
      }
      
      const fontDir = path.join(this.fontsDir, googleFontName.replace(/\s+/g, '_'));
      if (!fs.existsSync(fontDir)) {
        fs.mkdirSync(fontDir, { recursive: true });
      }
      
      for (const weight of weights) {
        const fontFileName = `${googleFontName.replace(/\s+/g, '_')}-${weight}.ttf`;
        const fontPath = path.join(fontDir, fontFileName);
        
        if (fs.existsSync(fontPath)) {
          console.log(`Font ${fontFileName} already exists`);
          continue;
        }
        
        // Get font URL from Google Fonts API
        const apiUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(googleFontName)}:wght@${weight}&display=swap`;
        const cssResponse = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (!cssResponse.ok) {
          console.error(`Failed to fetch CSS for ${googleFontName}:${weight}`);
          continue;
        }
        
        const cssText = await cssResponse.text();
        const fontUrlMatch = cssText.match(/url\(([^)]+)\)/);
        
        if (!fontUrlMatch) {
          console.error(`Could not extract font URL from CSS for ${googleFontName}:${weight}`);
          continue;
        }
        
        const fontUrl = fontUrlMatch[1];
        const fontResponse = await fetch(fontUrl);
        
        if (!fontResponse.ok) {
          console.error(`Failed to download font from ${fontUrl}`);
          continue;
        }
        
        const fontBuffer = await fontResponse.buffer();
        fs.writeFileSync(fontPath, fontBuffer);
        console.log(`Downloaded font: ${fontFileName}`);
      }
      
      return true;
    } catch (error) {
      console.error(`Error downloading font ${fontFamily}:`, error);
      return false;
    }
  }
  
  async registerFont(fontFamily) {
    try {
      const googleFontName = this.fontMap.get(fontFamily);
      if (!googleFontName) {
        return this.getFallbackFont(fontFamily);
      }
      
      const fontKey = `${googleFontName}-registered`;
      if (this.registeredFonts.has(fontKey)) {
        return googleFontName;
      }
      
      // Download font if not exists
      await this.downloadFont(fontFamily);
      
      const fontDir = path.join(this.fontsDir, googleFontName.replace(/\s+/g, '_'));
      const regularFontPath = path.join(fontDir, `${googleFontName.replace(/\s+/g, '_')}-400.ttf`);
      const boldFontPath = path.join(fontDir, `${googleFontName.replace(/\s+/g, '_')}-700.ttf`);
      
      // Use a simplified family name for registration
      const simpleFamilyName = googleFontName.replace(/\s+/g, '');
      
      // Register regular weight
      if (fs.existsSync(regularFontPath)) {
        registerFont(regularFontPath, { family: simpleFamilyName });
        console.log(`Registered font: ${simpleFamilyName} (regular)`);
      }
      
      // Register bold weight if available
      if (fs.existsSync(boldFontPath)) {
        registerFont(boldFontPath, { family: simpleFamilyName, weight: 'bold' });
        console.log(`Registered font: ${simpleFamilyName} (bold)`);
      }
      
      this.registeredFonts.add(fontKey);
      return simpleFamilyName;
    } catch (error) {
      console.error(`Error registering font ${fontFamily}:`, error);
      return this.getFallbackFont(fontFamily);
    }
  }
  
  getFallbackFont(fontFamily) {
    // Return appropriate fallback fonts based on font family
    if (fontFamily.includes('serif')) {
      return 'Times New Roman, serif';
    } else if (fontFamily.includes('monospace')) {
      return 'Courier New, monospace';
    } else if (fontFamily.includes('cursive')) {
      return 'Comic Sans MS, cursive';
    } else {
      return 'Arial, sans-serif';
    }
  }
  
  async ensureFontAvailable(fontFamily) {
    try {
      // For now, use system fonts to ensure compatibility
      // This provides immediate text rendering while font downloading happens in background
      const systemFont = this.getSystemFont(fontFamily);
      
      // Attempt to register Google Font in background (non-blocking)
      this.registerFont(fontFamily).catch(err => {
        console.log(`Background font registration failed for ${fontFamily}:`, err.message);
      });
      
      return systemFont;
    } catch (error) {
      console.error(`Error ensuring font availability for ${fontFamily}:`, error);
      return this.getFallbackFont(fontFamily);
    }
  }
  
  getSystemFont(fontFamily) {
    // Map to system fonts that are more likely to be available
    const lowerFamily = fontFamily.toLowerCase();
    
    if (lowerFamily.includes('oswald')) return 'Impact';
    if (lowerFamily.includes('montserrat')) return 'Arial';
    if (lowerFamily.includes('roboto')) return 'Arial';
    if (lowerFamily.includes('open sans')) return 'Arial';
    if (lowerFamily.includes('lato')) return 'Arial';
    if (lowerFamily.includes('poppins')) return 'Arial';
    if (lowerFamily.includes('playfair')) return 'Times New Roman';
    if (lowerFamily.includes('merriweather')) return 'Times New Roman';
    if (lowerFamily.includes('lora')) return 'Times New Roman';
    if (lowerFamily.includes('dancing script')) return 'Comic Sans MS';
    if (lowerFamily.includes('pacifico')) return 'Comic Sans MS';
    if (lowerFamily.includes('source code')) return 'Courier New';
    if (lowerFamily.includes('fira code')) return 'Courier New';
    if (lowerFamily.includes('mono')) return 'Courier New';
    
    return this.getFallbackFont(fontFamily);
  }
}

export default new FontManager();