const API_BASE = '/api';
let currentFilter = 'all';
let pomodoroTimer = null;
let pomodoroTime = 25 * 60;
let isWorkSession = true;
let pomodoroSessions = 0;
let isPaused = false;
let skillsTags = []; // For tag-based skills input

document.addEventListener('DOMContentLoaded', function() {
    if (checkAuth()) {
        loadUserData();
        loadTasks();
        loadUserRoadmaps();
        updateAnalytics();
        setupSkillsTagsInput();

        document.getElementById('taskForm').addEventListener('submit', handleTaskSubmit);
        document.getElementById('roadmapForm').addEventListener('submit', handleRoadmapSubmit);

        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().slice(0, 5);
        document.getElementById('taskDueDate').value = today;
        document.getElementById('taskDueTime').value = currentTime;
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
    document.getElementById('userName').textContent = welcomeText;
}

function logout() {
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_data');
    window.location.href = '/auth';
}

// Enhanced photo upload functionality
function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const photoPlaceholder = document.getElementById('photoPlaceholder');
            photoPlaceholder.innerHTML = `<img src="${e.target.result}" alt="Student Photo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">`;

            // Save to localStorage
            localStorage.setItem('student_photo', e.target.result);
        };
        reader.readAsDataURL(file);
    }
}

// Enhanced skills tags input
function setupSkillsTagsInput() {
    const input = document.getElementById('skillsInterestsInput');
    const tagsDisplay = document.getElementById('tagsDisplay');

    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = input.value.trim();
                if (value && !skillsTags.includes(value)) {
                    skillsTags.push(value);
                    renderSkillsTags();
                    input.value = '';
                }
            }
        });
    }
}

function renderSkillsTags() {
    const tagsDisplay = document.getElementById('tagsDisplay');
    if (tagsDisplay) {
        tagsDisplay.innerHTML = skillsTags.map((tag, index) =>
            `<span class="skill-tag">
                ${tag}
                <button type="button" class="tag-remove" onclick="removeSkillTag(${index})">×</button>
            </span>`
        ).join('');
    }
}

function removeSkillTag(index) {
    skillsTags.splice(index, 1);
    renderSkillsTags();
}

// AI timeline generation for tasks
async function generateTaskTimeline() {
    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDescription').value;
    const priority = document.getElementById('taskPriority').value;

    if (!title) {
        showNotification('Please enter a task title first', 'error');
        return;
    }

    const resultDiv = document.getElementById('aiTimelineResult');
    resultDiv.innerHTML = '🤖 Analyzing task and generating timeline estimate...';
    resultDiv.classList.add('show');

    try {
        const response = await fetch(`${API_BASE}/tasks/ai-timeline`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('user_token')}`
            },
            body: JSON.stringify({ title, description, priority })
        });

        if (response.ok) {
            const data = await response.json();
            resultDiv.innerHTML = data.timeline;
        } else {
            resultDiv.innerHTML = '⚠️ Could not generate timeline estimate. Please try again.';
        }
    } catch (error) {
        resultDiv.innerHTML = '❌ Network error. Please check your connection.';
    }
}

// Enhanced Student Card Functions
function showStudentCard() {
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');

    // Populate readonly fields
    document.getElementById('displayInstitution').textContent = userData.institution_name || 'Institution Name';
    document.getElementById('cardCourse').value = userData.education_level === 'school' ? userData.school_grade : userData.academic_year;
    document.getElementById('cardDepartment').value = userData.field_of_study || '';

    // Load saved profile data
    const profileData = JSON.parse(localStorage.getItem('profile_data') || '{}');
    document.getElementById('cardName').value = profileData.name || userData.name || '';
    document.getElementById('cardStudentId').value = profileData.student_id || '';
    document.getElementById('cardPhone').value = profileData.phone || '';
    document.getElementById('cardEmergencyContact').value = profileData.emergency_contact || '';

    // Load saved photo
    const savedPhoto = localStorage.getItem('student_photo');
    if (savedPhoto) {
        document.getElementById('photoPlaceholder').innerHTML = `<img src="${savedPhoto}" alt="Student Photo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">`;
    }

    document.getElementById('studentCardModal').style.display = 'flex';
}

function closeStudentCard() {
    document.getElementById('studentCardModal').style.display = 'none';
}

function saveStudentCard() {
    const profileData = {
        name: document.getElementById('cardName').value,
        student_id: document.getElementById('cardStudentId').value,
        phone: document.getElementById('cardPhone').value,
        emergency_contact: document.getElementById('cardEmergencyContact').value
    };

    localStorage.setItem('profile_data', JSON.stringify(profileData));
    showNotification('Profile saved successfully!', 'success');
    closeStudentCard();
}

// Pomodoro Timer Functions
function startPomodoro() {
    if (isPaused) {
        isPaused = false;
    } else {
        const workMinutes = parseInt(document.getElementById('workMinutes').value);
        const breakMinutes = parseInt(document.getElementById('breakMinutes').value);
        pomodoroTime = isWorkSession ? workMinutes * 60 : breakMinutes * 60;
    }

    document.getElementById('startBtn').disabled = true;
    document.getElementById('pauseBtn').disabled = false;
    document.getElementById('pomodoroStatus').textContent = isWorkSession ? 'Working' : 'Break';

    pomodoroTimer = setInterval(() => {
        pomodoroTime--;
        updateTimerDisplay();

        if (pomodoroTime <= 0) {
            clearInterval(pomodoroTimer);
            completePomodoro();
        }
    }, 1000);
}

function pausePomodoro() {
    clearInterval(pomodoroTimer);
    isPaused = true;
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('pomodoroStatus').textContent = 'Paused';
}

function resetPomodoro() {
    clearInterval(pomodoroTimer);
    isPaused = false;
    isWorkSession = true;
    const workMinutes = parseInt(document.getElementById('workMinutes').value);
    pomodoroTime = workMinutes * 60;
    updateTimerDisplay();

    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('pomodoroStatus').textContent = 'Ready';
}

function updateTimerDisplay() {
    const minutes = Math.floor(pomodoroTime / 60);
    const seconds = pomodoroTime % 60;
    document.getElementById('timerMinutes').textContent = minutes.toString().padStart(2, '0');
    document.getElementById('timerSeconds').textContent = seconds.toString().padStart(2, '0');
}

function completePomodoro() {
    if (isWorkSession) {
        pomodoroSessions++;
        document.getElementById('pomodoroSessions').textContent = pomodoroSessions;
        showNotification('Work session completed! Time for a break.', 'success');
    } else {
        showNotification('Break completed! Time to get back to work.', 'success');
    }

    isWorkSession = !isWorkSession;
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('pomodoroStatus').textContent = 'Session Complete';

    setTimeout(() => {
        if (confirm(isWorkSession ? 'Start work session?' : 'Start break?')) {
            startPomodoro();
        }
    }, 3000);
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

// ENHANCED: Task display with auto-removal from All when completed
function displayTasks(tasks) {
    const container = document.getElementById('taskContainer');
    if (tasks.length === 0) {
        container.innerHTML = '<div class="task-placeholder"><p>📝 No tasks found. Add your first task!</p></div>';
        return;
    }

    const filteredTasks = filterTasksByStatus(tasks);
    container.innerHTML = filteredTasks.map(task => {
        const dueDateTime = new Date(task.due_date + 'T' + (task.due_time || '23:59'));
        const formattedDateTime = dueDateTime.toLocaleString();

        return `
            <div class="task-item">
                <div class="task-header">
                    <span class="task-title">${task.title}</span>
                    <span class="task-priority priority-${task.priority}">${task.priority.toUpperCase()}</span>
                </div>
                <div class="task-description">${task.description || 'No description'}</div>
                <div class="task-footer">
                    <span class="task-due-date">📅 Due: ${formattedDateTime}</span>
                    <div class="task-actions">
                        ${task.status === 'pending' ? 
                            `<button onclick="completeTask(${task.id})">✅ Complete</button>` : 
                            `<span style="color: #00ff88;">✅ Completed</span>`
                        }
                        <button onclick="deleteTask(${task.id})">🗑️ Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function filterTasksByStatus(tasks) {
    const now = new Date();

    switch(currentFilter) {
        case 'pending':
            return tasks.filter(task => task.status === 'pending');
        case 'completed':
            return tasks.filter(task => task.status === 'completed');
        case 'overdue':
            return tasks.filter(task => {
                const dueDate = new Date(task.due_date + 'T' + (task.due_time || '23:59'));
                return task.status === 'pending' && dueDate < now;
            });
        case 'all':
        default:
            // FIXED: For 'all' filter, exclude completed tasks to auto-remove them
            return tasks.filter(task => task.status !== 'completed');
    }
}

function filterTasks(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[onclick="filterTasks('${filter}')"]`).classList.add('active');
    loadTasks();
}

function openTaskModal() {
    document.getElementById('taskModal').style.display = 'flex';
}

function closeTaskModal() {
    document.getElementById('taskModal').style.display = 'none';
    document.getElementById('taskForm').reset();
    document.getElementById('aiTimelineResult').classList.remove('show');
}

async function handleTaskSubmit(e) {
    e.preventDefault();

    const taskData = {
        title: document.getElementById('taskTitle').value,
        description: document.getElementById('taskDescription').value,
        due_date: document.getElementById('taskDueDate').value,
        due_time: document.getElementById('taskDueTime').value,
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
            closeTaskModal();
            loadTasks();
            showNotification('Task added successfully!', 'success');
        } else {
            showNotification('Failed to add task', 'error');
        }
    } catch (error) {
        showNotification('Network error. Please try again.', 'error');
    }
}

async function completeTask(taskId) {
    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('user_token')}`
            },
            body: JSON.stringify({ status: 'completed' })
        });

        if (response.ok) {
            loadTasks();
            showNotification('Task completed!', 'success');
        }
    } catch (error) {
        showNotification('Error completing task', 'error');
    }
}

async function deleteTask(taskId) {
    if (confirm('Are you sure you want to delete this task?')) {
        try {
            const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('user_token')}`
                }
            });

            if (response.ok) {
                loadTasks();
                showNotification('Task deleted!', 'success');
            }
        } catch (error) {
            showNotification('Error deleting task', 'error');
        }
    }
}

// ENHANCED: Career advice with better formatting
async function getCareerAdvice() {
    const input = document.getElementById('careerInput').value.trim();
    if (!input) {
        showNotification('Please enter your question or concern', 'error');
        return;
    }

    const adviceDiv = document.getElementById('careerAdvice');
    adviceDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><p>🤖 Generating comprehensive career guidance...</p></div>';

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
            adviceDiv.innerHTML = data.advice;
        } else {
            adviceDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><p>⚠️ Sorry, I couldn\'t generate advice right now. Please try again.</p></div>';
        }
    } catch (error) {
        adviceDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><p>❌ Network error. Please check your connection and try again.</p></div>';
    }
}

function openRoadmapModal() {
    document.getElementById('roadmapModal').style.display = 'flex';
}

function closeRoadmapModal() {
    document.getElementById('roadmapModal').style.display = 'none';
    document.getElementById('roadmapForm').reset();
    skillsTags = [];
    renderSkillsTags();
}

// ENHANCED: Roadmap submission with tag-based skills
async function handleRoadmapSubmit(e) {
    e.preventDefault();

    const formData = {
        career_goal: document.getElementById('careerGoalInput').value,
        current_level: document.getElementById('currentSkill').value,
        timeframe: document.getElementById('timeframe').value,
        skills: skillsTags // Send as array
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
            showNotification('🚀 Roadmap generated successfully!', 'success');
        } else {
            showNotification(roadmapData.error || 'Failed to generate roadmap', 'error');
        }
    } catch (error) {
        showNotification('Network error. Please try again.', 'error');
    }
}

function displayRoadmap(roadmapData) {
    const container = document.getElementById('roadmapContainer');
    container.innerHTML = roadmapData.roadmap;
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
            // Display latest roadmap if available
            if (roadmaps.length > 0) {
                const latestRoadmap = roadmaps[0];
                displayRoadmap({ roadmap: latestRoadmap.roadmap_data });
            }
        }
    } catch (error) {
        console.error('Error loading roadmaps:', error);
    }
}

async function updateAnalytics(tasks = null) {
    try {
        const response = await fetch(`${API_BASE}/analytics`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('user_token')}`
            }
        });

        if (response.ok) {
            const analytics = await response.json();

            document.getElementById('totalTasks').textContent = analytics.total_tasks;
            document.getElementById('completedTasks').textContent = analytics.completed_tasks;
            document.getElementById('pendingTasks').textContent = analytics.pending_tasks;
            document.getElementById('productivityScore').textContent = analytics.productivity_score + '%';
        }
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

function showNotification(message, type) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Click outside modal to close
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + N to add new task
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openTaskModal();
    }

    // Escape to close modals
    if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal[style*="flex"]');
        if (openModal) {
            openModal.style.display = 'none';
        }
    }
});

// Auto-save functionality for forms
let autoSaveTimeout;
function autoSave(formId, storageKey) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        const form = document.getElementById(formId);
        const formData = new FormData(form);
        const data = Object.fromEntries(formData);
        localStorage.setItem(storageKey, JSON.stringify(data));
    }, 1000);
}

// Load auto-saved data
function loadAutoSavedData(formId, storageKey) {
    const savedData = localStorage.getItem(storageKey);
    if (savedData) {
        const data = JSON.parse(savedData);
        const form = document.getElementById(formId);
        Object.keys(data).forEach(key => {
            const input = form.querySelector(`[name="${key}"]`);
            if (input) {
                input.value = data[key];
            }
        });
    }
}

// Initialize auto-save for task form
document.addEventListener('DOMContentLoaded', function() {
    const taskForm = document.getElementById('taskForm');
    if (taskForm) {
        taskForm.addEventListener('input', () => autoSave('taskForm', 'task_draft'));
        loadAutoSavedData('taskForm', 'task_draft');
    }
});

// Service Worker registration for offline support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/static/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful');
            })
            .catch(function(err) {
                console.log('ServiceWorker registration failed');
            });
    });
}

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        filterTasksByStatus,
        updateTimerDisplay,
        formatDateTime: (date, time) => new Date(date + 'T' + (time || '23:59')).toLocaleString()
    };
}
