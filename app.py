import os
import re
import psycopg2
from flask import Flask, request, jsonify
from twilio.twiml.messaging_response import MessagingResponse
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Database connection function
def get_db_connection():
    return psycopg2.connect(os.getenv('DATABASE_URL'))

# Student add karna
def add_student(phone, name=None):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO students (phone, name) 
            VALUES (%s, %s) 
            ON CONFLICT (phone) DO NOTHING
        ''', (phone, name))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print("Error adding student:", e)

# Assignment add karna
def add_assignment_db(phone, task, deadline, course='General'):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO assignments (phone, task, deadline, course)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        ''', (phone, task, deadline, course))
        assignment_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        return assignment_id
    except Exception as e:
        print("Error adding assignment:", e)
        return None

# Pending assignments lena
def get_pending_assignments_db(phone):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            SELECT id, task, deadline, course 
            FROM assignments 
            WHERE phone = %s AND completed = FALSE
            ORDER BY deadline
        ''', (phone,))
        assignments = cur.fetchall()
        cur.close()
        conn.close()
        return assignments
    except Exception as e:
        print("Error getting assignments:", e)
        return []

# Assignment complete karna
def complete_assignment_db(assignment_id, phone):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            UPDATE assignments 
            SET completed = TRUE 
            WHERE id = %s AND phone = %s
        ''', (assignment_id, phone))
        conn.commit()
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print("Error completing assignment:", e)
        return False

# Deadline parse karna
def parse_deadline(text):
    text = text.lower()
    
    if 'today' in text:
        return datetime.now().strftime('%Y-%m-%d')
    
    if 'tomorrow' in text:
        return (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
    
    days = {
        'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
        'friday': 4, 'saturday': 5, 'sunday': 6
    }
    
    for day_name, day_num in days.items():
        if day_name in text:
            today_num = datetime.now().weekday()
            days_until = (day_num - today_num) % 7
            if days_until == 0:
                days_until = 7
            return (datetime.now() + timedelta(days=days_until)).strftime('%Y-%m-%d')
    
    return (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')

@app.route('/webhook', methods=['POST'])
def whatsapp_webhook():
    incoming_msg = request.values.get('Body', '').strip()
    sender = request.values.get('From', '')
    phone_number = sender.replace('whatsapp:', '')
    
    # New student ko register karna
    add_student(phone_number)
    
    resp = MessagingResponse()
    msg = resp.message()
    
    if incoming_msg == '#help' or incoming_msg == 'help':
        help_text = """📚 *College WhatsApp Bot* 🇵🇰

*Commands:*
#tugas - Saare assignments dekhein
#todo - Pending assignments
#add [task] - Naya assignment add karein
#done [number] - Assignment complete karein
#today - Aaj ke deadlines
#week - Iss week ke deadlines

*Examples:*
#add Database Project deadline Friday
#done 2
#today

*Tip:* Main aapke assignments yaad rakhunga!"""
        msg.body(help_text)
    
    elif incoming_msg.startswith('#add'):
        assignment_text = incoming_msg.replace('#add', '').strip()
        
        if not assignment_text:
            msg.body("❌ Assignment likhna bhool gaye!\n\nExample: #add AI Assignment deadline Monday")
        else:
            deadline = parse_deadline(assignment_text)
            task = re.sub(r'deadline\s+\w+', '', assignment_text).strip()
            if not task:
                task = assignment_text
            
            add_assignment_db(phone_number, task, deadline)
            msg.body(f"✅ *Assignment Add Ho Gaya!*\n\n📚 {task}\n📅 Due: {deadline}\n\n#tugas se saare assignments dekhein.")
    
    elif incoming_msg.startswith('#tugas') or incoming_msg.startswith('#todo'):
        pending = get_pending_assignments_db(phone_number)
        
        if not pending:
            msg.body("🎉 *Koi pending assignment nahi!* 🎉\n\nBohat acha kaam kar rahe ho! 👍")
        else:
            response = "📝 *Aapke Assignments*\n\n"
            for i, assign in enumerate(pending, 1):
                response += f"{i}. *{assign[1]}*\n"
                response += f"   📅 Due: {assign[2]}\n"
                if assign[3] != 'General':
                    response += f"   📚 Course: {assign[3]}\n"
                response += "\n"
            
            response += f"Total: {len(pending)} pending\n"
            response += "#done [number] se complete karein"
            msg.body(response)
    
    elif incoming_msg.startswith('#done'):
        try:
            num = int(incoming_msg.replace('#done', '').strip())
            pending = get_pending_assignments_db(phone_number)
            
            if 1 <= num <= len(pending):
                assignment_id = pending[num-1][0]
                complete_assignment_db(assignment_id, phone_number)
                msg.body(f"✅ *Mubarak ho!*\n\n{pending[num-1][1]} complete ho gaya! 🎉")
            else:
                msg.body(f"❌ Galat number. #tugas se dekhein (1-{len(pending)})")
        except ValueError:
            msg.body("❌ Tarika: #done [number]\n\nExample: #done 1")
    
    elif incoming_msg.startswith('#today'):
        today = datetime.now().strftime('%Y-%m-%d')
        pending = get_pending_assignments_db(phone_number)
        due_today = [a for a in pending if a[2] == today]
        
        if due_today:
            response = "⏰ *Aaj Deadline Hai!*\n\n"
            for assign in due_today:
                response += f"📚 {assign[1]}\n"
            msg.body(response + "\nJaldi submit karein! 🚀")
        else:
            msg.body("🎉 *Aaj koi deadline nahi!*\n\nAaram karo ya agay ka kaam karo 😊")
    
    elif incoming_msg.startswith('#week'):
        today = datetime.now()
        week_later = today + timedelta(days=7)
        pending = get_pending_assignments_db(phone_number)
        
        due_this_week = []
        for assign in pending:
            try:
                deadline_date = datetime.strptime(assign[2], '%Y-%m-%d')
                if today <= deadline_date <= week_later:
                    due_this_week.append(assign)
            except:
                pass
        
        if due_this_week:
            response = "📅 *Iss Week Mein Due Hai*\n\n"
            for assign in due_this_week:
                response += f"• {assign[1]}\n"
                response += f"  📅 {assign[2]}\n\n"
            msg.body(response)
        else:
            msg.body("🎉 *Iss week koi deadline nahi!*\n\nMaze karo! 😊")
    
    else:
        msg.body("👋 *Assalam-o-Alaikum!*\n\nMain aapka College Bot hoon.\n\n#help type karein saari commands dekhne ke liye.\n\n#add [task] se assignment add karein, main deadline yaad dila doonga!")
    
    return str(resp)

@app.route('/dashboard', methods=['GET'])
def dashboard():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT COUNT(*) FROM students")
        total_students = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM assignments WHERE completed = FALSE")
        pending = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM assignments")
        total_assignments = cur.fetchone()[0]
        
        cur.close()
        conn.close()
        
        return jsonify({
            'status': 'Bot chal raha hai! ✅',
            'total_students': total_students,
            'total_assignments': total_assignments,
            'pending_assignments': pending
        })
    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'bot': 'College WhatsApp Bot',
        'status': 'Active',
        'message': 'Bot ready hai!'
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)