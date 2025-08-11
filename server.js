import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { canvasRoutes } from './routes/canvas.js';
import { schedulerRoutes } from './routes/scheduler.js';
import { initDatabase, checkDatabaseAvailability } from './database/init.js';
import { schedulerService } from './services/schedulerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// Create uploads directory if it doesn't exist
const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = file.originalname.split('.').pop();
    cb(null, `image-${uniqueSuffix}.${extension}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files (generated images)
app.use('/images', express.static(join(__dirname, 'generated')));

// Serve uploaded images
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// Image upload endpoint
app.post('/api/upload-image', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    res.json({ 
      success: true, 
      url: imageUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Routes
app.use('/api/canvas', canvasRoutes);
app.use('/api/scheduler', schedulerRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  const dbAvailable = checkDatabaseAvailability();
  res.json({ 
    status: 'OK', 
    message: 'Dynamic Canvas Backend is running',
    database: {
      available: dbAvailable,
      status: dbAvailable ? 'Connected' : 'Offline Mode'
    },
    features: {
      imageGeneration: true,
      dataStorage: dbAvailable ? 'PostgreSQL' : 'In-Memory (Session Only)'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: err.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown handler
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  schedulerService.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  schedulerService.stop();
  process.exit(0);
});

// Initialize database and start server
initDatabase()
  .then(() => {
    console.log('🎯 Database initialization completed');
  })
  .catch((error) => {
    console.error('⚠️  Database initialization failed, continuing in offline mode:', error.message);
  })
  .finally(() => {
    // Start server regardless of database status
    app.listen(PORT, () => {
      console.log(`🚀 Dynamic Canvas Backend running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🎨 Canvas API: http://localhost:${PORT}/api/canvas`);
      console.log(`📅 Scheduler API: http://localhost:${PORT}/api/scheduler`);
      console.log(`💡 Note: Some features may be limited if database is unavailable`);
    });
  });