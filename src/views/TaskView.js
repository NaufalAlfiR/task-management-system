/**
 * Task View - Mengatur tampilan dan interaksi task
 *
 * View dalam MVC Pattern:
 * - Mengatur DOM manipulation
 * - Handle user interactions
 * - Display data dari Controller
 * - Tidak mengandung business logic
 */
class TaskView {
  constructor(taskController, userController) {
    this.taskController = taskController;
    this.userController = userController;

    // DOM elements
    this.taskForm = null;
    this.taskList = null;
    this.taskStats = null;
    this.filterButtons = null;
    this.searchInput = null;
    this.messagesContainer = null;

    // Current state
    this.currentFilter = "all";
    this.currentSort = "createdAt";
    this.currentSortOrder = "desc";

    this._initializeElements();
    this._setupEventListeners();
  }

  /**
   * Initialize DOM elements
   */
  _initializeElements() {
    this.taskForm = document.getElementById("taskForm");
    this.taskList = document.getElementById("taskList");
    this.taskStats = document.getElementById("taskStats");
    this.filterButtons = document.querySelectorAll(".filter-btn");
    this.searchInput = document.getElementById("searchInput");
    this.messagesContainer = document.getElementById("messages");

    // Create elements jika belum ada
    if (!this.messagesContainer) {
      this.messagesContainer = this._createMessagesContainer();
    }
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    // Task form submission
    if (this.taskForm) {
      this.taskForm.addEventListener("submit", (e) =>
        this._handleTaskFormSubmit(e)
      );
    }

    // Filter buttons
    this.filterButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => this._handleFilterChange(e));
    });

    // Search input
    if (this.searchInput) {
      this.searchInput.addEventListener("input", (e) => this._handleSearch(e));
    }

    // Sort dropdown
    const sortSelect = document.getElementById("sortSelect");
    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => this._handleSortChange(e));
    }

    // Clear all tasks button
    const clearAllBtn = document.getElementById("clearAllTasks");
    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", () => this._handleClearAllTasks());
    }
  }

  /**
   * Render task list
   */
  renderTasks() {
    if (!this.taskList) return;

    // Get tasks dari controller
    const response = this.taskController.getTasks({
      status: this.currentFilter === "all" ? undefined : this.currentFilter,
      sortBy: this.currentSort,
      sortOrder: this.currentSortOrder,
    });

    if (!response.success) {
      this.showMessage(response.error, "error");
      return;
    }

    const tasks = response.data;

    if (tasks.length === 0) {
      this.taskList.innerHTML = this._getEmptyStateHTML();
      return;
    }

    // Render tasks
    const tasksHTML = tasks.map((task) => this._createTaskHTML(task)).join("");
    this.taskList.innerHTML = tasksHTML;

    // Setup task-specific event listeners
    this._setupTaskEventListeners();
  }

  /**
   * Filter tasks by category
   */
  filterByCategory(category) {
    if (!this.taskList) return;

    // 1. Ambil data dari Controller
    const response = this.taskController.getTasksByCategory(category);

    if (!response.success) {
      this.showMessage(response.error, "error");
      return;
    }

    const tasks = response.data;
    this.currentFilter = "category";

    if (tasks.length === 0) {
      this.taskList.innerHTML = `
          <div class="empty-state">
              <p>No tasks found in ${category} category</p>
              <small>Create your first task using the form above</small>
          </div>
      `;
      return;
    }

    const tasksHTML = tasks.map((task) => this._createTaskHTML(task)).join("");
    this.taskList.innerHTML = tasksHTML;
    this._setupTaskEventListeners();
  }

  /**
   * Render task statistics
   */
  renderStats() {
    if (!this.taskStats) return;

    const response = this.taskController.getTaskStats();

    if (!response.success) {
      console.error("Failed to get stats:", response.error);
      return;
    }

    const stats = response.data;

    this.taskStats.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-number">${stats.total}</span>
                    <span class="stat-label">Total Tasks</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${
                      stats.byStatus.pending || 0
                    }</span>
                    <span class="stat-label">Pending</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${stats.completed}</span>
                    <span class="stat-label">Completed</span>
                </div>
                <div class="stat-item priority-high">
                    <span class="stat-number">${
                      (stats.byPriority.high || 0) +
                      (stats.byPriority.urgent || 0)
                    }</span>
                    <span class="stat-label">High Priority</span>
                </div>
                <div class="stat-item ${stats.overdue > 0 ? "overdue" : ""}">
                    <span class="stat-number">${stats.overdue}</span>
                    <span class="stat-label">Overdue</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${stats.dueSoon}</span>
                    <span class="stat-label">Due Soon</span>
                </div>
            </div>
        `;
  }

  /**
   * Show message to user
   * @param {string} message - Message text
   * @param {string} type - Message type (success, error, info, warning)
   */
  showMessage(message, type = "info") {
    if (!this.messagesContainer) return;

    const messageElement = document.createElement("div");
    messageElement.className = `message message-${type}`;
    messageElement.textContent = message;

    this.messagesContainer.appendChild(messageElement);

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (messageElement.parentNode) {
        messageElement.parentNode.removeChild(messageElement);
      }
    }, 5000);
  }

  /**
   * Refresh all views
   */
  refresh() {
    this.renderTasks();
    this.renderStats();
    this.renderCategoryStats();
  }

  /**
   * Handle task form submission
   */
  _handleTaskFormSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const taskData = {
      title: formData.get("title")?.trim(),
      description: formData.get("description")?.trim(),
      category: formData.get("category") || "personal",
      priority: formData.get("priority") || "medium",
      dueDate: formData.get("dueDate") || null,
      estimatedHours: parseFloat(formData.get("estimatedHours")) || 0,
      tags: formData.get("tags")
        ? formData
            .get("tags")
            .split(",")
            .map((tag) => tag.trim())
        : [],
    };

    // Handle assignee
    const assigneeId = formData.get("assigneeId");
    if (assigneeId && assigneeId !== "self") {
      taskData.assigneeId = assigneeId;
    }

    const response = this.taskController.createTask(taskData);

    if (response.success) {
      this.showMessage(response.message, "success");
      event.target.reset();
      this.refresh();
    } else {
      this.showMessage(response.error, "error");
    }
  }

  /**
   * Handle filter change
   */
  _handleFilterChange(event) {
    const filterType = event.target.dataset.filter;

    // Update active filter button
    this.filterButtons.forEach((btn) => btn.classList.remove("active"));
    event.target.classList.add("active");

    this.currentFilter = filterType;
    this.renderTasks();
  }

  /**
   * Handle search
   */
  _handleSearch(event) {
    const query = event.target.value.trim();

    if (query === "") {
      this.renderTasks();
      return;
    }

    const response = this.taskController.searchTasks(query);

    if (response.success) {
      const tasks = response.data;

      if (tasks.length === 0) {
        this.taskList.innerHTML = `
                    <div class="empty-state">
                        <p>Tidak ada task yang ditemukan untuk "${query}"</p>
                        <small>Coba kata kunci yang berbeda</small>
                    </div>
                `;
      } else {
        const tasksHTML = tasks
          .map((task) => this._createTaskHTML(task))
          .join("");
        this.taskList.innerHTML = tasksHTML;
        this._setupTaskEventListeners();
      }
    } else {
      this.showMessage(response.error, "error");
    }
  }

  /**
   * Handle sort change
   */
  _handleSortChange(event) {
    const [sortBy, sortOrder] = event.target.value.split("-");
    this.currentSort = sortBy;
    this.currentSortOrder = sortOrder;
    this.renderTasks();
  }

  /**
   * Handle clear all tasks
   */
  _handleClearAllTasks() {
    if (confirm("Apakah Anda yakin ingin menghapus semua task?")) {
      // Implementasi clear all tasks
      // Untuk sekarang, kita refresh saja
      this.refresh();
    }
  }

  /**
   * Setup task-specific event listeners
   */
  _setupTaskEventListeners() {
    // Toggle task status
    document.querySelectorAll(".btn-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const taskId = e.target.closest(".task-item").dataset.taskId;
        this._handleTaskToggle(taskId);
      });
    });

    // Delete task
    document.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const taskId = e.target.closest(".task-item").dataset.taskId;
        this._handleTaskDelete(taskId);
      });
    });

    // Edit task (jika ada)
    document.querySelectorAll(".btn-edit").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const taskId = e.target.closest(".task-item").dataset.taskId;
        this._handleTaskEdit(taskId);
      });
    });
  }

  /**
   * Handle task toggle
   */
  _handleTaskToggle(taskId) {
    const response = this.taskController.toggleTaskStatus(taskId);

    if (response.success) {
      this.showMessage(response.message, "success");
      this.refresh();
    } else {
      this.showMessage(response.error, "error");
    }
  }

  /**
   * Handle task delete
   */
  _handleTaskDelete(taskId) {
    const taskResponse = this.taskController.getTask(taskId);

    if (!taskResponse.success) {
      this.showMessage(taskResponse.error, "error");
      return;
    }

    const task = taskResponse.data;

    if (confirm(`Apakah Anda yakin ingin menghapus task "${task.title}"?`)) {
      const response = this.taskController.deleteTask(taskId);

      if (response.success) {
        this.showMessage(response.message, "success");
        this.refresh();
      } else {
        this.showMessage(response.error, "error");
      }
    }
  }

  /**
   * Handle task edit
   */
  _handleTaskEdit(taskId) {
    // Implementasi edit task
    // Untuk sekarang, kita tampilkan alert saja
    alert("Edit task feature akan diimplementasikan nanti");
  }

  /**
   * Render Category Statistics (Fitur Day 4)
   */
  renderCategoryStats() {
    const statsContainer = document.getElementById("categoryStats");
    if (!statsContainer) return;

    // 1. Ambil data Mateng dari Controller (Gak perlu hitung manual lagi)
    const response = this.taskController.getCategoryStats();
    if (!response.success) return;

    const categoryStats = response.data.byCategory;

    // 2. Render HTML (Logic sama kayak panduan)
    const statsHTML = Object.entries(categoryStats)
      .filter(([category, stats]) => stats.total > 0)
      .map(([category, stats]) => {
        const displayNames = {
          work: "Work",
          personal: "Personal",
          study: "Study",
          health: "Health",
          finance: "Finance",
          shopping: "Shopping",
          other: "Other",
        };

        return `
                <div class="category-stat-item">
                    <h4>${displayNames[category] || category}</h4>
                    <div class="stat-number">${stats.total}</div>
                    <small>${stats.completed} completed</small>
                </div>
            `;
      })
      .join("");

    if (statsHTML) {
      statsContainer.innerHTML = `
            <h3>Tasks by Category</h3>
            <div class="category-stats">${statsHTML}</div>
        `;
    }
  }

  /**
   * Create HTML for single task
   */
  _createTaskHTML(task) {
    // 1. Setup Class CSS
    const priorityClass = `priority-${task.priority}`;
    // Cek property isCompleted (sesuai Model lu)
    const completedClass = task.isCompleted ? "completed" : "";
    const overdueClass = task.isOverdue ? "overdue" : "";
    const categoryClass = `category-${task.category}`; // Class Kategori Baru

    // 2. Format Tanggal
    const createdDate = new Date(task.createdAt).toLocaleDateString("id-ID");
    const dueDate = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString("id-ID")
      : null;

    // 3. Mapping Nama Kategori (Fitur Day 4)
    const categoryDisplayNames = {
      work: "Work",
      personal: "Personal",
      study: "Study",
      health: "Health",
      finance: "Finance",
      shopping: "Shopping",
      other: "Other",
    };
    const categoryDisplay =
      categoryDisplayNames[task.category] || task.category;

    // 4. Cek Assignee (Fitur Day 3 lu)
    let assigneeInfo = "";
    if (task.assigneeId && this.userController) {
      const userResp = this.userController.getUserById(task.assigneeId);
      if (userResp.success) {
        assigneeInfo = `<small>Assigned to: ${userResp.data.fullName}</small>`;
      }
    }

    // 5. Render HTML (Tanpa onclick, pake data-attributes)
    return `
        <div class="task-item ${priorityClass} ${completedClass} ${overdueClass}" data-task-id="${
      task.id
    }">
            <div class="task-content">
                <div class="task-header">
                    <h3 class="task-title">${this._escapeHtml(task.title)}</h3>
                    
                    <div class="task-badges">
                        <span class="task-priority badge-${task.priority}">${
      task.priority
    }</span>
                        
                        <span class="task-category ${categoryClass}">${categoryDisplay}</span>
                        
                        <span class="task-status badge-status">${
                          task.status
                        }</span>
                    </div>
                </div>
                
                ${
                  task.description
                    ? `<p class="task-description">${this._escapeHtml(
                        task.description
                      )}</p>`
                    : ""
                }
                
                <div class="task-tags">
                    ${
                      task.tags && task.tags.length > 0
                        ? task.tags
                            .map(
                              (tag) =>
                                `<span class="tag">${this._escapeHtml(
                                  tag
                                )}</span>`
                            )
                            .join("")
                        : ""
                    }
                </div>
                
                <div class="task-meta">
                    <small>Created: ${createdDate}</small>
                    ${
                      dueDate
                        ? `<small class="${
                            task.isOverdue ? "overdue-text" : ""
                          }">Due: ${dueDate}</small>`
                        : ""
                    }
                    ${assigneeInfo}
                </div>
            </div>
            
            <div class="task-actions">
                <button class="btn btn-toggle" title="${
                  task.isCompleted ? "Mark incomplete" : "Mark complete"
                }">
                    ${task.isCompleted ? "↶" : "✓"}
                </button>
                <button class="btn btn-edit" title="Edit task">
                    ✏️
                </button>
                <button class="btn btn-delete" title="Delete task">
                    🗑️
                </button>
            </div>
        </div>
    `;
  }

  /**
   * Get empty state HTML
   */
  _getEmptyStateHTML() {
    return `
            <div class="empty-state">
                <p>Belum ada task</p>
                <small>Buat task pertama Anda menggunakan form di atas</small>
            </div>
        `;
  }

  /**
   * Create messages container
   */
  _createMessagesContainer() {
    const container = document.createElement("div");
    container.id = "messages";
    container.className = "messages-container";
    document.body.appendChild(container);
    return container;
  }

  /**
   * Escape HTML to prevent XSS
   */
  _escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Export untuk digunakan di file lain
if (typeof module !== "undefined" && module.exports) {
  module.exports = TaskView;
} else {
  window.TaskView = TaskView;
}
