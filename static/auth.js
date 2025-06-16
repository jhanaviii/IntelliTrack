const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in
    if (localStorage.getItem('user_token')) {
        window.location.href = '/dashboard';
    }

    // Setup form handlers
    document.getElementById('loginFormElement').addEventListener('submit', handleLogin);
    document.getElementById('signupFormElement').addEventListener('submit', handleSignup);
});

function switchToSignup() {
    document.getElementById('loginForm').classList.remove('active');
    document.getElementById('signupForm').classList.add('active');
}

function switchToLogin() {
    document.getElementById('signupForm').classList.remove('active');
    document.getElementById('loginForm').classList.add('active');
}

function toggleEducationFields() {
    const educationLevel = document.getElementById('educationLevel').value;
    const schoolFields = document.getElementById('schoolFields');
    const collegeFields = document.getElementById('collegeFields');

    // Hide both field groups first
    schoolFields.style.display = 'none';
    collegeFields.style.display = 'none';

    // Clear required attributes
    clearRequiredFields();

    if (educationLevel === 'school') {
        schoolFields.style.display = 'block';
        // Set required for school fields
        document.getElementById('schoolGrade').required = true;
        document.getElementById('schoolName').required = true;
    } else if (educationLevel === 'college') {
        collegeFields.style.display = 'block';
        // Set required for college fields
        document.getElementById('academicYear').required = true;
        document.getElementById('fieldOfStudy').required = true;
        document.getElementById('collegeName').required = true;
    }
}

function clearRequiredFields() {
    // Remove required from all conditional fields
    const conditionalFields = [
        'schoolGrade', 'schoolName', 'schoolStream',
        'academicYear', 'fieldOfStudy', 'collegeName'
    ];

    conditionalFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.required = false;
            field.value = '';
        }
    });
}

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('user_token', data.token);
            localStorage.setItem('user_data', JSON.stringify(data.user));
            showNotification('Login successful!', 'success');
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1000);
        } else {
            showNotification(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        showNotification('Network error. Please try again.', 'error');
    }
}

async function handleSignup(e) {
    e.preventDefault();

    const educationLevel = document.getElementById('educationLevel').value;

    let userData = {
        name: document.getElementById('signupName').value,
        email: document.getElementById('signupEmail').value,
        education_level: educationLevel,
        password: document.getElementById('signupPassword').value
    };

    // Add education-specific fields
    if (educationLevel === 'school') {
        userData.school_grade = document.getElementById('schoolGrade').value;
        userData.institution_name = document.getElementById('schoolName').value;
        userData.field_of_study = document.getElementById('schoolStream').value || 'General';
        userData.academic_year = null; // Not applicable for school students
    } else if (educationLevel === 'college') {
        userData.academic_year = document.getElementById('academicYear').value;
        userData.field_of_study = document.getElementById('fieldOfStudy').value;
        userData.institution_name = document.getElementById('collegeName').value;
        userData.school_grade = null; // Not applicable for college students
    }

    try {
        const response = await fetch(`${API_BASE}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('Account created successfully! Please login.', 'success');
            switchToLogin();
            // Clear form
            document.getElementById('signupFormElement').reset();
            clearRequiredFields();
            document.getElementById('schoolFields').style.display = 'none';
            document.getElementById('collegeFields').style.display = 'none';
        } else {
            showNotification(data.error || 'Signup failed', 'error');
        }
    } catch (error) {
        showNotification('Network error. Please try again.', 'error');
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
