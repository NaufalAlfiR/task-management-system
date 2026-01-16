/**
 * Day 5: Production Server Implementation
 * Enhanced server configuration for production deployment
 */

require("dotenv").config();
const express = require("express");
const path = require("path");
const compression = require("compression");
const cors = require("cors");
const morgan = require("morgan");
const {
  ConfigManager,
  ProductionServer,
  PerformanceMonitor,
} = require("./production-config");
const { SecurityConfig, SecurityUtils } = require("./security-config");

/**
 * Production-Ready Task Management Server
 */
class TaskManagementServer {
  constructor(options = {}) {
    this.app = express();
    this.config = new ConfigManager();
    this.security = new SecurityConfig({
      corsOrigins: this.config.get("security.corsOrigins"),
      sessionSecret: this.config.get("security.sessionSecret"),
      rateLimitWindow: this.config.get("security.rateLimitWindow"),
      rateLimitMax: this.config.get("security.rateLimitMax"),
    });
    this.performanceMonitor = new PerformanceMonitor(this.config);

    // In-memory storage (replace with database in production)
    this.storage = {
      tasks: new Map(),
      users: new Map(),
      sessions: new Map(),
      apiKeys: new Set(),
    };

    this.nextTaskId = 1;
    this.nextUserId = 1;

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();

    // Initialize with sample data
    this.initializeSampleData();
  }

  /**
   * Setup middleware stack
   */
  setupMiddleware() {
    const securityMiddleware = this.security.getAllMiddleware();

    // Trust proxy (important for Heroku, etc.)
    this.app.set("trust proxy", 1);

    // Security middleware
    this.app.use(securityMiddleware.helmet);
    this.app.use(securityMiddleware.securityHeaders);

    // CORS
    // --- UPDATE MULAI DARI SINI ---
    // Logika CORS Manual (Anti-Crash)
    const allowedOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(",")
      : [];

    this.app.use(
      cors({
        origin: (origin, callback) => {
          // 1. Izinkan request tanpa origin (seperti Postman atau server-to-server)
          if (!origin) return callback(null, true);

          // 2. Cek apakah origin ada di daftar izin
          if (
            allowedOrigins.indexOf(origin) !== -1 ||
            allowedOrigins.length === 0
          ) {
            callback(null, true);
          } else {
            // 3. JANGAN CRASH! Cukup log warning, tapi tolak requestnya baik-baik
            console.warn(`Blocked by CORS: ${origin}`);
            callback(new Error("Not allowed by CORS"));
          }
        },
        credentials: true, // Izinkan cookie/session
      })
    );
    // --- UPDATE SELESAI ---

    // Rate limiting
    this.app.use("/api/", securityMiddleware.rateLimiter);
    this.app.use("/auth/", securityMiddleware.strictRateLimiter);

    // Compression
    if (this.config.get("performance.compressionEnabled")) {
      this.app.use(
        compression({
          filter: (req, res) => {
            if (req.headers["x-no-compression"]) {
              return false;
            }
            return compression.filter(req, res);
          },
          threshold: 1024, // Only compress responses > 1KB
        })
      );
    }

    // Request logging
    if (this.config.get("logging.enabled")) {
      this.app.use(
        morgan(this.config.get("logging.format"), {
          skip: (req, res) => {
            // Skip logging for health checks and metrics
            return req.path === "/health" || req.path === "/metrics";
          },
        })
      );
    }

    // Body parsing with size limits
    this.app.use(
      express.json({
        limit: this.config.get("security.maxRequestSize") || "10mb",
        verify: (req, res, buf) => {
          // Store raw body for signature verification if needed
          req.rawBody = buf;
        },
      })
    );
    this.app.use(
      express.urlencoded({
        extended: true,
        limit: this.config.get("security.maxRequestSize") || "10mb",
      })
    );

    // Input validation
    this.app.use(securityMiddleware.inputValidator);

    // Request monitoring
    this.app.use((req, res, next) => {
      const start = Date.now();

      res.on("finish", () => {
        const duration = Date.now() - start;
        this.performanceMonitor.recordRequest(duration);

        if (res.statusCode >= 400) {
          this.performanceMonitor.recordError();
        }
      });

      next();
    });

    // Static file serving with caching
    this.app.use(
      "/static",
      express.static(path.join(__dirname, "./public"), {
        maxAge: this.config.get("performance.staticCacheMaxAge") * 1000,
        etag: true,
        lastModified: true,
        immutable: true,
      })
    );

    this.app.use(
      express.static(path.join(__dirname, "../public"), {
        maxAge: this.config.get("performance.cacheMaxAge") * 1000,
        etag: true,
        lastModified: true,
      })
    );
  }

  /**
   * Setup application routes
   */
  setupRoutes() {
    // Health and monitoring endpoints
    this.setupMonitoringRoutes();

    // Authentication routes
    this.setupAuthRoutes();

    // API routes
    this.setupApiRoutes();

    // SPA fallback
    this.setupSpaFallback();
  }

  /**
   * Setup monitoring and health check routes
   */
  setupMonitoringRoutes() {
    // Enhanced health check
    this.app.get("/health", (req, res) => {
      const health = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: this.config.environment,
        version: this.config.get("app.version"),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),

        // Application-specific health checks
        storage: {
          tasks: this.storage.tasks.size,
          users: this.storage.users.size,
          sessions: this.storage.sessions.size,
        },

        // Performance metrics
        performance: this.performanceMonitor.getMetrics(),

        // Configuration summary
        config: {
          port: this.config.get("app.port"),
          rateLimitMax: this.config.get("security.rateLimitMax"),
          compressionEnabled: this.config.get("performance.compressionEnabled"),
        },
      };

      res.status(200).json(health);
    });

    // Detailed metrics endpoint
    this.app.get("/metrics", (req, res) => {
      const metrics = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        performance: this.performanceMonitor.getMetrics(),

        // System metrics
        system: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          pid: process.pid,
        },

        // Application metrics
        application: {
          environment: this.config.environment,
          version: this.config.get("app.version"),
          storage: {
            tasks: this.storage.tasks.size,
            users: this.storage.users.size,
            sessions: this.storage.sessions.size,
          },
        },
      };

      res.status(200).json(metrics);
    });

    // Readiness probe (for Kubernetes)
    this.app.get("/ready", (req, res) => {
      // Check if application is ready to serve traffic
      const isReady = this.storage && this.config;

      if (isReady) {
        res.status(200).json({ status: "ready" });
      } else {
        res.status(503).json({ status: "not ready" });
      }
    });

    // Liveness probe (for Kubernetes)
    this.app.get("/live", (req, res) => {
      // Simple liveness check
      res.status(200).json({ status: "alive" });
    });
  }

  /**
   * Setup authentication routes
   */
  setupAuthRoutes() {
    // User registration
    this.app.post("/auth/register", async (req, res) => {
      try {
        const { username, email, password } = req.body;

        // Validate input
        if (!username || !email || !password) {
          return res.status(400).json({
            error: "Missing required fields",
            required: ["username", "email", "password"],
          });
        }

        // Validate email format
        if (!SecurityUtils.isValidEmail(email)) {
          return res.status(400).json({
            error: "Invalid email format",
          });
        }

        // Validate password strength
        const passwordValidation =
          SecurityUtils.validatePasswordStrength(password);
        if (!passwordValidation.isValid) {
          return res.status(400).json({
            error: "Password does not meet requirements",
            requirements: passwordValidation.requirements,
          });
        }

        // Check if user already exists
        const existingUser = Array.from(this.storage.users.values()).find(
          (user) => user.email === email || user.username === username
        );

        if (existingUser) {
          return res.status(409).json({
            error: "User already exists",
          });
        }

        // Hash password
        const hashedPassword = await SecurityUtils.hashPassword(
          password,
          this.config.get("security.bcryptRounds")
        );

        // Create user
        const user = {
          id: this.nextUserId++,
          username,
          email,
          password: hashedPassword,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isActive: true,
        };

        this.storage.users.set(user.id, user);

        // Generate JWT token
        const token = SecurityUtils.generateJWT(
          { userId: user.id, username: user.username },
          this.config.get("security.jwtSecret"),
          { expiresIn: this.config.get("security.jwtExpiresIn") }
        );

        res.status(201).json({
          message: "User registered successfully",
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            createdAt: user.createdAt,
          },
          token,
        });
      } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({
          error: "Registration failed",
          message: "Internal server error",
        });
      }
    });

    // User login
    this.app.post("/auth/login", async (req, res) => {
      try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
          return res.status(400).json({
            error: "Email and password are required",
          });
        }

        // Find user
        const user = Array.from(this.storage.users.values()).find(
          (user) => user.email === email
        );

        if (!user) {
          return res.status(401).json({
            error: "Invalid credentials",
          });
        }

        // Verify password
        const isValidPassword = await SecurityUtils.verifyPassword(
          password,
          user.password
        );

        if (!isValidPassword) {
          return res.status(401).json({
            error: "Invalid credentials",
          });
        }

        // Check if user is active
        if (!user.isActive) {
          return res.status(403).json({
            error: "Account is deactivated",
          });
        }

        // Generate JWT token
        const token = SecurityUtils.generateJWT(
          { userId: user.id, username: user.username },
          this.config.get("security.jwtSecret"),
          { expiresIn: this.config.get("security.jwtExpiresIn") }
        );

        // Update last login
        user.lastLoginAt = new Date().toISOString();
        this.storage.users.set(user.id, user);

        res.status(200).json({
          message: "Login successful",
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            lastLoginAt: user.lastLoginAt,
          },
          token,
        });
      } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
          error: "Login failed",
          message: "Internal server error",
        });
      }
    });

    // Token validation middleware
    this.authenticateToken = (req, res, next) => {
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

      if (!token) {
        return res.status(401).json({
          error: "Access token required",
        });
      }

      try {
        const decoded = SecurityUtils.verifyJWT(
          token,
          this.config.get("security.jwtSecret")
        );
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(403).json({
          error: "Invalid or expired token",
        });
      }
    };
  }

  /**
   * Setup API routes
   */
  setupApiRoutes() {
    const apiRouter = express.Router();

    // API info endpoint
    apiRouter.get("/", (req, res) => {
      res.json({
        name: this.config.get("app.name"),
        version: this.config.get("app.version"),
        environment: this.config.environment,
        endpoints: {
          health: "/health",
          metrics: "/metrics",
          tasks: "/api/tasks",
          auth: "/auth",
        },
        documentation: "https://github.com/your-repo/api-docs",
      });
    });

    // Tasks endpoints
    apiRouter.get("/tasks", this.authenticateToken, (req, res) => {
      const userId = req.user.userId;
      const userTasks = Array.from(this.storage.tasks.values())
        .filter((task) => task.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      res.json({
        tasks: userTasks,
        total: userTasks.length,
        userId: userId,
      });
    });

    apiRouter.post("/tasks", this.authenticateToken, (req, res) => {
      const { title, description, priority, dueDate } = req.body;
      const userId = req.user.userId;

      // Validate required fields
      if (!title || title.trim().length === 0) {
        return res.status(400).json({
          error: "Task title is required",
        });
      }

      // Create task
      const task = {
        id: this.nextTaskId++,
        userId: userId,
        title: title.trim(),
        description: description ? description.trim() : "",
        priority: priority || "medium",
        dueDate: dueDate || null,
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.storage.tasks.set(task.id, task);

      res.status(201).json({
        message: "Task created successfully",
        task: task,
      });
    });

    apiRouter.get("/tasks/:id", this.authenticateToken, (req, res) => {
      const taskId = parseInt(req.params.id);
      const userId = req.user.userId;
      const task = this.storage.tasks.get(taskId);

      if (!task) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      if (task.userId !== userId) {
        return res.status(403).json({
          error: "Access denied",
        });
      }

      res.json(task);
    });

    apiRouter.put("/tasks/:id", this.authenticateToken, (req, res) => {
      const taskId = parseInt(req.params.id);
      const userId = req.user.userId;
      const task = this.storage.tasks.get(taskId);

      if (!task) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      if (task.userId !== userId) {
        return res.status(403).json({
          error: "Access denied",
        });
      }

      // Update task
      const updatedTask = {
        ...task,
        ...req.body,
        id: taskId, // Prevent ID modification
        userId: userId, // Prevent user modification
        updatedAt: new Date().toISOString(),
      };

      this.storage.tasks.set(taskId, updatedTask);

      res.json({
        message: "Task updated successfully",
        task: updatedTask,
      });
    });

    apiRouter.delete("/tasks/:id", this.authenticateToken, (req, res) => {
      const taskId = parseInt(req.params.id);
      const userId = req.user.userId;
      const task = this.storage.tasks.get(taskId);

      if (!task) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      if (task.userId !== userId) {
        return res.status(403).json({
          error: "Access denied",
        });
      }

      this.storage.tasks.delete(taskId);

      res.status(204).send();
    });

    // User profile endpoints
    apiRouter.get("/profile", this.authenticateToken, (req, res) => {
      const userId = req.user.userId;
      const user = this.storage.users.get(userId);

      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      });
    });

    this.app.use("/api", apiRouter);
  }

  /**
   * Setup SPA fallback
   */
  setupSpaFallback() {
    // Serve index.html for all non-API routes
    this.app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "../public", "index.html"));
    });
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    const securityMiddleware = this.security.getAllMiddleware();

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: "Not Found",
        message: "The requested resource was not found",
        path: req.path,
        method: req.method,
      });
    });

    // Global error handler
    this.app.use(securityMiddleware.errorHandler);

    // Graceful shutdown handling
    process.on("SIGTERM", () => {
      console.log("SIGTERM received, shutting down gracefully");
      this.shutdown();
    });

    process.on("SIGINT", () => {
      console.log("SIGINT received, shutting down gracefully");
      this.shutdown();
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err);
      this.shutdown(1);
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection at:", promise, "reason:", reason);
      this.shutdown(1);
    });
  }

  /**
   * Initialize sample data
   */
  initializeSampleData() {
    // Create sample user
    const sampleUser = {
      id: this.nextUserId++,
      username: "demo",
      email: "demo@example.com",
      password: "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uIu2", // 'password123'
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
    };

    this.storage.users.set(sampleUser.id, sampleUser);

    // Create sample tasks
    const sampleTasks = [
      {
        id: this.nextTaskId++,
        userId: sampleUser.id,
        title: "Complete project documentation",
        description:
          "Write comprehensive documentation for the task management system",
        priority: "high",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: this.nextTaskId++,
        userId: sampleUser.id,
        title: "Review security implementation",
        description: "Audit security measures and update as needed",
        priority: "medium",
        dueDate: null,
        completed: true,
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    sampleTasks.forEach((task) => {
      this.storage.tasks.set(task.id, task);
    });

    console.log("Sample data initialized");
    console.log("Demo user: demo@example.com / password123");
  }

  /**
   * Start the server
   */
  start() {
    const port = this.config.get("app.port");
    const host = this.config.get("app.host");

    this.server = this.app.listen(port, host, () => {
      console.log(
        `🚀 ${this.config.get("app.name")} v${this.config.get("app.version")}`
      );
      console.log(`📡 Server running on http://${host}:${port}`);
      console.log(`🌍 Environment: ${this.config.environment}`);
      console.log(`💚 Health check: http://${host}:${port}/health`);
      console.log(`📊 Metrics: http://${host}:${port}/metrics`);
      console.log(`🔐 Security: Enhanced security enabled`);
      console.log(`⚡ Performance: Monitoring enabled`);
    });

    return this.server;
  }

  /**
   * Graceful shutdown
   */
  shutdown(exitCode = 0) {
    console.log("Shutting down server...");

    if (this.server) {
      this.server.close(() => {
        console.log("Server closed");
        process.exit(exitCode);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        console.log("Forcing server close");
        process.exit(exitCode);
      }, 10000);
    } else {
      process.exit(exitCode);
    }
  }

  /**
   * Get application instance (for testing)
   */
  getApp() {
    return this.app;
  }
}

// Export for use in other modules
module.exports = TaskManagementServer;

// Start server if this file is run directly
if (require.main === module) {
  const server = new TaskManagementServer();
  server.start();
}
