import express from 'express';
import { schedulerService } from '../services/schedulerService.js';
import { getAllQuery } from '../database/init.js';

const router = express.Router();

// Get all template groups
router.get('/groups', async (req, res) => {
  try {
    const groups = await schedulerService.getTemplateGroups();
    res.json({ groups });
  } catch (error) {
    console.error('Error fetching template groups:', error);
    res.status(500).json({ error: 'Failed to fetch template groups' });
  }
});

// Create a new template group
router.post('/groups', async (req, res) => {
  try {
    const { name, description, templateIds } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    const group = await schedulerService.createTemplateGroup(
      name.trim(),
      description || '',
      templateIds || []
    );
    
    res.json({ group, message: 'Template group created successfully' });
  } catch (error) {
    console.error('Error creating template group:', error);
    res.status(500).json({ error: 'Failed to create template group' });
  }
});

// Update a template group
router.put('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, templateIds } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    await schedulerService.updateTemplateGroup(
      id,
      name.trim(),
      description || '',
      templateIds || []
    );
    
    res.json({ message: 'Template group updated successfully' });
  } catch (error) {
    console.error('Error updating template group:', error);
    res.status(500).json({ error: 'Failed to update template group' });
  }
});

// Delete a template group
router.delete('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await schedulerService.deleteTemplateGroup(id);
    res.json({ message: 'Template group deleted successfully' });
  } catch (error) {
    console.error('Error deleting template group:', error);
    res.status(500).json({ error: 'Failed to delete template group' });
  }
});

// Get active template group
router.get('/active-group', async (req, res) => {
  try {
    const activeGroup = await schedulerService.getActiveTemplateGroup();
    res.json({ activeGroup });
  } catch (error) {
    console.error('Error fetching active template group:', error);
    res.status(500).json({ error: 'Failed to fetch active template group' });
  }
});

// Manually activate a template group
router.post('/groups/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;
    await schedulerService.activateTemplateGroup(id);
    res.json({ message: 'Template group activated successfully' });
  } catch (error) {
    console.error('Error activating template group:', error);
    res.status(500).json({ error: 'Failed to activate template group' });
  }
});

// Get schedules for a specific year
router.get('/schedules/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const yearInt = parseInt(year);
    
    if (isNaN(yearInt) || yearInt < 2020 || yearInt > 2030) {
      return res.status(400).json({ error: 'Invalid year' });
    }
    
    const schedules = await schedulerService.getSchedules(yearInt);
    res.json({ schedules });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// Create a new schedule
router.post('/schedules', async (req, res) => {
  try {
    const { groupId, year, month, day, hour, minute } = req.body;
    
    // Validate required fields
    if (!groupId || !year || !month || !day || hour === undefined || minute === undefined) {
      return res.status(400).json({ error: 'All schedule fields are required' });
    }
    
    // Validate date/time values
    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'Month must be between 1 and 12' });
    }
    
    if (day < 1 || day > 31) {
      return res.status(400).json({ error: 'Day must be between 1 and 31' });
    }
    
    if (hour < 0 || hour > 23) {
      return res.status(400).json({ error: 'Hour must be between 0 and 23' });
    }
    
    if (minute < 0 || minute > 59) {
      return res.status(400).json({ error: 'Minute must be between 0 and 59' });
    }
    
    // Check if the date is valid
    const scheduleDate = new Date(year, month - 1, day, hour, minute);
    if (scheduleDate.getFullYear() !== year || 
        scheduleDate.getMonth() !== month - 1 || 
        scheduleDate.getDate() !== day) {
      return res.status(400).json({ error: 'Invalid date' });
    }
    
    // Check if schedule already exists for this exact time
    const existingSchedules = await getAllQuery(
      'SELECT id FROM template_schedules WHERE year = $1 AND month = $2 AND day = $3 AND hour = $4 AND minute = $5',
      [year, month, day, hour, minute]
    );
    
    if (existingSchedules.length > 0) {
      return res.status(400).json({ error: 'A schedule already exists for this date and time' });
    }
    
    const schedule = await schedulerService.createSchedule(groupId, year, month, day, hour, minute);
    res.json({ schedule, message: 'Schedule created successfully' });
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// Delete a schedule
router.delete('/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await schedulerService.deleteSchedule(id);
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// Get available months for current year (only show months from current month onwards)
router.get('/available-months', async (req, res) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed
    
    const months = [];
    for (let month = currentMonth; month <= 12; month++) {
      const monthName = new Date(currentYear, month - 1, 1).toLocaleDateString('en-US', { month: 'long' });
      months.push({ value: month, label: monthName, year: currentYear });
    }
    
    res.json({ months, currentYear });
  } catch (error) {
    console.error('Error fetching available months:', error);
    res.status(500).json({ error: 'Failed to fetch available months' });
  }
});

export { router as schedulerRoutes };