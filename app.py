from flask import Flask, render_template, request, jsonify
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from groq import Groq
from datetime import datetime, timedelta
import json
import jwt
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import re

load_dotenv()

app = Flask(__name__)
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-this')

# Initialize Supabase client
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')
supabase: Client = create_client(supabase_url, supabase_key)

# Initialize Groq client
groq_client = Groq(api_key=os.getenv('GROQ_API_KEY'))


# Authentication decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        try:
            if token.startswith('Bearer '):
                token = token[7:]
            data = jwt.decode(token, app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
            current_user_id = data['user_id']
        except Exception as e:
            return jsonify({'error': 'Token is invalid'}), 401
        return f(current_user_id, *args, **kwargs)

    return decorated


# Routes
@app.route('/')
def home():
    return render_template('auth.html')


@app.route('/dashboard')
def dashboard():
    return render_template('index.html')


@app.route('/auth')
def auth():
    return render_template('auth.html')


# Authentication routes
@app.route('/api/auth/signup', methods=['POST'])
def signup():
    try:
        data = request.json
        print(f"Received signup data: {data}")

        # Check if user exists
        existing_user = supabase.table('users').select("*").eq('email', data['email']).execute()
        if existing_user.data:
            return jsonify({'error': 'User already exists'}), 400

        # Create base user data WITHOUT explicit id (let it auto-increment)
        user_data = {
            'name': data.get('name'),
            'email': data.get('email'),
            'education_level': data.get('education_level'),
            'password_hash': generate_password_hash(data.get('password')),
            'created_at': datetime.now().isoformat()
        }

        # Add education-specific fields
        education_level = data.get('education_level')

        if education_level == 'school':
            user_data.update({
                'school_grade': data.get('school_grade'),
                'institution_name': data.get('institution_name'),
                'field_of_study': data.get('field_of_study', 'General'),
                'academic_year': None
            })
        elif education_level == 'college':
            user_data.update({
                'academic_year': data.get('academic_year'),
                'field_of_study': data.get('field_of_study'),
                'institution_name': data.get('institution_name'),
                'school_grade': None
            })
        else:
            user_data.update({
                'academic_year': None,
                'field_of_study': 'General',
                'institution_name': None,
                'school_grade': None
            })

        print(f"Attempting to insert user data: {user_data}")

        # Insert user data (id will be auto-generated)
        response = supabase.table('users').insert(user_data).execute()
        print(f"Supabase response: {response}")

        if response.data:
            return jsonify({'message': 'User created successfully'}), 201
        else:
            return jsonify({'error': 'Failed to create user'}), 500

    except Exception as e:
        print(f"Signup error: {str(e)}")
        return jsonify({'error': f'Signup failed: {str(e)}'}), 500


@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.json

        # Get user
        user_response = supabase.table('users').select("*").eq('email', data['email']).execute()
        if not user_response.data:
            return jsonify({'error': 'Invalid credentials'}), 401

        user = user_response.data[0]

        # Check password
        if not check_password_hash(user['password_hash'], data['password']):
            return jsonify({'error': 'Invalid credentials'}), 401

        # Generate token
        token = jwt.encode({
            'user_id': user['id'],
            'exp': datetime.utcnow() + timedelta(days=30)
        }, app.config['JWT_SECRET_KEY'])

        # Remove password hash from user data
        user.pop('password_hash', None)

        return jsonify({
            'token': token,
            'user': user
        })

    except Exception as e:
        print(f"Login error: {str(e)}")
        return jsonify({'error': f'Login failed: {str(e)}'}), 500


# Task management routes
@app.route('/api/tasks', methods=['GET'])
@token_required
def get_tasks(current_user_id):
    try:
        response = supabase.table('tasks').select("*").eq('user_id', current_user_id).order('created_at',
                                                                                            desc=True).execute()
        return jsonify(response.data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/tasks', methods=['POST'])
@token_required
def create_task(current_user_id):
    try:
        data = request.json
        task_data = {
            'user_id': current_user_id,
            'title': data['title'],
            'description': data.get('description', ''),
            'due_date': data['due_date'],
            'due_time': data.get('due_time', '23:59'),  # Default to end of day
            'priority': data.get('priority', 'medium'),
            'status': 'pending',
            'created_at': datetime.now().isoformat()
        }

        response = supabase.table('tasks').insert(task_data).execute()
        return jsonify(response.data[0]), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
@token_required
def update_task(current_user_id, task_id):
    try:
        data = request.json
        response = supabase.table('tasks').update(data).eq('id', task_id).eq('user_id', current_user_id).execute()
        return jsonify(response.data[0] if response.data else {})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
@token_required
def delete_task(current_user_id, task_id):
    try:
        supabase.table('tasks').delete().eq('id', task_id).eq('user_id', current_user_id).execute()
        return jsonify({'message': 'Task deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# AI task generation route
@app.route('/api/generate-ai-tasks', methods=['POST'])
@token_required
def generate_ai_tasks(current_user_id):
    try:
        data = request.json
        roadmap_data = data.get('roadmap_data', {})

        # Extract projects and milestones from roadmap
        tasks_to_create = []
        for phase in roadmap_data.get('phases', []):
            for project in phase.get('projects', []):
                tasks_to_create.append({
                    'title': f"Project: {project}",
                    'description': f"Complete this project as part of {phase.get('phase', 'learning phase')}",
                    'priority': 'medium'
                })

            for milestone in phase.get('milestones', []):
                tasks_to_create.append({
                    'title': f"Milestone: {milestone}",
                    'description': f"Achieve this milestone in {phase.get('phase', 'learning phase')}",
                    'priority': 'high'
                })

        # Create tasks with dates spread over the next month
        created_tasks = []
        base_date = datetime.now()

        for i, task_data in enumerate(tasks_to_create[:10]):  # Limit to 10 tasks
            due_date = base_date + timedelta(days=i * 3 + 1)  # Space tasks 3 days apart

            task = {
                'user_id': current_user_id,
                'title': task_data['title'],
                'description': task_data['description'],
                'due_date': due_date.strftime('%Y-%m-%d'),
                'due_time': '18:00',  # Default to 6 PM
                'priority': task_data['priority'],
                'status': 'pending',
                'created_at': datetime.now().isoformat()
            }

            response = supabase.table('tasks').insert(task).execute()
            if response.data:
                created_tasks.append(response.data[0])

        return jsonify({
            'message': f'Generated {len(created_tasks)} AI tasks successfully',
            'tasks': created_tasks
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def format_ai_response_with_tables(text):
    """Convert AI response to properly formatted HTML with tables"""

    # Split into sections
    sections = text.split('\n\n')
    formatted_html = ""

    for section in sections:
        if not section.strip():
            continue

        # Check if this looks like a table (has multiple items with similar structure)
        lines = section.split('\n')

        # Handle headers (lines starting with **)
        if section.startswith('**') and section.endswith('**'):
            header = section.replace('**', '').strip()
            formatted_html += f'<h3 class="advice-header">{header}</h3>\n'
            continue

        # Handle numbered lists that could be tables
        if any(line.strip().startswith(f'{i}.') for i in range(1, 6) for line in lines):
            # Check if it's a study schedule or comparison
            if any(keyword in section.lower() for keyword in ['month', 'week', 'schedule', 'plan', 'timeline']):
                # Create a table for schedules
                formatted_html += '<table class="advice-table">\n'
                formatted_html += '<thead><tr><th>Period</th><th>Focus Areas</th><th>Goals</th></tr></thead>\n<tbody>\n'

                for line in lines:
                    if line.strip() and line.strip()[0].isdigit():
                        # Extract period and content
                        parts = line.split(':', 1)
                        if len(parts) == 2:
                            period = parts[0].strip()
                            content = parts[1].strip()
                            # Split content into focus and goals if possible
                            if ' - ' in content:
                                focus, goals = content.split(' - ', 1)
                                formatted_html += f'<tr><td>{period}</td><td>{focus}</td><td>{goals}</td></tr>\n'
                            else:
                                formatted_html += f'<tr><td>{period}</td><td colspan="2">{content}</td></tr>\n'

                formatted_html += '</tbody></table>\n'
            else:
                # Regular numbered list
                formatted_html += '<ol class="advice-list">\n'
                for line in lines:
                    if line.strip() and line.strip()[0].isdigit():
                        content = re.sub(r'^\d+\.\s*', '', line.strip())
                        # Check for bold text
                        content = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', content)
                        formatted_html += f'<li>{content}</li>\n'
                formatted_html += '</ol>\n'

        # Handle bullet points
        elif any(line.strip().startswith('-') or line.strip().startswith('•') for line in lines):
            formatted_html += '<ul class="advice-list">\n'
            for line in lines:
                if line.strip().startswith(('-', '•')):
                    content = line.strip()[1:].strip()
                    content = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', content)
                    formatted_html += f'<li>{content}</li>\n'
            formatted_html += '</ul>\n'

        # Handle regular paragraphs
        else:
            if section.strip():
                # Format bold text
                section = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', section)
                formatted_html += f'<p class="advice-paragraph">{section.strip()}</p>\n'

    return formatted_html


# Career counseling route with enhanced formatting
@app.route('/api/career-advice', methods=['POST'])
@token_required
def get_career_advice(current_user_id):
    try:
        data = request.json
        user_input = data.get('input', '')

        # Get user education info for context
        user_response = supabase.table('users').select(
            "education_level, academic_year, school_grade, field_of_study").eq('id', current_user_id).execute()
        user_info = user_response.data[0] if user_response.data else {}

        # Create education-aware prompt
        education_context = ""
        if user_info.get('education_level') == 'school':
            education_context = f"The student is in {user_info.get('school_grade', 'school')} studying {user_info.get('field_of_study', 'general subjects')}."
        elif user_info.get('education_level') == 'college':
            education_context = f"The student is in {user_info.get('academic_year', 'college')} studying {user_info.get('field_of_study', 'their chosen field')}."

        prompt = f"""You are an AI career counselor for students. {education_context}

Based on the following student input, provide personalized career guidance in a well-structured format similar to ChatGPT:

Student Input: {user_input}

Please provide a comprehensive response with clear sections and tables where appropriate:

**Career Path Suggestions**
Provide 3-4 career options with brief descriptions

**Skills Development Plan**
Create a table with skills, priority level, and learning resources

**Study Schedule** (if exam-related)
Create a detailed month-wise or week-wise study plan in table format

**Recommended Resources**
List courses, books, and platforms with descriptions

**Timeline & Milestones**
Provide a clear timeline with specific milestones

**Action Steps**
Give immediate next steps to take

Format your response with clear headings using ** and create tables for schedules, comparisons, and structured data. Use numbered lists for sequential steps and bullet points for features/benefits."""

        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama3-8b-8192",
            temperature=0.7,
            max_tokens=1500
        )

        ai_response = chat_completion.choices[0].message.content

        # Format the response with tables and proper structure
        formatted_response = format_ai_response_with_tables(ai_response)

        # Save to database
        advice_data = {
            'user_id': current_user_id,
            'user_input': user_input,
            'ai_response': ai_response,
            'created_at': datetime.now().isoformat()
        }
        supabase.table('career_advice').insert(advice_data).execute()

        return jsonify({'advice': formatted_response})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Learning Roadmap Generator with enhanced formatting
@app.route('/api/roadmap/generate', methods=['POST'])
@token_required
def generate_roadmap(current_user_id):
    try:
        data = request.json
        career_goal = data['career_goal']
        current_level = data['current_level']
        timeframe = data['timeframe']
        interests = data.get('specific_interests', '')

        # Get user education info
        user_response = supabase.table('users').select(
            "education_level, academic_year, school_grade, field_of_study").eq('id', current_user_id).execute()
        user_info = user_response.data[0] if user_response.data else {}

        education_context = ""
        if user_info.get('education_level') == 'school':
            education_context = f"The student is currently in {user_info.get('school_grade', 'school')}."
        elif user_info.get('education_level') == 'college':
            education_context = f"The student is currently in {user_info.get('academic_year', 'college')} studying {user_info.get('field_of_study')}."

        prompt = f"""Generate a comprehensive learning roadmap for a {current_level} level student who wants to become a {career_goal} within {timeframe}. {education_context}

Current skills and interests: {interests}

Create a detailed roadmap with the following structure:

**Roadmap Overview**
- Title: Path to {career_goal}
- Duration: {timeframe}
- Starting Level: {current_level}

**Phase-wise Learning Plan**
For each phase, include:
1. Phase name and duration
2. Core skills to develop
3. Recommended resources (courses, books, tutorials)
4. Hands-on projects
5. Key milestones
6. Assessment criteria

**Skills Development Matrix**
Create a table showing:
- Skill Category
- Beginner Level Tasks
- Intermediate Level Tasks  
- Advanced Level Tasks
- Timeline

**Project Portfolio**
List 5-7 projects of increasing complexity with:
- Project name
- Skills practiced
- Estimated time
- Difficulty level

**Resource Library**
Categorize resources as:
- Free Online Courses
- Paid Certifications
- Books & Documentation
- Practice Platforms
- Community & Networking

Format as JSON but make it comprehensive and structured like a professional learning guide."""

        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama3-8b-8192",
            temperature=0.3,
            max_tokens=2000
        )

        ai_response = chat_completion.choices[0].message.content

        # Try to parse JSON, provide enhanced fallback if needed
        try:
            json_start = ai_response.find('{')
            json_end = ai_response.rfind('}') + 1
            if json_start != -1 and json_end != -1:
                json_str = ai_response[json_start:json_end]
                roadmap_data = json.loads(json_str)
            else:
                raise ValueError("No JSON found in response")
        except:
            # Enhanced fallback with more comprehensive structure
            roadmap_data = {
                "roadmap_title": f"Complete Path to {career_goal}",
                "overview": {
                    "duration": timeframe,
                    "starting_level": current_level,
                    "target_role": career_goal
                },
                "phases": [
                    {
                        "phase": "Phase 1: Foundation Building",
                        "duration": "1-2 months",
                        "skills": ["Programming Fundamentals", "Problem Solving", "Basic Mathematics",
                                   "Version Control"],
                        "resources": [
                            {"name": "FreeCodeCamp", "type": "course", "url": "https://freecodecamp.org"},
                            {"name": "Codecademy", "type": "course", "url": "https://codecademy.com"},
                            {"name": "Git Handbook", "type": "documentation", "description": "Learn version control"}
                        ],
                        "projects": ["Personal Portfolio Website", "Simple Calculator", "Basic To-Do App"],
                        "milestones": ["Complete programming basics", "Build first project",
                                       "Set up development environment"],
                        "assessment": "Build a functional web application with basic CRUD operations"
                    },
                    {
                        "phase": "Phase 2: Skill Development",
                        "duration": "2-3 months",
                        "skills": ["Data Structures", "Algorithms", "Database Management", "API Development"],
                        "resources": [
                            {"name": "LeetCode", "type": "practice", "url": "https://leetcode.com"},
                            {"name": "System Design Primer", "type": "guide",
                             "description": "Learn system design basics"}
                        ],
                        "projects": ["Full-stack Web Application", "REST API", "Database-driven Project"],
                        "milestones": ["Master core algorithms", "Build complex applications", "Deploy projects"],
                        "assessment": "Create a full-stack application with user authentication and database"
                    },
                    {
                        "phase": "Phase 3: Specialization",
                        "duration": "2-3 months",
                        "skills": ["Advanced Frameworks", "Cloud Technologies", "DevOps Basics", "Testing"],
                        "resources": [
                            {"name": "AWS Free Tier", "type": "platform", "description": "Learn cloud deployment"},
                            {"name": "Docker Documentation", "type": "documentation", "description": "Containerization"}
                        ],
                        "projects": ["Microservices Architecture", "Cloud-deployed Application", "CI/CD Pipeline"],
                        "milestones": ["Deploy to cloud", "Implement testing", "Master chosen framework"],
                        "assessment": "Build and deploy a scalable application with proper testing and CI/CD"
                    }
                ],
                "skills_matrix": {
                    "technical_skills": ["Programming", "Databases", "Cloud", "Testing"],
                    "soft_skills": ["Communication", "Problem Solving", "Teamwork", "Time Management"]
                },
                "total_duration": timeframe,
                "difficulty_progression": "Beginner → Intermediate → Advanced → Expert"
            }

        # Save roadmap to database
        roadmap_record = {
            'user_id': current_user_id,
            'career_goal': career_goal,
            'current_level': current_level,
            'timeframe': timeframe,
            'roadmap_data': json.dumps(roadmap_data),
            'created_at': datetime.now().isoformat()
        }

        supabase.table('learning_roadmaps').insert(roadmap_record).execute()

        return jsonify(roadmap_data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/roadmap/user', methods=['GET'])
@token_required
def get_user_roadmaps(current_user_id):
    try:
        response = supabase.table('learning_roadmaps').select("*").eq('user_id', current_user_id).order('created_at',
                                                                                                        desc=True).execute()
        roadmaps = []
        for roadmap in response.data:
            try:
                roadmap['roadmap_data'] = json.loads(roadmap['roadmap_data'])
                roadmaps.append(roadmap)
            except:
                continue
        return jsonify(roadmaps)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# User profile routes
@app.route('/api/user/profile', methods=['GET'])
@token_required
def get_user_profile(current_user_id):
    try:
        user_response = supabase.table('users').select(
            "id, name, email, education_level, academic_year, school_grade, field_of_study, institution_name").eq('id',
                                                                                                                  current_user_id).execute()
        if user_response.data:
            return jsonify(user_response.data[0])
        else:
            return jsonify({'error': 'User not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/user/profile', methods=['PUT'])
@token_required
def update_user_profile(current_user_id):
    try:
        data = request.json
        # Remove sensitive fields that shouldn't be updated
        data.pop('password', None)
        data.pop('password_hash', None)
        data.pop('id', None)
        data.pop('created_at', None)

        response = supabase.table('users').update(data).eq('id', current_user_id).execute()
        if response.data:
            return jsonify(response.data[0])
        else:
            return jsonify({'error': 'Failed to update profile'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Analytics route
@app.route('/api/analytics', methods=['GET'])
@token_required
def get_analytics(current_user_id):
    try:
        # Get tasks analytics
        tasks_response = supabase.table('tasks').select("*").eq('user_id', current_user_id).execute()
        tasks = tasks_response.data

        total_tasks = len(tasks)
        completed_tasks = len([t for t in tasks if t['status'] == 'completed'])
        pending_tasks = len([t for t in tasks if t['status'] == 'pending'])
        overdue_tasks = len([t for t in tasks if t['status'] == 'pending' and datetime.fromisoformat(
            t['due_date'].replace('Z', '+00:00')) < datetime.now()])

        # Get career advice count
        advice_response = supabase.table('career_advice').select("id").eq('user_id', current_user_id).execute()
        advice_count = len(advice_response.data)

        # Get roadmaps count
        roadmaps_response = supabase.table('learning_roadmaps').select("id").eq('user_id', current_user_id).execute()
        roadmaps_count = len(roadmaps_response.data)

        productivity_score = round((completed_tasks / total_tasks * 100) if total_tasks > 0 else 0)

        analytics = {
            'total_tasks': total_tasks,
            'completed_tasks': completed_tasks,
            'pending_tasks': pending_tasks,
            'overdue_tasks': overdue_tasks,
            'productivity_score': productivity_score,
            'career_advice_sessions': advice_count,
            'learning_roadmaps': roadmaps_count
        }

        return jsonify(analytics)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
