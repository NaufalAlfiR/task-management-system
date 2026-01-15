/**
 * Day 5: Production Configuration
 * Configuration management for production deployment
 */

/**
 * Environment Configuration Manager
 */
class ConfigManager {
    constructor() {
        this.environment = process.env.NODE_ENV || 'development';
        this.config = this.loadConfig();
    }

    loadConfig() {
        const baseConfig = {
            app: {
                name: 'Task Management System',
                version: process.env.npm_package_version || '1.0.0',
                port: parseInt(process.env.PORT) || 3000,
                host: process.env.HOST || 'localhost'
            },
            database: {
                type: 'localStorage', // For this simple app
                maxSize: 10 * 1024 * 1024, // 10MB
                backupInterval: 24 * 60 * 60 * 1000 // 24 hours
            },
            security: {
                corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
                rateLimitWindow: 15 * 60 * 1000, // 15 minutes
                rateLimitMax: 100, // requests per window
                sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
                bcryptRounds: 12
            },
            logging: {
                level: 'info',
                format: 'combined',
                maxFiles: 5,
                maxSize: '10m'
            },
            monitoring: {
                enabled: true,
                healthCheckPath: '/health',
                metricsPath: '/metrics'
            },
            performance: {
                compressionEnabled: true,
                cacheMaxAge: 86400, // 1 day in seconds
                staticCacheMaxAge: 31536000 // 1 year in seconds
            }
        };

        // Environment-specific overrides
        const envConfigs = {
            development: {
                logging: {
                    level: 'debug',
                    format: 'dev'
                },
                security: {
                    corsOrigins: ['http://localhost:3000', 'http://localhost:8080'],
                    rateLimitMax: 1000 // More lenient for development
                },
                performance: {
                    cacheMaxAge: 0 // No caching in development
                }
            },
            test: {
                app: {
                    port: 0 // Random port for testing
                },
                logging: {
                    level: 'error' // Minimal logging during tests
                },
                database: {
                    type: 'memory'
                },
                security: {
                    rateLimitMax: 10000 // No rate limiting in tests
                }
            },
            production: {
                logging: {
                    level: 'warn',
                    format: 'combined'
                },
                security: {
                    corsOrigins: process.env.CORS_ORIGINS?.split(',') || [],
                    rateLimitMax: 50 // Stricter rate limiting
                },
                monitoring: {
                    enabled: true,
                    alerting: true
                }
            }
        };

        return this.mergeConfigs(baseConfig, envConfigs[this.environment] || {});
    }

    mergeConfigs(base, override) {
        const result = { ...base };
        
        for (const key in override) {
            if (typeof override[key] === 'object' && !Array.isArray(override[key])) {
                result[key] = this.mergeConfigs(base[key] || {}, override[key]);
            } else {
                result[key] = override[key];
            }
        }
        
        return result;
    }

    get(path) {
        return path.split('.').reduce((obj, key) => obj?.[key], this.config);
    }

    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((obj, key) => {
            if (!obj[key]) obj[key] = {};
            return obj[key];
        }, this.config);
        
        target[lastKey] = value;
    }

    isProduction() {
        return this.environment === 'production';
    }

    isDevelopment() {
        return this.environment === 'development';
    }

    isTest() {
        return this.environment === 'test';
    }

    validate() {
        const errors = [];

        // Validate required production settings
        if (this.isProduction()) {
            if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'dev-secret-change-in-production') {
                errors.push('SESSION_SECRET must be set in production');
            }

            if (this.get('security.corsOrigins').length === 0) {
                errors.push('CORS_ORIGINS must be configured in production');
            }

            if (!process.env.PORT) {
                console.warn('PORT not set, using default 3000');
            }
        }

        // Validate port range
        const port = this.get('app.port');
        if (port < 1 || port > 65535) {
            errors.push(`Invalid port number: ${port}`);
        }

        // Validate rate limit settings
        const rateLimitMax = this.get('security.rateLimitMax');
        if (rateLimitMax < 1) {
            errors.push('Rate limit max must be positive');
        }

        if (errors.length > 0) {
            throw new Error('Configuration validation failed:\n' + errors.join('\n'));
        }

        return true;
    }

    getAll() {
        return { ...this.config };
    }
}

/**
 * Production Server Configuration
 */
class ProductionServer {
    constructor(app, config) {
        this.app = app;
        this.config = config;
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    setupMiddleware() {
        const express = require('express');
        const compression = require('compression');
        const helmet = require('helmet');
        const cors = require('cors');
        const rateLimit = require('express-rate-limit');

        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"]
                }
            },
            crossOriginEmbedderPolicy: false
        }));

        // CORS configuration
        this.app.use(cors({
            origin: this.config.get('security.corsOrigins'),
            credentials: true,
            optionsSuccessStatus: 200
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: this.config.get('security.rateLimitWindow'),
            max: this.config.get('security.rateLimitMax'),
            message: {
                error: 'Too many requests from this IP, please try again later.'
            },
            standardHeaders: true,
            legacyHeaders: false
        });
        this.app.use(limiter);

        // Compression
        if (this.config.get('performance.compressionEnabled')) {
            this.app.use(compression());
        }

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Static file serving with caching
        this.app.use(express.static('public', {
            maxAge: this.config.get('performance.staticCacheMaxAge') * 1000,
            etag: true,
            lastModified: true
        }));

        // Request logging
        if (this.config.get('logging.enabled')) {
            const morgan = require('morgan');
            this.app.use(morgan(this.config.get('logging.format')));
        }
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get(this.config.get('monitoring.healthCheckPath'), (req, res) => {
            const healthCheck = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                environment: this.config.environment,
                version: this.config.get('app.version'),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            };

            res.status(200).json(healthCheck);
        });

        // Metrics endpoint (basic)
        if (this.config.get('monitoring.enabled')) {
            this.app.get(this.config.get('monitoring.metricsPath'), (req, res) => {
                const metrics = {
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage(),
                    environment: this.config.environment,
                    version: this.config.get('app.version')
                };

                res.status(200).json(metrics);
            });
        }

        // API routes would go here
        this.app.use('/api', this.createApiRouter());

        // SPA fallback - serve index.html for all non-API routes
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
    }

    createApiRouter() {
        const router = require('express').Router();

        // API versioning
        router.use('/v1', this.createV1Router());

        // API documentation
        router.get('/', (req, res) => {
            res.json({
                name: this.config.get('app.name'),
                version: this.config.get('app.version'),
                environment: this.config.environment,
                endpoints: {
                    health: this.config.get('monitoring.healthCheckPath'),
                    metrics: this.config.get('monitoring.metricsPath'),
                    api: '/api/v1'
                }
            });
        });

        return router;
    }

    createV1Router() {
        const router = require('express').Router();

        // Tasks API endpoints would go here
        router.get('/tasks', (req, res) => {
            // This would integrate with your task management logic
            res.json({ message: 'Tasks API endpoint' });
        });

        router.post('/tasks', (req, res) => {
            // Task creation endpoint
            res.json({ message: 'Task creation endpoint' });
        });

        return router;
    }

    setupErrorHandling() {
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: 'The requested resource was not found',
                path: req.path
            });
        });

        // Global error handler
        this.app.use((err, req, res, next) => {
            console.error('Unhandled error:', err);

            // Don't leak error details in production
            const isDev = this.config.isDevelopment();
            
            res.status(err.status || 500).json({
                error: err.name || 'Internal Server Error',
                message: isDev ? err.message : 'Something went wrong',
                ...(isDev && { stack: err.stack })
            });
        });

        // Graceful shutdown handling
        process.on('SIGTERM', () => {
            console.log('SIGTERM received, shutting down gracefully');
            this.shutdown();
        });

        process.on('SIGINT', () => {
            console.log('SIGINT received, shutting down gracefully');
            this.shutdown();
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (err) => {
            console.error('Uncaught Exception:', err);
            this.shutdown(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            this.shutdown(1);
        });
    }

    start() {
        const port = this.config.get('app.port');
        const host = this.config.get('app.host');

        this.server = this.app.listen(port, host, () => {
            console.log(`🚀 ${this.config.get('app.name')} v${this.config.get('app.version')}`);
            console.log(`📡 Server running on http://${host}:${port}`);
            console.log(`🌍 Environment: ${this.config.environment}`);
            console.log(`💚 Health check: http://${host}:${port}${this.config.get('monitoring.healthCheckPath')}`);
        });

        return this.server;
    }

    shutdown(exitCode = 0) {
        if (this.server) {
            this.server.close(() => {
                console.log('Server closed');
                process.exit(exitCode);
            });

            // Force close after 10 seconds
            setTimeout(() => {
                console.log('Forcing server close');
                process.exit(exitCode);
            }, 10000);
        } else {
            process.exit(exitCode);
        }
    }
}

/**
 * Performance Monitor
 */
class PerformanceMonitor {
    constructor(config) {
        this.config = config;
        this.metrics = {
            requests: 0,
            errors: 0,
            responseTime: [],
            memory: [],
            cpu: []
        };
        
        if (config.get('monitoring.enabled')) {
            this.startMonitoring();
        }
    }

    startMonitoring() {
        // Collect metrics every minute
        setInterval(() => {
            this.collectMetrics();
        }, 60000);

        // Clean old metrics every hour
        setInterval(() => {
            this.cleanOldMetrics();
        }, 3600000);
    }

    collectMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        this.metrics.memory.push({
            timestamp: Date.now(),
            rss: memUsage.rss,
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external
        });

        this.metrics.cpu.push({
            timestamp: Date.now(),
            user: cpuUsage.user,
            system: cpuUsage.system
        });
    }

    cleanOldMetrics() {
        const oneHourAgo = Date.now() - 3600000;
        
        this.metrics.memory = this.metrics.memory.filter(m => m.timestamp > oneHourAgo);
        this.metrics.cpu = this.metrics.cpu.filter(c => c.timestamp > oneHourAgo);
        this.metrics.responseTime = this.metrics.responseTime.filter(r => r.timestamp > oneHourAgo);
    }

    recordRequest(responseTime) {
        this.metrics.requests++;
        this.metrics.responseTime.push({
            timestamp: Date.now(),
            time: responseTime
        });
    }

    recordError() {
        this.metrics.errors++;
    }

    getMetrics() {
        const now = Date.now();
        const oneHourAgo = now - 3600000;

        const recentResponseTimes = this.metrics.responseTime
            .filter(r => r.timestamp > oneHourAgo)
            .map(r => r.time);

        return {
            requests: this.metrics.requests,
            errors: this.metrics.errors,
            errorRate: this.metrics.requests > 0 ? this.metrics.errors / this.metrics.requests : 0,
            averageResponseTime: recentResponseTimes.length > 0 
                ? recentResponseTimes.reduce((a, b) => a + b, 0) / recentResponseTimes.length 
                : 0,
            memoryUsage: this.metrics.memory.slice(-1)[0] || null,
            cpuUsage: this.metrics.cpu.slice(-1)[0] || null,
            uptime: process.uptime()
        };
    }
}

// Export configuration and server classes
module.exports = {
    ConfigManager,
    ProductionServer,
    PerformanceMonitor
};

// Example usage:
/*
const express = require('express');
const { ConfigManager, ProductionServer, PerformanceMonitor } = require('./production-config');

// Initialize configuration
const config = new ConfigManager();
config.validate();

// Create Express app
const app = express();

// Initialize performance monitoring
const monitor = new PerformanceMonitor(config);

// Create production server
const server = new ProductionServer(app, config);

// Start the server
server.start();

console.log('Production server started with configuration:', config.getAll());
*/