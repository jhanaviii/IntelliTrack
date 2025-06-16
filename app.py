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


# Career counseling route
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

Based on the following student input, provide personalized career guidance:

Student Input: {user_input}

Please provide:
1. Career path suggestions (3-4 options appropriate for their education level)
2. Skills to develop
3. Recommended courses/certifications
4. Potential internship areas (if applicable)
5. Next steps to take

Keep your response practical, encouraging, and actionable. Consider their current education level when making suggestions. Format it in a clear, structured way."""

        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama3-8b-8192",
            temperature=0.7,
            max_tokens=1000
        )

        ai_response = chat_completion.choices[0].message.content

        # Save to database
        advice_data = {
            'user_id': current_user_id,
            'user_input': user_input,
            'ai_response': ai_response,
            'created_at': datetime.now().isoformat()
        }
        supabase.table('career_advice').insert(advice_data).execute()

        return jsonify({'advice': ai_response})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Learning Roadmap Generator
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

        prompt = f"""Generate a detailed learning roadmap for a {current_level} level student who wants to become a {career_goal} within {timeframe}. {education_context}

Specific interests: {interests}

Please provide a structured roadmap with:
1. Learning phases appropriate for their education level
2. Essential skills and technologies
3. Recommended courses/resources (include both free and paid options)
4. Project ideas suitable for their level
5. Timeline milestones

Format the response as JSON with this structure:
{{
    "roadmap_title": "Path to {career_goal}",
    "phases": [
        {{
            "phase": "Phase 1: Foundation",
            "duration": "2-3 months",
            "skills": ["skill1", "skill2"],
            "resources": [
                {{"name": "Course Name", "type": "course", "url": ""}},
                {{"name": "Book Name", "type": "book", "description": "desc"}}
            ],
            "projects": ["project1", "project2"],
            "milestones": ["milestone1", "milestone2"]
        }}
    ],
    "total_duration": "{timeframe}",
    "difficulty_progression": "Beginner → Intermediate → Advanced"
}}"""

        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama3-8b-8192",
            temperature=0.3,
            max_tokens=1500
        )

        ai_response = chat_completion.choices[0].message.content

        # Try to parse JSON, provide fallback if needed
        try:
            json_start = ai_response.find('{')
            json_end = ai_response.rfind('}') + 1
            if json_start != -1 and json_end != -1:
                json_str = ai_response[json_start:json_end]
                roadmap_data = json.loads(json_str)
            else:
                raise ValueError("No JSON found in response")
        except:
            roadmap_data = {
                "roadmap_title": f"Path to {career_goal}",
                "phases": [
                    {
                        "phase": "Phase 1: Foundation",
                        "duration": "2-3 months",
                        "skills": ["Programming Fundamentals", "Problem Solving"],
                        "resources": [
                            {"name": "Online Coding Bootcamp", "type": "course"},
                            {"name": "Algorithm Design Manual", "type": "book"}
                        ],
                        "projects": ["Personal Portfolio", "Simple Web App"],
                        "milestones": ["Complete basic programming course", "Build first project"]
                    }
                ],
                "total_duration": timeframe,
                "difficulty_progression": "Beginner → Intermediate → Advanced"
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


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
