import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simplified image generator that returns SVG for now
// This can be enhanced later with proper image generation libraries
export const generateCanvasImage = async (config, elements, params = {}) => {
  try {
    // Generate SVG representation of the canvas
    const svg = generateSVG(config, elements, params);
    
    // Convert SVG to buffer
    return Buffer.from(svg, 'utf-8');
  } catch (error) {
    console.error('Error generating canvas image:', error);
    throw error;
  }
};

const generateSVG = (config, elements, params = {}) => {
  let svg = `<svg width="${config.width}" height="${config.height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Add background
  svg += `<rect width="100%" height="100%" fill="white"/>`;
  
  // Add background image if provided
  if (config.backgroundImage) {
    svg += `<image href="${escapeXmlAttribute(config.backgroundImage)}" width="${config.width}" height="${config.height}" preserveAspectRatio="xMidYMid slice"/>`;
  }
  
  // Add elements
  elements.forEach(element => {
    const variableValue = params[element.variableName];
    
    if (element.data.type === 'text') {
      const text = variableValue || element.data.content || `{${element.variableName}}`;
      const fontSize = element.data.fontSize || 16;
      const fontFamily = element.data.fontFamily || 'Arial';
      const fontWeight = element.data.fontWeight || 'normal';
      const color = element.data.color || '#000000';
      const textAlign = element.data.textAlign || 'left';
      const letterSpacing = element.data.letterSpacing || 'normal';
      
      let textAnchor = 'start';
      if (textAlign === 'center') textAnchor = 'middle';
      if (textAlign === 'right') textAnchor = 'end';
      
      svg += `<text x="${element.x}" y="${element.y + fontSize}" font-family="${escapeXmlAttribute(fontFamily)}" font-size="${fontSize}" font-weight="${escapeXmlAttribute(fontWeight)}" fill="${escapeXmlAttribute(color)}" text-anchor="${textAnchor}" letter-spacing="${escapeXmlAttribute(letterSpacing)}">${escapeXml(text)}</text>`;
    } else if (element.data.type === 'image') {
      const imageSrc = variableValue || element.data.src || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIiBzdHJva2U9IiNjY2MiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjNjY2Ij5JbWFnZTwvdGV4dD48L3N2Zz4=';
      const width = element.data.width || 150;
      const height = element.data.height || 100;
      
      svg += `<image href="${escapeXmlAttribute(imageSrc)}" x="${element.x}" y="${element.y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`;
    }
  });
  
  svg += '</svg>';
  return svg;
};

const escapeXml = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const escapeXmlAttribute = (value) => {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const drawTextElement = async (ctx, element, variableValue) => {
  try {
    const text = variableValue || element.data.content || `{${element.variableName}}`;
    
    // Set font properties
    const fontSize = element.data.fontSize || 16;
    const fontFamily = element.data.fontFamily || 'Arial';
    const fontWeight = element.data.fontWeight || 'normal';
    
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = element.data.color || '#000000';
    ctx.textAlign = element.data.textAlign || 'left';
    ctx.textBaseline = 'top';

    // Handle text alignment
    let x = element.x;
    if (element.data.textAlign === 'center') {
      const textWidth = ctx.measureText(text).width;
      x = element.x;
    } else if (element.data.textAlign === 'right') {
      const textWidth = ctx.measureText(text).width;
      x = element.x;
    }

    // Draw text with word wrapping if needed
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      ctx.fillText(line, x, element.y + (index * fontSize * 1.2));
    });
  } catch (error) {
    console.error('Error drawing text element:', error);
    // Draw fallback text
    ctx.fillStyle = '#ff0000';
    ctx.font = '16px Arial';
    ctx.fillText('Error loading text', element.x, element.y);
  }
};

const drawImageElement = async (ctx, element, variableValue) => {
  try {
    const imageSrc = variableValue || element.data.src;
    
    if (!imageSrc) {
      // Draw placeholder rectangle
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(element.x, element.y, element.data.width || 150, element.data.height || 100);
      ctx.strokeStyle = '#cccccc';
      ctx.strokeRect(element.x, element.y, element.data.width || 150, element.data.height || 100);
      
      // Draw placeholder text
      ctx.fillStyle = '#666666';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        'Image', 
        element.x + (element.data.width || 150) / 2, 
        element.y + (element.data.height || 100) / 2
      );
      return;
    }

    const img = await loadImage(imageSrc);
    const width = element.data.width || img.width;
    const height = element.data.height || img.height;
    
    // Handle object-fit property
    const objectFit = element.data.objectFit || 'cover';
    
    if (objectFit === 'cover') {
      // Calculate scaling to cover the entire area
      const scaleX = width / img.width;
      const scaleY = height / img.height;
      const scale = Math.max(scaleX, scaleY);
      
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      
      const offsetX = (width - scaledWidth) / 2;
      const offsetY = (height - scaledHeight) / 2;
      
      ctx.save();
      ctx.beginPath();
      ctx.rect(element.x, element.y, width, height);
      ctx.clip();
      
      ctx.drawImage(
        img,
        element.x + offsetX,
        element.y + offsetY,
        scaledWidth,
        scaledHeight
      );
      
      ctx.restore();
    } else if (objectFit === 'contain') {
      // Calculate scaling to fit within the area
      const scaleX = width / img.width;
      const scaleY = height / img.height;
      const scale = Math.min(scaleX, scaleY);
      
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      
      const offsetX = (width - scaledWidth) / 2;
      const offsetY = (height - scaledHeight) / 2;
      
      ctx.drawImage(
        img,
        element.x + offsetX,
        element.y + offsetY,
        scaledWidth,
        scaledHeight
      );
    } else {
      // Default: stretch to fill
      ctx.drawImage(img, element.x, element.y, width, height);
    }
  } catch (error) {
    console.error('Error drawing image element:', error);
    // Draw error placeholder
    ctx.fillStyle = '#ffebee';
    ctx.fillRect(element.x, element.y, element.data.width || 150, element.data.height || 100);
    ctx.strokeStyle = '#f44336';
    ctx.strokeRect(element.x, element.y, element.data.width || 150, element.data.height || 100);
    
    ctx.fillStyle = '#f44336';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Failed to load', 
      element.x + (element.data.width || 150) / 2, 
      element.y + (element.data.height || 100) / 2
    );
  }
};