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


# WORKING Authentication routes (your original code)
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


@app.route('/api/tasks/<int:task_id>', methods=['PATCH'])
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


# NEW: AI Timeline Generation for Tasks
@app.route('/api/tasks/ai-timeline', methods=['POST'])
@token_required
def generate_task_timeline(current_user_id):
    try:
        data = request.json
        title = data.get('title', '')
        description = data.get('description', '')
        priority = data.get('priority', 'medium')

        prompt = f"""Analyze this student task and provide a realistic timeline estimate:

Task: {title}
Description: {description}
Priority: {priority}

Please provide:
1. **Estimated Time to Complete** (be specific - hours/days)
2. **Suggested Breakdown** (subtasks in table format)
3. **Dependencies & Considerations**
4. **Tips for Efficient Completion**

Format your response with HTML tables and clear sections."""

        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama3-8b-8192",
            temperature=0.7,
            max_tokens=1000
        )

        ai_response = chat_completion.choices[0].message.content
        formatted_response = format_ai_response_with_tables(ai_response)

        return jsonify({'timeline': formatted_response})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def format_ai_response_with_tables(response):
    """Enhanced formatting function for AI responses with proper HTML tables"""

    # Convert markdown headers to HTML
    response = re.sub(r'\*\*(.*?)\*\*', r'<h3>\1</h3>', response)
    response = re.sub(r'#{1,3}\s*(.*?)(?:\n|$)', r'<h3>\1</h3>', response)

    # Convert markdown tables to HTML tables
    lines = response.split('\n')
    formatted_lines = []
    in_table = False

    for i, line in enumerate(lines):
        if '|' in line and line.strip().startswith('|') and line.strip().endswith('|'):
            if not in_table:
                formatted_lines.append('<table style="width:100%; border-collapse: collapse; margin: 1rem 0;">')
                in_table = True
                # Header row
                cells = [cell.strip() for cell in line.split('|')[1:-1]]
                formatted_lines.append('<thead><tr>')
                for cell in cells:
                    formatted_lines.append(
                        f'<th style="background: rgba(102,126,234,0.3); color: #667eea; padding: 0.8rem; border: 1px solid rgba(102,126,234,0.2); text-align: left;">{cell}</th>')
                formatted_lines.append('</tr></thead><tbody>')
            elif line.strip().startswith('|') and '---' not in line:
                # Data row
                cells = [cell.strip() for cell in line.split('|')[1:-1]]
                formatted_lines.append('<tr>')
                for cell in cells:
                    formatted_lines.append(
                        f'<td style="padding: 0.8rem; border: 1px solid rgba(102,126,234,0.1); vertical-align: top;">{cell}</td>')
                formatted_lines.append('</tr>')
        else:
            if in_table:
                formatted_lines.append('</tbody></table>')
                in_table = False
            if line.strip() and '---' not in line:
                formatted_lines.append(f'<p style="margin-bottom: 1rem; line-height: 1.6;">{line}</p>')

    if in_table:
        formatted_lines.append('</tbody></table>')

    return '\n'.join(formatted_lines)


# ENHANCED: Career counseling route with ChatGPT-style formatting
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

        prompt = f"""You are an expert AI career counselor and academic advisor. {education_context}

Based on the following student query, provide comprehensive, well-structured guidance that matches the quality and formatting of ChatGPT responses:

Student Query: {user_input}

IMPORTANT FORMATTING REQUIREMENTS:
1. Use proper markdown formatting with headers (##, ###)
2. Create detailed tables using markdown table syntax
3. Use bullet points and numbered lists appropriately
4. Structure your response with clear sections
5. Make tables comprehensive with multiple columns and detailed information
6. Use emojis strategically for visual appeal
7. Provide actionable, specific advice

Structure your response with sections like:
- **🔥 Strategy Overview** (with emoji headers)
- **📅 Detailed Plan** (with comprehensive tables)
- **📚 Resources & Tools** (categorized tables)
- **💡 Action Steps** (numbered list)
- **🧠 Tips for Success**

Make sure tables have proper headers, multiple columns, and detailed content. Format everything in clean markdown that will render beautifully."""

        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama3-8b-8192",
            temperature=0.7,
            max_tokens=2500
        )

        ai_response = chat_completion.choices[0].message.content

        # Enhanced HTML formatting
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


# ENHANCED: Learning Roadmap Generator with AI
@app.route('/api/roadmap/generate', methods=['POST'])
@token_required
def generate_roadmap(current_user_id):
    try:
        data = request.json
        career_goal = data['career_goal']
        current_level = data['current_level']
        timeframe = data['timeframe']
        interests = data.get('skills', [])  # Updated to handle array of skills

        # Get user education info
        user_response = supabase.table('users').select(
            "education_level, academic_year, school_grade, field_of_study").eq('id', current_user_id).execute()
        user_info = user_response.data[0] if user_response.data else {}

        education_context = ""
        if user_info.get('education_level') == 'school':
            education_context = f"The student is currently in {user_info.get('school_grade', 'school')}."
        elif user_info.get('education_level') == 'college':
            education_context = f"The student is currently in {user_info.get('academic_year', 'college')} studying {user_info.get('field_of_study')}."

        skills_text = ', '.join(interests) if isinstance(interests, list) else str(interests)

        prompt = f"""Create a comprehensive, professional learning roadmap for becoming a {career_goal}.

Student Context: {education_context}
Current Level: {current_level}
Timeframe: {timeframe}
Current Skills/Interests: {skills_text}

Generate a detailed roadmap with the following structure using markdown formatting:

## 🚀 {career_goal} Learning Roadmap

### 📊 Overview
| Aspect | Details |
|--------|---------|
| Duration | {timeframe} |
| Starting Level | {current_level} |
| Target Role | {career_goal} |
| Total Phases | 3-4 phases |

### 📅 Phase-wise Learning Plan

#### 🔹 Phase 1: Foundation (Month 1-X)
**Skills to Develop:**
- Skill 1
- Skill 2
- Skill 3

**Resources:**
| Resource | Type | Description |
|----------|------|-------------|
| Resource 1 | Course | Detailed description |
| Resource 2 | Book | Detailed description |

**Projects:**
- Project 1
- Project 2

**Milestones:**
- Milestone 1
- Milestone 2

#### 🔹 Phase 2: Development (Month X-Y)
[Similar structure]

#### 🔹 Phase 3: Specialization (Month Y-Z)
[Similar structure]

### 🎯 Skills Matrix
| Technical Skills | Soft Skills |
|------------------|-------------|
| Programming | Communication |
| Databases | Problem Solving |

### 📚 Resource Library
| Category | Resources |
|----------|-----------|
| Free Courses | List of free courses |
| Paid Certifications | List of certifications |
| Books | List of books |
| Practice Platforms | List of platforms |

### 💡 Final Tips
- Tip 1
- Tip 2
- Tip 3

Make this comprehensive, realistic, and tailored to the student's level and timeframe."""

        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama3-8b-8192",
            temperature=0.3,
            max_tokens=3000
        )

        ai_response = chat_completion.choices[0].message.content
        formatted_response = format_ai_response_with_tables(ai_response)

        # Save roadmap to database
        roadmap_record = {
            'user_id': current_user_id,
            'career_goal': career_goal,
            'current_level': current_level,
            'timeframe': timeframe,
            'roadmap_data': ai_response,
            'created_at': datetime.now().isoformat()
        }
        supabase.table('learning_roadmaps').insert(roadmap_record).execute()

        return jsonify({'roadmap': formatted_response})

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
                if isinstance(roadmap['roadmap_data'], str):
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

        # Calculate overdue tasks
        overdue_tasks = 0
        for task in tasks:
            if task['status'] == 'pending':
                try:
                    due_date = datetime.fromisoformat(task['due_date'].replace('Z', '+00:00'))
                    if due_date < datetime.now():
                        overdue_tasks += 1
                except:
                    pass

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


# Health check endpoint
@app.route('/health')
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})


# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


@app.errorhandler(400)
def bad_request(error):
    return jsonify({'error': 'Bad request'}), 400


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
