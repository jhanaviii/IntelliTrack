const API_BASE = '/api';
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', function() {
    if (checkAuth()) {
        loadUserData();
        loadTasks();
        loadUserRoadmaps();
        updateAnalytics();

        // Setup form handlers
        document.getElementById('taskForm').addEventListener('submit', handleTaskSubmit);
        document.getElementById('roadmapForm').addEventListener('submit', handleRoadmapSubmit);
    }
});

function checkAuth() {
    const token = localStorage.getItem('user_token');
    if (!token) {
        window.location.href = '/auth';
        return false;
    }
    return true;
}

function loadUserData() {
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    let welcomeText = `Welcome, ${userData.name || 'User'}!`;

    // Add education info
    if (userData.education_level === 'school' && userData.school_grade) {
        welcomeText += ` (${userData.school_grade})`;
    } else if (userData.education_level === 'college' && userData.academic_year) {
        welcomeText += ` (${userData.academic_year})`;
    }

    document.getElementById('userName').textContent = welcomeText;
}

function logout() {
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_data');
    window.location.href = '/auth';
}

async function loadTasks() {
    try {
        const response = await fetch(`${API_BASE}/tasks`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('user_token')}`
            }
        });

        if (response.ok) {
            const tasks = await response.json();
            displayTasks(tasks);
            updateAnalytics(tasks);
        }
    } catch (error) {
        showNotification('Error loading tasks', 'error');
    }
}

function displayTasks(tasks) {
    const container = document.getElementById('taskContainer');

    if (tasks.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.7;">No tasks found. Add your first task!</p>';
        return;
    }

    const filteredTasks = filterTasksByStatus(tasks);

    container.innerHTML = filteredTasks.map(task => `
        <div class="task-item" data-status="${task.status}">
            <div class="task-header">
                <span class="task-title">${task.title}</span>
                <span class="task-priority priority-${task.priority}">${task.priority.toUpperCase()}</span>
            </div>
            <div class="task-description">${task.description || 'No description'}</div>
            <div class="task-footer">
                <span class="task-due-date">Due: ${new Date(task.due_date).toLocaleDateString()}</span>
                <div class="task-actions">
                    <button onclick="toggleTaskStatus(${task.id}, '${task.status}')">
                        ${task.status === 'completed' ? 'Undo' : 'Complete'}
                    </button>
                    <button onclick="deleteTask(${task.id})">Delete</button>
                </div>
            </div>
        </div>
    `).join('');
}

function filterTasksByStatus(tasks) {
    const now = new Date();

    switch (currentFilter) {
        case 'pending':
            return tasks.filter(task => task.status === 'pending');
        case 'completed':
            return tasks.filter(task => task.status === 'completed');
        case 'overdue':
            return tasks.filter(task =>
                task.status === 'pending' && new Date(task.due_date) < now
            );
        default:
            return tasks;
    }
}

function filterTasks(status) {
    currentFilter = status;

    // Update filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    loadTasks();
}

function openTaskModal() {
    document.getElementById('taskModal').style.display = 'flex';
}

function closeTaskModal() {
    document.getElementById('taskModal').style.display = 'none';
    document.getElementById('taskForm').reset();
}

async function handleTaskSubmit(e) {
    e.preventDefault();

    const taskData = {
        title: document.getElementById('taskTitle').value,
        description: document.getElementById('taskDescription').value,
        due_date: document.getElementById('taskDueDate').value,
        priority: document.getElementById('taskPriority').value
    };

    try {
        const response = await fetch(`${API_BASE}/tasks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('user_token')}`
            },
            body: JSON.stringify(taskData)
        });

        if (response.ok) {
            showNotification('Task added successfully!', 'success');
            closeTaskModal();
            loadTasks();
        } else {
            const error = await response.json();
            showNotification(error.error || 'Failed to add task', 'error');
        }
    } catch (error) {
        showNotification('Network error. Please try again.', 'error');
    }
}

async function toggleTaskStatus(taskId, currentStatus) {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';

    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('user_token')}`
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (response.ok) {
            showNotification('Task updated successfully!', 'success');
            loadTasks();
        }
    } catch (error) {
        showNotification('Error updating task', 'error');
    }
}

async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('user_token')}`
            }
        });

        if (response.ok) {
            showNotification('Task deleted successfully!', 'success');
            loadTasks();
        }
    } catch (error) {
        showNotification('Error deleting task', 'error');
    }
}

async function getCareerAdvice() {
    const input = document.getElementById('careerInput').value.trim();
    if (!input) {
        showNotification('Please enter your interests and goals', 'error');
        return;
    }

    const adviceDiv = document.getElementById('careerAdvice');
    adviceDiv.innerHTML = '<p>🤖 Generating personalized career advice...</p>';

    try {
        const response = await fetch(`${API_BASE}/career-advice`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('user_token')}`
            },
            body: JSON.stringify({ input })
        });

        if (response.ok) {
            const data = await response.json();
            adviceDiv.innerHTML = `<div style="white-space: pre-wrap;">${data.advice}</div>`;
        } else {
            adviceDiv.innerHTML = '<p>Sorry, I couldn\'t generate advice right now. Please try again.</p>';
        }
    } catch (error) {
        adviceDiv.innerHTML = '<p>Network error. Please check your connection and try again.</p>';
    }
}

function openRoadmapModal() {
    document.getElementById('roadmapModal').style.display = 'flex';
}

function closeRoadmapModal() {
    document.getElementById('roadmapModal').style.display = 'none';
    document.getElementById('roadmapForm').reset();
}

async function handleRoadmapSubmit(e) {
    e.preventDefault();

    const formData = {
        career_goal: document.getElementById('careerGoal').value,
        current_level: document.getElementById('currentLevel').value,
        timeframe: document.getElementById('timeframe').value,
        specific_interests: document.getElementById('specificInterests').value
    };

    try {
        const response = await fetch(`${API_BASE}/roadmap/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('user_token')}`
            },
            body: JSON.stringify(formData)
        });

        const roadmapData = await response.json();

        if (response.ok) {
            displayRoadmap(roadmapData);
            closeRoadmapModal();
            showNotification('Roadmap generated successfully!', 'success');
        } else {
            showNotification(roadmapData.error || 'Failed to generate roadmap', 'error');
        }
    } catch (error) {
        showNotification('Network error. Please try again.', 'error');
    }
}

function displayRoadmap(roadmapData) {
    const container = document.getElementById('roadmapContainer');

    let roadmapHTML = `
        <div class="roadmap-header">
            <h3>${roadmapData.roadmap_title}</h3>
            <p>Duration: ${roadmapData.total_duration}</p>
        </div>
        <div class="roadmap-phases">
    `;

    roadmapData.phases.forEach((phase, index) => {
        roadmapHTML += `
            <div class="phase-card">
                <div class="phase-header">
                    <h4>${phase.phase}</h4>
                    <span class="phase-duration">${phase.duration}</span>
                </div>
                <div class="phase-content">
                    <div class="skills-section">
                        <h5>Skills to Learn:</h5>
                        <div class="skills-list">
                            ${phase.skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
                        </div>
                    </div>
                    <div class="resources-section">
                        <h5>Resources:</h5>
                        <ul>
                            ${phase.resources.map(resource => 
                                `<li><strong>${resource.name}</strong> (${resource.type})</li>`
                            ).join('')}
                        </ul>
                    </div>
                    <div class="projects-section">
                        <h5>Project Ideas:</h5>
                        <ul>
                            ${phase.projects.map(project => `<li>${project}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        `;
    });

    roadmapHTML += '</div>';
    container.innerHTML = roadmapHTML;
}

async function loadUserRoadmaps() {
    try {
        const response = await fetch(`${API_BASE}/roadmap/user`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('user_token')}`
            }
        });

        if (response.ok) {
            const roadmaps = await response.json();
            if (roadmaps.length > 0) {
                displayRoadmap(roadmaps[0].roadmap_data);
            }
        }
    } catch (error) {
        console.error('Error loading roadmaps:', error);
    }
}

function updateAnalytics(tasks = []) {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(task => task.status === 'completed').length;
    const pendingTasks = tasks.filter(task => task.status === 'pending').length;
    const productivityScore = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    document.getElementById('totalTasks').textContent = totalTasks;
    document.getElementById('completedTasks').textContent = completedTasks;
    document.getElementById('pendingTasks').textContent = pendingTasks;
    document.getElementById('productivityScore').textContent = `${productivityScore}%`;
}

function showNotification(message, type) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Close modals when clicking outside
window.onclick = function(event) {
    const taskModal = document.getElementById('taskModal');
    const roadmapModal = document.getElementById('roadmapModal');

    if (event.target === taskModal) {
        closeTaskModal();
    }
    if (event.target === roadmapModal) {
        closeRoadmapModal();
    }
}
