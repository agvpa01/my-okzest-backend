import { CronJob } from 'cron';
import { getAllQuery, runQuery, getQuery } from '../database/init.js';
import { v4 as uuidv4 } from 'uuid';

class SchedulerService {
  constructor() {
    this.cronJob = null;
    this.initializeCronJob();
  }

  initializeCronJob() {
    // Run every minute to check for scheduled activations
    this.cronJob = new CronJob(
      '* * * * *', // Every minute
      this.checkScheduledActivations.bind(this),
      null,
      true, // Start immediately
      null // Use system timezone
    );
    
    console.log('📅 Scheduler service initialized - checking every minute');
    console.log('🕐 Current server time:', new Date().toLocaleString());
  }

  async checkScheduledActivations() {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed
      const currentDay = now.getDate();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      console.log(`🔍 Checking schedules at: ${currentYear}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')} ${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`);

      // Find schedules that should be executed now or are overdue
      const schedulesToExecute = await getAllQuery(`
        SELECT ts.*, tg.name as group_name
        FROM template_schedules ts
        JOIN template_groups tg ON ts.group_id = tg.id
        WHERE ts.is_executed = FALSE
          AND (
            (ts.year < $1) OR
            (ts.year = $1 AND ts.month < $2) OR
            (ts.year = $1 AND ts.month = $2 AND ts.day < $3) OR
            (ts.year = $1 AND ts.month = $2 AND ts.day = $3 AND ts.hour < $4) OR
            (ts.year = $1 AND ts.month = $2 AND ts.day = $3 AND ts.hour = $4 AND ts.minute <= $5)
          )
        ORDER BY ts.year, ts.month, ts.day, ts.hour, ts.minute
      `, [currentYear, currentMonth, currentDay, currentHour, currentMinute]);

      if (schedulesToExecute.length > 0) {
        console.log(`📋 Found ${schedulesToExecute.length} schedule(s) to execute`);
        for (const schedule of schedulesToExecute) {
          await this.executeSchedule(schedule);
        }
      }
    } catch (error) {
      console.error('❌ Error checking scheduled activations:', error);
    }
  }

  async executeSchedule(schedule) {
    try {
      console.log(`🎯 Executing schedule for group: ${schedule.group_name}`);
      
      // Deactivate all currently active groups
      await runQuery('UPDATE template_groups SET is_active = FALSE WHERE is_active = TRUE');
      
      // Activate the scheduled group
      await runQuery('UPDATE template_groups SET is_active = TRUE WHERE id = $1', [schedule.group_id]);
      
      // Mark schedule as executed
      await runQuery(
        'UPDATE template_schedules SET is_executed = TRUE, executed_at = CURRENT_TIMESTAMP WHERE id = $1',
        [schedule.id]
      );
      
      console.log(`✅ Successfully activated template group: ${schedule.group_name}`);
    } catch (error) {
      console.error(`❌ Error executing schedule for group ${schedule.group_name}:`, error);
    }
  }

  // API Methods
  async createTemplateGroup(name, description, templateIds = []) {
    try {
      const groupId = uuidv4();
      
      // Create the group
      await runQuery(
        'INSERT INTO template_groups (id, name, description) VALUES ($1, $2, $3)',
        [groupId, name, description]
      );
      
      // Add templates to the group
      for (const templateId of templateIds) {
        await runQuery(
          'INSERT INTO template_group_members (group_id, template_id) VALUES ($1, $2)',
          [groupId, templateId]
        );
      }
      
      return { id: groupId, name, description, is_active: false };
    } catch (error) {
      console.error('Error creating template group:', error);
      throw error;
    }
  }

  async getTemplateGroups() {
    try {
      const groups = await getAllQuery(`
        SELECT tg.*, 
               COUNT(tgm.template_id) as template_count,
               ARRAY_AGG(tgm.template_id) FILTER (WHERE tgm.template_id IS NOT NULL) as template_ids
        FROM template_groups tg
        LEFT JOIN template_group_members tgm ON tg.id = tgm.group_id
        GROUP BY tg.id, tg.name, tg.description, tg.is_active, tg.created_at, tg.updated_at
        ORDER BY tg.created_at DESC
      `);
      
      return groups.map(group => ({
        ...group,
        template_ids: group.template_ids || []
      }));
    } catch (error) {
      console.error('Error fetching template groups:', error);
      throw error;
    }
  }

  async getActiveTemplateGroup() {
    try {
      const activeGroup = await getQuery(`
        SELECT tg.*, 
               ARRAY_AGG(ct.id) FILTER (WHERE ct.id IS NOT NULL) as template_ids,
               ARRAY_AGG(ct.name) FILTER (WHERE ct.name IS NOT NULL) as template_names
        FROM template_groups tg
        LEFT JOIN template_group_members tgm ON tg.id = tgm.group_id
        LEFT JOIN canvas_templates ct ON tgm.template_id = ct.id
        WHERE tg.is_active = TRUE
        GROUP BY tg.id, tg.name, tg.description, tg.is_active, tg.created_at, tg.updated_at
      `);
      
      if (!activeGroup) {
        return null;
      }
      
      const templateIds = activeGroup.template_ids || [];
      const templateNames = activeGroup.template_names || [];
      
      // Build templates array with variables
      const templates = [];
      for (let i = 0; i < templateIds.length; i++) {
        const templateId = templateIds[i];
        const templateName = templateNames[i];
        
        // Get variables for this template
        const variables = await getAllQuery(`
          SELECT variable_name
          FROM canvas_variables
          WHERE template_id = $1
          ORDER BY variable_name
        `, [templateId]);
        
        // Build backend render URL with variables
         let templateUrl = `http://localhost:3002/api/canvas/render/${templateId}`;
         if (variables.length > 0) {
           const variableParams = variables.map(v => `${v.variable_name}=REPLACE_ME`).join('&');
           templateUrl += `?${variableParams}`;
         }
        
        templates.push({
          template_id: templateId,
          template_name: templateName,
          template_url: templateUrl
        });
      }
      
      // Remove template_names from the response
       const { template_names, ...groupWithoutTemplateNames } = activeGroup;
       
       return {
         ...groupWithoutTemplateNames,
         templates: templates
       };
    } catch (error) {
      console.error('Error fetching active template group:', error);
      throw error;
    }
  }

  async updateTemplateGroup(groupId, name, description, templateIds) {
    try {
      // Update group info
      await runQuery(
        'UPDATE template_groups SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [name, description, groupId]
      );
      
      // Remove existing template associations
      await runQuery('DELETE FROM template_group_members WHERE group_id = $1', [groupId]);
      
      // Add new template associations
      for (const templateId of templateIds) {
        await runQuery(
          'INSERT INTO template_group_members (group_id, template_id) VALUES ($1, $2)',
          [groupId, templateId]
        );
      }
      
      return true;
    } catch (error) {
      console.error('Error updating template group:', error);
      throw error;
    }
  }

  async deleteTemplateGroup(groupId) {
    try {
      await runQuery('DELETE FROM template_groups WHERE id = $1', [groupId]);
      return true;
    } catch (error) {
      console.error('Error deleting template group:', error);
      throw error;
    }
  }

  async createSchedule(groupId, year, month, day, hour, minute) {
    try {
      const scheduleId = uuidv4();
      
      await runQuery(
        'INSERT INTO template_schedules (id, group_id, year, month, day, hour, minute) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [scheduleId, groupId, year, month, day, hour, minute]
      );
      
      return { id: scheduleId, group_id: groupId, year, month, day, hour, minute };
    } catch (error) {
      console.error('Error creating schedule:', error);
      throw error;
    }
  }

  async getSchedules(year) {
    try {
      const schedules = await getAllQuery(`
        SELECT ts.*, tg.name as group_name
        FROM template_schedules ts
        JOIN template_groups tg ON ts.group_id = tg.id
        WHERE ts.year = $1
        ORDER BY ts.month, ts.day, ts.hour, ts.minute
      `, [year]);
      
      return schedules;
    } catch (error) {
      console.error('Error fetching schedules:', error);
      throw error;
    }
  }

  async deleteSchedule(scheduleId) {
    try {
      await runQuery('DELETE FROM template_schedules WHERE id = $1', [scheduleId]);
      return true;
    } catch (error) {
      console.error('Error deleting schedule:', error);
      throw error;
    }
  }

  async activateTemplateGroup(groupId) {
    try {
      // Deactivate all groups first
      await runQuery('UPDATE template_groups SET is_active = FALSE WHERE is_active = TRUE');
      
      // Activate the specified group
      await runQuery('UPDATE template_groups SET is_active = TRUE WHERE id = $1', [groupId]);
      
      return true;
    } catch (error) {
      console.error('Error activating template group:', error);
      throw error;
    }
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('📅 Scheduler service stopped');
    }
  }
}

export const schedulerService = new SchedulerService();