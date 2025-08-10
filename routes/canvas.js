import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getQuery, getAllQuery } from '../database/init.js';
import { generateCanvasImage } from '../services/imageGenerator.js';
import fontManager from '../utils/fontManager.js';

const router = express.Router();

// Helper function to replace BASE_URL with actual backend URL
function replaceBaseUrl(obj, req) {
  const backendUrl = `${req.protocol}://${req.get('host')}`;
  
  if (typeof obj === 'string') {
    return obj.replace(/BASE_URL/g, backendUrl);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => replaceBaseUrl(item, req));
  }
  
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replaceBaseUrl(value, req);
    }
    return result;
  }
  
  return obj;
}

// Category management routes

// Get all categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await getAllQuery(
      'SELECT * FROM categories ORDER BY name ASC'
    );
    res.json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create a new category
router.post('/categories', async (req, res) => {
  try {
    const { name, color = '#3B82F6' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const categoryId = uuidv4();
    
    await runQuery(
      'INSERT INTO categories (id, name, color) VALUES ($1, $2, $3)',
      [categoryId, name, color]
    );

    const category = await getQuery(
      'SELECT * FROM categories WHERE id = $1',
      [categoryId]
    );

    res.json({ success: true, category });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update a category
router.put('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;
    
    const existingCategory = await getQuery(
      'SELECT id FROM categories WHERE id = $1',
      [id]
    );
    
    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    await runQuery(
      'UPDATE categories SET name = $1, color = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [name, color, id]
    );

    const category = await getQuery(
      'SELECT * FROM categories WHERE id = $1',
      [id]
    );

    res.json({ success: true, category });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete a category
router.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await runQuery(
      'DELETE FROM categories WHERE id = $1',
      [id]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Template management routes

// Save a new canvas template
router.post('/templates', async (req, res) => {
  try {
    const { name, config, elements, categoryId } = req.body;
    
    if (!name || !config || !elements) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, config, elements' 
      });
    }

    const templateId = uuidv4();
    
    // Save template
    await runQuery(
      'INSERT INTO canvas_templates (id, name, config, elements, category_id) VALUES ($1, $2, $3, $4, $5)',
      [templateId, name, JSON.stringify(config), JSON.stringify(elements), categoryId || null]
    );

    // Extract and save variables
    const variablePromises = elements.map(element => {
      return runQuery(
        'INSERT INTO canvas_variables (template_id, variable_name, element_id, element_type, default_value) VALUES ($1, $2, $3, $4, $5)',
        [
          templateId,
          element.variableName,
          element.id,
          element.data.type,
          element.data.type === 'text' ? element.data.content : element.data.src
        ]
      );
    });

    await Promise.all(variablePromises);

    res.json({ 
      success: true, 
      templateId,
      message: 'Template saved successfully' 
    });
  } catch (error) {
    console.error('Error saving template:', error);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

// Get all templates
router.get('/templates', async (req, res) => {
  try {
    const templates = await getAllQuery(`
      SELECT 
        t.id, t.name, t.config, t.elements, t.category_id, t.created_at, t.updated_at,
        c.name as category_name, c.color as category_color
      FROM canvas_templates t
      LEFT JOIN categories c ON t.category_id = c.id
      ORDER BY t.updated_at DESC
    `);
    
    // Parse config and elements for each template and convert base64 images
    const parsedTemplates = await Promise.all(templates.map(async (template) => {
      let config, elements;
      let templateUpdated = false;
      
      try {
        config = JSON.parse(template.config);
        elements = JSON.parse(template.elements);
      } catch (err) {
        console.error(`Failed to parse template ${template.id}:`, err.message);
        return {
          ...template,
          config: {},
          elements: [],
          category: template.category_id ? {
            id: template.category_id,
            name: template.category_name,
            color: template.category_color
          } : null
        };
      }
      
      // Check and convert background image
      if (config.backgroundImage && config.backgroundImage.startsWith('data:image/')) {
        try {
          const imageUrl = await convertBase64ToFile(config.backgroundImage, 'background');
          config.backgroundImage = imageUrl;
          templateUpdated = true;
          console.log(`✅ Auto-converted background image for template: ${template.name}`);
        } catch (err) {
          console.error(`❌ Failed to convert background image for template ${template.id}:`, err.message);
        }
      }
      
      // Check and convert image elements
      for (const element of elements) {
        if (element.data?.type === 'image' && element.data?.src && element.data.src.startsWith('data:image/')) {
          try {
            const imageUrl = await convertBase64ToFile(element.data.src, 'element');
            element.data.src = imageUrl;
            templateUpdated = true;
            console.log(`✅ Auto-converted image element for template: ${template.name}`);
          } catch (err) {
            console.error(`❌ Failed to convert image element for template ${template.id}:`, err.message);
          }
        }
      }
      
      // Update template in database if changes were made
      if (templateUpdated) {
        try {
          await runQuery(
            'UPDATE canvas_templates SET config = $1, elements = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [JSON.stringify(config), JSON.stringify(elements), template.id]
          );
          console.log(`📝 Auto-updated template: ${template.name}`);
        } catch (err) {
          console.error(`❌ Failed to update template ${template.id}:`, err.message);
        }
      }
      
      return {
        ...template,
        config,
        elements,
        category: template.category_id ? {
          id: template.category_id,
          name: template.category_name,
          color: template.category_color
        } : null
      };
    }));
    
    // Replace BASE_URL with actual backend URL in all templates
    const templatesWithReplacedUrls = replaceBaseUrl(parsedTemplates, req);
    
    res.json({ templates: templatesWithReplacedUrls });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get a specific template with its variables
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const template = await getQuery(
      'SELECT * FROM canvas_templates WHERE id = $1',
      [id]
    );
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const variables = await getAllQuery(
      'SELECT variable_name, element_type, default_value FROM canvas_variables WHERE template_id = $1',
      [id]
    );

    const templateData = {
      ...template,
      config: JSON.parse(template.config),
      elements: JSON.parse(template.elements),
      variables
    };

    // Replace BASE_URL with actual backend URL
    const templateWithReplacedUrls = replaceBaseUrl(templateData, req);

    res.json(templateWithReplacedUrls);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Update a template
router.put('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, config, elements, categoryId } = req.body;
    
    // Check if template exists
    const existingTemplate = await getQuery(
      'SELECT id FROM canvas_templates WHERE id = $1',
      [id]
    );
    
    if (!existingTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Update template
    await runQuery(
      'UPDATE canvas_templates SET name = $1, config = $2, elements = $3, category_id = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5',
      [name, JSON.stringify(config), JSON.stringify(elements), categoryId || null, id]
    );

    // Delete old variables and insert new ones
    await runQuery('DELETE FROM canvas_variables WHERE template_id = $1', [id]);
    
    const variablePromises = elements.map(element => {
      return runQuery(
        'INSERT INTO canvas_variables (template_id, variable_name, element_id, element_type, default_value) VALUES ($1, $2, $3, $4, $5)',
        [
          id,
          element.variableName,
          element.id,
          element.data.type,
          element.data.type === 'text' ? element.data.content : element.data.src
        ]
      );
    });

    await Promise.all(variablePromises);

    res.json({ 
      success: true, 
      message: 'Template updated successfully' 
    });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete a template
router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await runQuery(
      'DELETE FROM canvas_templates WHERE id = $1',
      [id]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ 
      success: true, 
      message: 'Template deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Handle OPTIONS request for CORS preflight
router.options('/render/:id', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  });
  res.status(200).end();
});

// Generate dynamic image from template
router.get('/render/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const params = req.query;
    
    // Get template data
    const template = await getQuery(
      'SELECT config, elements FROM canvas_templates WHERE id = $1',
      [id]
    );
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const config = JSON.parse(template.config);
    const elements = JSON.parse(template.elements);

    // Generate image
    const imageBuffer = await generateCanvasImage(config, elements, params);
    
    // Set appropriate headers for PNG images
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'X-Content-Type-Options': 'nosniff'
    });
    
    res.send(imageBuffer);
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

// Get template variables for a specific template
router.get('/templates/:id/variables', async (req, res) => {
  try {
    const { id } = req.params;
    
    const variables = await getAllQuery(
      'SELECT variable_name, element_type, default_value FROM canvas_variables WHERE template_id = $1 ORDER BY variable_name',
      [id]
    );

    res.json({ variables });
  } catch (error) {
    console.error('Error fetching variables:', error);
    res.status(500).json({ error: 'Failed to fetch variables' });
  }
});

// Test Google Fonts functionality
router.get('/test-fonts', async (req, res) => {
  try {
    const config = {
      width: 800,
      height: 600
    };
    
    const elements = [
      {
        id: 'title',
        variableName: 'title',
        x: 50,
        y: 50,
        data: {
          type: 'text',
          content: 'Montserrat Font Test',
          fontSize: 32,
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 'bold',
          color: '#2563eb'
        }
      },
      {
        id: 'subtitle',
        variableName: 'subtitle',
        x: 50,
        y: 120,
        data: {
          type: 'text',
          content: 'Test Text',
          fontSize: 34,
          fontFamily: 'Oswald, sans-serif',
          fontWeight: 'normal',
          color: '#374151'
        }
      },
      {
        id: 'script',
        variableName: 'script',
        x: 50,
        y: 180,
        data: {
          type: 'text',
          content: 'Dancing Script Cursive',
          fontSize: 28,
          fontFamily: 'Dancing Script, cursive',
          fontWeight: 'normal',
          color: '#dc2626'
        }
      },
      {
        id: 'serif',
        variableName: 'serif',
        x: 50,
        y: 240,
        data: {
          type: 'text',
          content: 'Playfair Display Serif',
          fontSize: 26,
          fontFamily: 'Playfair Display, serif',
          fontWeight: 'normal',
          color: '#059669'
        }
      },
      {
        id: 'mono',
        variableName: 'mono',
        x: 50,
        y: 300,
        data: {
          type: 'text',
          content: 'Source Code Pro Monospace',
          fontSize: 20,
          fontFamily: 'Source Code Pro, monospace',
          fontWeight: 'normal',
          color: '#7c3aed'
        }
      }
    ];
    
    const params = req.query;
    
    // Generate test image with Google Fonts
    const imageBuffer = await generateCanvasImage(config, elements, params);
    
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    
    res.send(imageBuffer);
  } catch (error) {
    console.error('Error generating font test image:', error);
    res.status(500).json({ error: 'Failed to generate font test image' });
  }
});

// Migration endpoint to replace localhost URLs with BASE_URL
router.post('/migrate-urls', async (req, res) => {
  try {
    const templates = await getAllQuery('SELECT id, name, config, elements FROM canvas_templates');
    let templatesUpdated = 0;
    let urlsReplaced = 0;

    for (const template of templates) {
      let config, elements;
      let templateUpdated = false;
      
      try {
        config = JSON.parse(template.config);
        elements = JSON.parse(template.elements);
      } catch (err) {
        console.error(`❌ Failed to parse template ${template.id}:`, err.message);
        continue;
      }
      
      // Replace localhost URLs in background image
      if (config.backgroundImage && config.backgroundImage.includes('http://localhost:3002/uploads/')) {
        config.backgroundImage = config.backgroundImage.replace('http://localhost:3002', 'BASE_URL');
        templateUpdated = true;
        urlsReplaced++;
        console.log(`✅ Replaced background URL for template: ${template.name}`);
      }
      
      // Replace localhost URLs in image elements
      for (const element of elements) {
        if (element.type === 'image' && element.data?.src && element.data.src.includes('http://localhost:3002/uploads/')) {
          element.data.src = element.data.src.replace('http://localhost:3002', 'BASE_URL');
          templateUpdated = true;
          urlsReplaced++;
          console.log(`✅ Replaced image element URL for template: ${template.name}`);
        }
      }
      
      // Update template in database if changes were made
      if (templateUpdated) {
        try {
          await runQuery(
            'UPDATE canvas_templates SET config = $1, elements = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [JSON.stringify(config), JSON.stringify(elements), template.id]
          );
          templatesUpdated++;
          console.log(`📝 Updated template: ${template.name}`);
        } catch (err) {
          console.error(`❌ Failed to update template ${template.id}:`, err.message);
        }
      }
    }
    
    console.log(`🎉 URL migration completed: ${templatesUpdated} templates updated, ${urlsReplaced} URLs replaced`);
    res.json({
      success: true,
      message: 'URL migration completed successfully',
      templatesUpdated,
      urlsReplaced
    });
  } catch (error) {
    console.error('❌ URL migration failed:', error);
    res.status(500).json({
      success: false,
      error: 'URL migration failed',
      details: error.message
    });
  }
});

// Migration endpoint to convert base64 images to files
router.post('/migrate-images', async (req, res) => {
  try {
    console.log('🔄 Starting image migration process...');
    
    // Get all templates
    const templates = await getAllQuery(`
      SELECT id, name, config, elements
      FROM canvas_templates
      ORDER BY created_at DESC
    `);
    
    let migratedCount = 0;
    let totalImagesProcessed = 0;
    
    for (const template of templates) {
      let templateUpdated = false;
      let config, elements;
      
      try {
        config = JSON.parse(template.config);
        elements = JSON.parse(template.elements);
      } catch (err) {
        console.error(`❌ Failed to parse template ${template.id}:`, err.message);
        continue;
      }
      
      // Check and convert background image
      if (config.backgroundImage && config.backgroundImage.startsWith('data:image/')) {
        try {
          const imageUrl = await convertBase64ToFile(config.backgroundImage, 'background');
          config.backgroundImage = imageUrl;
          templateUpdated = true;
          totalImagesProcessed++;
          console.log(`✅ Converted background image for template: ${template.name}`);
        } catch (err) {
          console.error(`❌ Failed to convert background image for template ${template.id}:`, err.message);
        }
      }
      
      // Check and convert image elements
      for (const element of elements) {
        if (element.type === 'image' && element.data?.src && element.data.src.startsWith('data:image/')) {
          try {
            const imageUrl = await convertBase64ToFile(element.data.src, 'element');
            element.data.src = imageUrl;
            templateUpdated = true;
            totalImagesProcessed++;
            console.log(`✅ Converted image element for template: ${template.name}`);
          } catch (err) {
            console.error(`❌ Failed to convert image element for template ${template.id}:`, err.message);
          }
        }
      }
      
      // Update template in database if changes were made
      if (templateUpdated) {
        await runQuery(
          'UPDATE canvas_templates SET config = $1, elements = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [JSON.stringify(config), JSON.stringify(elements), template.id]
        );
        migratedCount++;
        console.log(`📝 Updated template: ${template.name}`);
      }
    }
    
    console.log(`🎉 Migration completed: ${migratedCount} templates updated, ${totalImagesProcessed} images converted`);
    
    res.json({
      success: true,
      message: 'Image migration completed successfully',
      templatesUpdated: migratedCount,
      imagesProcessed: totalImagesProcessed
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({ 
      success: false,
      error: 'Migration failed', 
      details: error.message 
    });
  }
});

// Helper function to convert base64 to file
async function convertBase64ToFile(base64Data, prefix = 'image') {
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  // Extract image format and data
  const matches = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid base64 image format');
  }
  
  const [, format, imageData] = matches;
  const buffer = Buffer.from(imageData, 'base64');
  
  // Generate unique filename
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const filename = `${prefix}_${timestamp}_${random}.${format}`;
  
  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.default.existsSync(uploadsDir)) {
    fs.default.mkdirSync(uploadsDir, { recursive: true });
  }
  
  // Save file
  const filePath = path.join(uploadsDir, filename);
  fs.default.writeFileSync(filePath, buffer);
  
  // Return URL with BASE_URL placeholder
  return `BASE_URL/uploads/${filename}`;
}

export { router as canvasRoutes };