const API_BASE = '/api';
let currentFilter = 'all';
let pomodoroTimer = null;
let pomodoroTime = 25 * 60;
let isWorkSession = true;
let pomodoroSessions = 0;
let isPaused = false;

document.addEventListener('DOMContentLoaded', function() {
    if (checkAuth()) {
        loadUserData();
        loadTasks();
        loadUserRoadmaps();
        updateAnalytics();
        setupCareerGoals(); // Setup education-specific career goals

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

// FIXED: Setup education-specific career goals
function setupCareerGoals() {
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const careerGoalSelect = document.getElementById('careerGoal');

    let options = '';

    if (userData.education_level === 'school') {
        // School student career options
        options = `
            <option value="">Select Career Goal</option>
            <option value="Engineering Student">Engineering Student</option>
            <option value="Medical Student">Medical Student</option>
            <option value="Commerce Student">Commerce Student</option>
            <option value="Arts Student">Arts Student</option>
            <option value="Science Student">Science Student</option>
            <option value="Competitive Exam Preparation">Competitive Exam Preparation</option>
            <option value="Skill Development">Skill Development</option>
        `;
    } else if (userData.education_level === 'college') {
        // College student career options
        options = `
            <option value="">Select Career Goal</option>
            <option value="Software Engineer">Software Engineer</option>
            <option value="Data Scientist">Data Scientist</option>
            <option value="AI/ML Engineer">AI/ML Engineer</option>
            <option value="Web Developer">Web Developer</option>
            <option value="Mobile Developer">Mobile Developer</option>
            <option value="DevOps Engineer">DevOps Engineer</option>
            <option value="Cybersecurity Specialist">Cybersecurity Specialist</option>
            <option value="Product Manager">Product Manager</option>
            <option value="Business Analyst">Business Analyst</option>
            <option value="Research Scientist">Research Scientist</option>
            <option value="Startup Founder">Startup Founder</option>
        `;
    } else {
        // Default options
        options = `
            <option value="">Select Career Goal</option>
            <option value="Software Engineer">Software Engineer</option>
            <option value="Data Scientist">Data Scientist</option>
            <option value="Web Developer">Web Developer</option>
            <option value="Student">Student</option>
        `;
    }

    careerGoalSelect.innerHTML = options;
}

// FIXED: Student Card Functions
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

function displayTasks(tasks) {
    const container = document.getElementById('taskContainer');

    if (tasks.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.7;">No tasks found. Add your first task!</p>';
        return;
    }

    const filteredTasks = filterTasksByStatus(tasks);

    container.innerHTML = filteredTasks.map(task => {
        const dueDateTime = new Date(task.due_date + 'T' + (task.due_time || '23:59'));
        const formattedDateTime = dueDateTime.toLocaleString();

        return `
        <div class="task-item" data-status="${task.status}">
            <div class="task-header">
                <span class="task-title">${task.title}</span>
                <span class="task-priority priority-${task.priority}">${task.priority.toUpperCase()}</span>
            </div>
            <div class="task-description">${task.description || 'No description'}</div>
            <div class="task-footer">
                <span class="task-due-date">Due: ${formattedDateTime}</span>
                <div class="task-actions">
                    <button onclick="toggleTaskStatus(${task.id}, '${task.status}')">
                        ${task.status === 'completed' ? 'Undo' : 'Complete'}
                    </button>
                    <button onclick="deleteTask(${task.id})">Delete</button>
                </div>
            </div>
        </div>
    `;
    }).join('');
}

function filterTasksByStatus(tasks) {
    const now = new Date();

    switch (currentFilter) {
        case 'pending':
            return tasks.filter(task => task.status === 'pending');
        case 'completed':
            return tasks.filter(task => task.status === 'completed');
        case 'overdue':
            return tasks.filter(task => {
                const dueDateTime = new Date(task.due_date + 'T' + (task.due_time || '23:59'));
                return task.status === 'pending' && dueDateTime < now;
            });
        default:
            return tasks;
    }
}

function filterTasks(status) {
    currentFilter = status;

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

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5);
    document.getElementById('taskDueDate').value = today;
    document.getElementById('taskDueTime').value = currentTime;
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

async function generateAITasks() {
    try {
        const response = await fetch(`${API_BASE}/roadmap/user`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('user_token')}`
            }
        });

        if (response.ok) {
            const roadmaps = await response.json();
            if (roadmaps.length === 0) {
                showNotification('Please generate a learning roadmap first!', 'error');
                return;
            }

            const latestRoadmap = roadmaps[0];
            const aiTasksResponse = await fetch(`${API_BASE}/generate-ai-tasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('user_token')}`
                },
                body: JSON.stringify({ roadmap_data: latestRoadmap.roadmap_data })
            });

            if (aiTasksResponse.ok) {
                showNotification('AI tasks generated successfully!', 'success');
                loadTasks();
            } else {
                showNotification('Failed to generate AI tasks', 'error');
            }
        }
    } catch (error) {
        showNotification('Error generating AI tasks', 'error');
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
            adviceDiv.innerHTML = data.advice;
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
        current_level: document.getElementById('currentSkill').value,
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

// ENHANCED: Display roadmap with better formatting
function displayRoadmap(roadmapData) {
    const container = document.getElementById('roadmapContainer');

    let roadmapHTML = `
        <div class="roadmap-header">
            <h3>${roadmapData.roadmap_title}</h3>
            <p><strong>Duration:</strong> ${roadmapData.total_duration}</p>
        </div>
    `;

    if (roadmapData.overview) {
        roadmapHTML += `
            <div class="roadmap-overview">
                <h4>📋 Overview</h4>
                <div class="overview-grid">
                    <div class="overview-item">
                        <strong>Starting Level:</strong> ${roadmapData.overview.starting_level || roadmapData.overview.current_level}
                    </div>
                    <div class="overview-item">
                        <strong>Target Role:</strong> ${roadmapData.overview.target_role}
                    </div>
                    <div class="overview-item">
                        <strong>Duration:</strong> ${roadmapData.overview.duration}
                    </div>
                </div>
            </div>
        `;
    }

    if (roadmapData.skills_matrix) {
        roadmapHTML += `
            <div class="skills-matrix">
                <h4>🎯 Skills Matrix</h4>
                <div class="skills-categories">
                    <div class="skill-category">
                        <h5>Technical Skills</h5>
                        <div class="skills-list">
                            ${roadmapData.skills_matrix.technical_skills.map(skill => 
                                `<span class="skill-tag">${skill}</span>`
                            ).join('')}
                        </div>
                    </div>
                    <div class="skill-category">
                        <h5>Soft Skills</h5>
                        <div class="skills-list">
                            ${roadmapData.skills_matrix.soft_skills.map(skill => 
                                `<span class="skill-tag">${skill}</span>`
                            ).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    roadmapHTML += '<div class="roadmap-phases">';

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
                                `<li><strong>${resource.name}</strong> (${resource.type})${resource.description ? ' - ' + resource.description : ''}</li>`
                            ).join('')}
                        </ul>
                    </div>
                    <div class="projects-section">
                        <h5>Project Ideas:</h5>
                        <ul>
                            ${phase.projects.map(project => `<li>${project}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="milestones-section">
                        <h5>Key Milestones:</h5>
                        <ul>
                            ${phase.milestones.map(milestone => `<li>${milestone}</li>`).join('')}
                        </ul>
                    </div>
                    ${phase.assessment ? `
                        <div class="assessment-section">
                            <h5>Assessment:</h5>
                            <p>${phase.assessment}</p>
                        </div>
                    ` : ''}
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
    const studentCardModal = document.getElementById('studentCardModal');

    if (event.target === taskModal) {
        closeTaskModal();
    }
    if (event.target === roadmapModal) {
        closeRoadmapModal();
    }
    if (event.target === studentCardModal) {
        closeStudentCard();
    }
}
