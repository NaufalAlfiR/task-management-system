/**
 * Day 5: Security Configuration
 * Production-ready security implementation for the Task Management System
 */

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

/**
 * Security Configuration Manager
 */
class SecurityConfig {
    constructor(config = {}) {
        this.config = {
            // Rate limiting
            rateLimitWindow: config.rateLimitWindow || 15 * 60 * 1000, // 15 minutes
            rateLimitMax: config.rateLimitMax || 100, // requests per window
            
            // CORS
            corsOrigins: config.corsOrigins || ['http://localhost:3000'],
            
            // Session security
            sessionSecret: config.sessionSecret || this.generateSecureSecret(),
            sessionMaxAge: config.sessionMaxAge || 24 * 60 * 60 * 1000, // 24 hours
            
            // Content Security Policy
            cspDirectives: config.cspDirectives || this.getDefaultCSPDirectives(),
            
            // Security headers
            securityHeaders: config.securityHeaders || this.getDefaultSecurityHeaders(),
            
            // Input validation
            maxRequestSize: config.maxRequestSize || '10mb',
            maxParameterLimit: config.maxParameterLimit || 1000,
            
            // Authentication
            bcryptRounds: config.bcryptRounds || 12,
            jwtSecret: config.jwtSecret || this.generateSecureSecret(),
            jwtExpiresIn: config.jwtExpiresIn || '24h',
            
            // API security
            apiKeyLength: config.apiKeyLength || 32,
            
            ...config
        };
        
        this.validateConfig();
    }

    /**
     * Generate a cryptographically secure secret
     */
    generateSecureSecret(length = 64) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Get default Content Security Policy directives
     */
    getDefaultCSPDirectives() {
        return {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: []
        };
    }

    /**
     * Get default security headers
     */
    getDefaultSecurityHeaders() {
        return {
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Resource-Policy': 'same-origin'
        };
    }

    /**
     * Validate security configuration
     */
    validateConfig() {
        const errors = [];

        // Validate session secret
        if (!this.config.sessionSecret || this.config.sessionSecret.length < 32) {
            errors.push('Session secret must be at least 32 characters long');
        }

        // Validate JWT secret
        if (!this.config.jwtSecret || this.config.jwtSecret.length < 32) {
            errors.push('JWT secret must be at least 32 characters long');
        }

        // Validate CORS origins
        if (!Array.isArray(this.config.corsOrigins) || this.config.corsOrigins.length === 0) {
            errors.push('CORS origins must be a non-empty array');
        }

        // Validate rate limiting
        if (this.config.rateLimitMax < 1) {
            errors.push('Rate limit max must be positive');
        }

        if (errors.length > 0) {
            throw new Error('Security configuration validation failed:\n' + errors.join('\n'));
        }
    }

    /**
     * Create rate limiting middleware
     */
    createRateLimiter(options = {}) {
        return rateLimit({
            windowMs: options.windowMs || this.config.rateLimitWindow,
            max: options.max || this.config.rateLimitMax,
            message: options.message || {
                error: 'Too many requests from this IP, please try again later.',
                retryAfter: Math.ceil(this.config.rateLimitWindow / 1000)
            },
            standardHeaders: true,
            legacyHeaders: false,
            skip: options.skip || ((req) => {
                // Skip rate limiting for health checks
                return req.path === '/health' || req.path === '/metrics';
            }),
            keyGenerator: options.keyGenerator || ((req) => {
                // Use IP address and user agent for more accurate limiting
                return `${req.ip}-${crypto.createHash('md5').update(req.get('User-Agent') || '').digest('hex')}`;
            }),
            onLimitReached: (req, res, options) => {
                console.warn(`Rate limit exceeded for ${req.ip} on ${req.path}`);
            }
        });
    }

    /**
     * Create strict rate limiter for sensitive endpoints
     */
    createStrictRateLimiter() {
        return this.createRateLimiter({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 5, // 5 requests per window
            message: {
                error: 'Too many attempts, please try again later.',
                retryAfter: 900 // 15 minutes
            }
        });
    }

    /**
     * Create helmet configuration
     */
    createHelmetConfig() {
        return helmet({
            contentSecurityPolicy: {
                directives: this.config.cspDirectives,
                reportOnly: false
            },
            crossOriginEmbedderPolicy: { policy: 'require-corp' },
            crossOriginOpenerPolicy: { policy: 'same-origin' },
            crossOriginResourcePolicy: { policy: 'same-origin' },
            dnsPrefetchControl: { allow: false },
            frameguard: { action: 'deny' },
            hidePoweredBy: true,
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            },
            ieNoOpen: true,
            noSniff: true,
            originAgentCluster: true,
            permittedCrossDomainPolicies: false,
            referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
            xssFilter: true
        });
    }

    /**
     * Create CORS configuration
     */
    createCorsConfig() {
        return {
            origin: (origin, callback) => {
                // Allow requests with no origin (mobile apps, etc.)
                if (!origin) return callback(null, true);
                
                if (this.config.corsOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            optionsSuccessStatus: 200,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            exposedHeaders: ['X-Total-Count', 'X-Page-Count']
        };
    }

    /**
     * Input validation middleware
     */
    createInputValidator() {
        return (req, res, next) => {
            // Validate request size
            const contentLength = parseInt(req.get('Content-Length') || '0');
            const maxSize = parseInt(this.config.maxRequestSize.replace(/\D/g, '')) * 1024 * 1024;
            
            if (contentLength > maxSize) {
                return res.status(413).json({
                    error: 'Request entity too large',
                    maxSize: this.config.maxRequestSize
                });
            }

            // Validate parameter count
            const paramCount = Object.keys(req.query).length + Object.keys(req.body || {}).length;
            if (paramCount > this.config.maxParameterLimit) {
                return res.status(400).json({
                    error: 'Too many parameters',
                    maxParameters: this.config.maxParameterLimit
                });
            }

            // Sanitize input
            this.sanitizeInput(req.body);
            this.sanitizeInput(req.query);
            this.sanitizeInput(req.params);

            next();
        };
    }

    /**
     * Sanitize input data
     */
    sanitizeInput(obj) {
        if (!obj || typeof obj !== 'object') return;

        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                // Remove potentially dangerous characters
                obj[key] = obj[key]
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/javascript:/gi, '')
                    .replace(/on\w+\s*=/gi, '')
                    .trim();
            } else if (typeof obj[key] === 'object') {
                this.sanitizeInput(obj[key]);
            }
        }
    }

    /**
     * Create security headers middleware
     */
    createSecurityHeadersMiddleware() {
        return (req, res, next) => {
            // Set custom security headers
            Object.entries(this.config.securityHeaders).forEach(([header, value]) => {
                res.setHeader(header, value);
            });

            // Set cache control headers
            if (req.path.startsWith('/static/') || req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            } else {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }

            next();
        };
    }

    /**
     * Create API key validation middleware
     */
    createApiKeyValidator(validApiKeys = []) {
        return (req, res, next) => {
            const apiKey = req.get('X-API-Key') || req.query.apiKey;

            if (!apiKey) {
                return res.status(401).json({
                    error: 'API key required',
                    message: 'Please provide a valid API key in X-API-Key header or apiKey query parameter'
                });
            }

            if (!validApiKeys.includes(apiKey)) {
                return res.status(403).json({
                    error: 'Invalid API key',
                    message: 'The provided API key is not valid'
                });
            }

            next();
        };
    }

    /**
     * Generate a new API key
     */
    generateApiKey() {
        return crypto.randomBytes(this.config.apiKeyLength).toString('hex');
    }

    /**
     * Create request logging middleware
     */
    createRequestLogger() {
        return (req, res, next) => {
            const start = Date.now();
            const originalSend = res.send;

            res.send = function(data) {
                const duration = Date.now() - start;
                
                // Log request details
                console.log(JSON.stringify({
                    timestamp: new Date().toISOString(),
                    method: req.method,
                    url: req.url,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    statusCode: res.statusCode,
                    duration: duration,
                    contentLength: res.get('Content-Length') || 0
                }));

                originalSend.call(this, data);
            };

            next();
        };
    }

    /**
     * Create error handling middleware
     */
    createErrorHandler() {
        return (err, req, res, next) => {
            // Log error
            console.error('Security Error:', {
                timestamp: new Date().toISOString(),
                error: err.message,
                stack: err.stack,
                url: req.url,
                method: req.method,
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });

            // Don't leak error details in production
            const isDevelopment = process.env.NODE_ENV === 'development';
            
            if (err.name === 'ValidationError') {
                return res.status(400).json({
                    error: 'Validation Error',
                    message: isDevelopment ? err.message : 'Invalid input data'
                });
            }

            if (err.name === 'UnauthorizedError') {
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Authentication required'
                });
            }

            if (err.name === 'ForbiddenError') {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Access denied'
                });
            }

            // Generic error response
            res.status(err.status || 500).json({
                error: err.name || 'Internal Server Error',
                message: isDevelopment ? err.message : 'Something went wrong',
                ...(isDevelopment && { stack: err.stack })
            });
        };
    }

    /**
     * Get all security middleware
     */
    getAllMiddleware() {
        return {
            helmet: this.createHelmetConfig(),
            rateLimiter: this.createRateLimiter(),
            strictRateLimiter: this.createStrictRateLimiter(),
            corsConfig: this.createCorsConfig(),
            inputValidator: this.createInputValidator(),
            securityHeaders: this.createSecurityHeadersMiddleware(),
            requestLogger: this.createRequestLogger(),
            errorHandler: this.createErrorHandler()
        };
    }

    /**
     * Get configuration summary
     */
    getConfigSummary() {
        return {
            rateLimitWindow: this.config.rateLimitWindow,
            rateLimitMax: this.config.rateLimitMax,
            corsOrigins: this.config.corsOrigins,
            maxRequestSize: this.config.maxRequestSize,
            maxParameterLimit: this.config.maxParameterLimit,
            bcryptRounds: this.config.bcryptRounds,
            jwtExpiresIn: this.config.jwtExpiresIn,
            apiKeyLength: this.config.apiKeyLength
        };
    }
}

/**
 * Security utilities
 */
class SecurityUtils {
    /**
     * Hash password using bcrypt
     */
    static async hashPassword(password, rounds = 12) {
        const bcrypt = require('bcrypt');
        return await bcrypt.hash(password, rounds);
    }

    /**
     * Verify password using bcrypt
     */
    static async verifyPassword(password, hash) {
        const bcrypt = require('bcrypt');
        return await bcrypt.compare(password, hash);
    }

    /**
     * Generate JWT token
     */
    static generateJWT(payload, secret, options = {}) {
        const jwt = require('jsonwebtoken');
        return jwt.sign(payload, secret, {
            expiresIn: options.expiresIn || '24h',
            issuer: options.issuer || 'task-manager',
            audience: options.audience || 'task-manager-users',
            ...options
        });
    }

    /**
     * Verify JWT token
     */
    static verifyJWT(token, secret, options = {}) {
        const jwt = require('jsonwebtoken');
        return jwt.verify(token, secret, {
            issuer: options.issuer || 'task-manager',
            audience: options.audience || 'task-manager-users',
            ...options
        });
    }

    /**
     * Generate secure random string
     */
    static generateSecureRandom(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Create HMAC signature
     */
    static createHMAC(data, secret, algorithm = 'sha256') {
        return crypto.createHmac(algorithm, secret).update(data).digest('hex');
    }

    /**
     * Verify HMAC signature
     */
    static verifyHMAC(data, signature, secret, algorithm = 'sha256') {
        const expectedSignature = this.createHMAC(data, secret, algorithm);
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    }

    /**
     * Sanitize filename
     */
    static sanitizeFilename(filename) {
        return filename
            .replace(/[^a-zA-Z0-9.-]/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_+|_+$/g, '')
            .substring(0, 255);
    }

    /**
     * Validate email format
     */
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) && email.length <= 254;
    }

    /**
     * Validate password strength
     */
    static validatePasswordStrength(password) {
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        const score = [
            password.length >= minLength,
            hasUpperCase,
            hasLowerCase,
            hasNumbers,
            hasSpecialChar
        ].filter(Boolean).length;

        return {
            isValid: score >= 4,
            score: score,
            requirements: {
                minLength: password.length >= minLength,
                hasUpperCase,
                hasLowerCase,
                hasNumbers,
                hasSpecialChar
            }
        };
    }
}

module.exports = {
    SecurityConfig,
    SecurityUtils
};