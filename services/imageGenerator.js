import { createCanvas, loadImage, registerFont } from 'canvas';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fontManager from '../utils/fontManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Generate PNG image using canvas library
export const generateCanvasImage = async (config, elements, params = {}) => {
  try {
    // Create canvas with specified dimensions
    const canvas = createCanvas(config.width || 800, config.height || 600);
    const ctx = canvas.getContext('2d');
    
    // Set white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add background image if provided
    if (config.backgroundImage) {
      try {
        const bgImage = await loadImage(config.backgroundImage);
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
      } catch (error) {
        console.warn('Failed to load background image:', error.message);
      }
    }
    
    // Draw elements
    for (const element of elements) {
      const variableValue = params[element.variableName];
      
      if (element.data.type === 'text') {
        await drawTextElement(ctx, element, variableValue);
      } else if (element.data.type === 'image') {
        await drawImageElement(ctx, element, variableValue);
      }
    }
    
    // Return PNG buffer
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error generating canvas image:', error);
    throw error;
  }
};

// Helper function to wrap text
const wrapText = (ctx, text, maxWidth) => {
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
};

const drawTextElement = async (ctx, element, variableValue) => {
  try {
    const text = variableValue || element.data.content || `{${element.variableName}}`;
    
    // Set font properties
    const fontSize = element.data.fontSize || 16;
    const fontFamily = element.data.fontFamily || 'Arial';
    const fontWeight = element.data.fontWeight || 'normal';
    
    // Use Arial with fallbacks for containerized environments
    ctx.font = `${fontWeight} ${fontSize}px Arial, DejaVu Sans, Liberation Sans, sans-serif`;
    ctx.fillStyle = element.data.color || '#000000';
    ctx.textAlign = element.data.textAlign || 'left';
    ctx.textBaseline = 'top';

    // Handle text wrapping if maxWidth is specified
    const maxWidth = element.data.maxWidth || 400;
    const lines = text.includes('\n') ? text.split('\n') : [text];
    
    let allLines = [];
    lines.forEach(line => {
      if (ctx.measureText(line).width > maxWidth) {
        allLines = allLines.concat(wrapText(ctx, line, maxWidth));
      } else {
        allLines.push(line);
      }
    });

    // Draw each line
    allLines.forEach((line, index) => {
      ctx.fillText(line, element.x, element.y + (index * fontSize * 1.2));
    });
  } catch (error) {
    console.error('Error drawing text element:', error);
    // Draw fallback text
    ctx.fillStyle = '#ff0000';
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
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