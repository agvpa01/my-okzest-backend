import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getQuery, getAllQuery } from '../database/init.js';
import { generateCanvasImage } from '../services/imageGenerator.js';

const router = express.Router();

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
      'INSERT INTO categories (id, name, color) VALUES (?, ?, ?)',
      [categoryId, name, color]
    );

    const category = await getQuery(
      'SELECT * FROM categories WHERE id = ?',
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
      'SELECT id FROM categories WHERE id = ?',
      [id]
    );
    
    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    await runQuery(
      'UPDATE categories SET name = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, color, id]
    );

    const category = await getQuery(
      'SELECT * FROM categories WHERE id = ?',
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
      'DELETE FROM categories WHERE id = ?',
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
      'INSERT INTO canvas_templates (id, name, config, elements, category_id) VALUES (?, ?, ?, ?, ?)',
      [templateId, name, JSON.stringify(config), JSON.stringify(elements), categoryId || null]
    );

    // Extract and save variables
    const variablePromises = elements.map(element => {
      return runQuery(
        'INSERT INTO canvas_variables (template_id, variable_name, element_id, element_type, default_value) VALUES (?, ?, ?, ?, ?)',
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
    
    // Parse config and elements for each template
    const parsedTemplates = templates.map(template => ({
      ...template,
      config: JSON.parse(template.config),
      elements: JSON.parse(template.elements),
      category: template.category_id ? {
        id: template.category_id,
        name: template.category_name,
        color: template.category_color
      } : null
    }));
    
    res.json({ templates: parsedTemplates });
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
      'SELECT * FROM canvas_templates WHERE id = ?',
      [id]
    );
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const variables = await getAllQuery(
      'SELECT variable_name, element_type, default_value FROM canvas_variables WHERE template_id = ?',
      [id]
    );

    res.json({
      ...template,
      config: JSON.parse(template.config),
      elements: JSON.parse(template.elements),
      variables
    });
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
      'SELECT id FROM canvas_templates WHERE id = ?',
      [id]
    );
    
    if (!existingTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Update template
    await runQuery(
      'UPDATE canvas_templates SET name = ?, config = ?, elements = ?, category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, JSON.stringify(config), JSON.stringify(elements), categoryId || null, id]
    );

    // Delete old variables and insert new ones
    await runQuery('DELETE FROM canvas_variables WHERE template_id = ?', [id]);
    
    const variablePromises = elements.map(element => {
      return runQuery(
        'INSERT INTO canvas_variables (template_id, variable_name, element_id, element_type, default_value) VALUES (?, ?, ?, ?, ?)',
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
      'DELETE FROM canvas_templates WHERE id = ?',
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
      'SELECT config, elements FROM canvas_templates WHERE id = ?',
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
      'SELECT variable_name, element_type, default_value FROM canvas_variables WHERE template_id = ? ORDER BY variable_name',
      [id]
    );

    res.json({ variables });
  } catch (error) {
    console.error('Error fetching variables:', error);
    res.status(500).json({ error: 'Failed to fetch variables' });
  }
});

export { router as canvasRoutes };