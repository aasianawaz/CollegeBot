const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const qrcode = require('qrcode-terminal');

const { GoogleSpreadsheet } = require('google-spreadsheet');

const { JWT } = require('google-auth-library');

const axios = require('axios');



// --- 1. SETTINGS & CHROME PATH ---

const SPREADSHEET_ID = '1Q7tsXhgYLhNLleqZMjE4owlRm1EKgn3wFVuVW7X3k3Y'; 

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const creds = require('./credentials.json');



const serviceAccountAuth = new JWT({

    email: creds.client_email,

    key: creds.private_key,

    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'],

});



const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

const userState = {}; 

let maintenanceMode = false; 



const client = new Client({

    authStrategy: new LocalAuth(),

    puppeteer: { executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }

});



client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('ready', () => console.log('🚀 SYSTEM ONLINE: All Roles Activated!'));



// --- 2. THE MASTER ENGINE ---

client.on('message', async (msg) => {

    try {

        const sender = (await msg.getContact()).number;

        const body = msg.body.trim().toUpperCase();

        await doc.loadInfo();

        // --- CHAT LOGGING SYSTEM ---
const chatLogs = doc.sheetsByTitle['Chat_Logs'];

await chatLogs.addRow({
    Date: new Date().toLocaleDateString(),
    Time: new Date().toLocaleTimeString(),
    Number: sender,
    Message: msg.body
});

        // All Sheets Mapping

        const sMaster = doc.sheetsByTitle['Students_Master'];

        const tMaster = doc.sheetsByTitle['Teachers_Master'];

        const tAssign = doc.sheetsByTitle['Teacher_Assign_Log'];

        const mPortal = doc.sheetsByTitle['Marks_Portal'];

        const aPortal = doc.sheetsByTitle['Attendance_Records'];

        const lLogs   = doc.sheetsByTitle['Lecture_Logs'];

        const dLib    = doc.sheetsByTitle['Documents_Library'];

        const sCtrl   = doc.sheetsByTitle['System_Control'];



        // Role Detection

        const ctrlRows = await sCtrl.getRows();

        const adminPhone = ctrlRows.find(r => r.get('Feature_Name') === 'Admin_Phone').get('Value').trim();

        const isAdmin = (sender === adminPhone);

        

        // Security: Maintenance Lock

        if (maintenanceMode && !isAdmin) {

            return msg.reply("🛠️ *System Maintenance:* Server is being updated. Try after some time.");

        }



        const isTeacher = (await tMaster.getRows()).find(t => t.get('Teacher_Phone') === sender);

        const isStudent = (await sMaster.getRows()).find(s => s.get('Phone') === sender);



        // ---------------------------------------------------------

        // A. CONVERSATIONAL STATE MACHINE (Contextual Logic)

        // ---------------------------------------------------------
// ✅ MARKS ENTRY FLOW
if (state.step === 'MARKS_SUBJECT') {

    userState[sender].subject = msg.body;
    userState[sender].step = 'MARKS_ROLL';

    return msg.reply("🎓 Enter Student Roll No:");
}

if (state.step === 'MARKS_ROLL') {

    userState[sender].roll = msg.body;
    userState[sender].step = 'MARKS_TYPE';

    return msg.reply("📝 Type Exam (MID/FINAL):");
}

if (state.step === 'MARKS_TYPE') {

    userState[sender].type = msg.body;
    userState[sender].step = 'MARKS_OBTAINED';

    return msg.reply("📊 Enter Obtained Marks:");
}

if (state.step === 'MARKS_OBTAINED') {

    userState[sender].obtained = msg.body;
    userState[sender].step = 'MARKS_TOTAL';

    return msg.reply("📊 Enter Total Marks:");
}

if (state.step === 'MARKS_TOTAL') {

    const data = userState[sender];

    await mPortal.addRow({
        Roll_No: data.roll,
        Subject: data.subject,
        Exam_Type: data.type,
        Marks_Obtained: data.obtained,
        Total_Marks: msg.body,
        Semester: "8"
    });

    delete userState[sender];

    return msg.reply("✅ Marks Added Successfully!");
}

        if (userState[sender]) {

            let state = userState[sender];

            if (state.step === 'ADMIN_GET_DEPT') {

    userState[sender].dept = msg.body;
    userState[sender].step = 'ADMIN_GET_SEM';

    return msg.reply("📚 Enter Semester (1-8):");
}
if (state.step === 'ADMIN_GET_SEM') {

    const roll = state.roll;
    const dept = state.dept;
    const sem = msg.body;

    // Student basic info
    const student = (await sMaster.getRows()).find(
        s => s.get('Roll_No') === roll
    );

    // Result
    const results = (await mPortal.getRows()).filter(r =>
        r.get('Roll_No') === roll &&
        r.get('Semester') === sem
    );

    let resultText = "❌ No Result Found\n";
    if (results.length > 0) {
        resultText = "";
        results.forEach(r => {
            resultText += `• ${r.get('Subject')} (${r.get('Exam_Type')}): ${r.get('Marks_Obtained')}/${r.get('Total_Marks')}\n`;
        });
    }

    // Attendance
    const attendance = (await aPortal.getRows()).filter(a =>
        a.get('Roll_No') === roll
    );

    let attendanceText = "❌ No Attendance Record\n";
    if (attendance.length > 0) {
        attendanceText = "";
        attendance.forEach(a => {
            attendanceText += `• ${a.get('Subject')}: ${a.get('Percentage')}%\n`;
        });
    }

    // Final Response
    let rep = `👤 *STUDENT FULL PROFILE*
━━━━━━━━━━━━━━
📌 Name: ${student.get('Name')}
🎓 Roll No: ${roll}
🏫 Dept: ${dept}
📚 Semester: ${sem}

💰 Fee Status: ${student.get('Status')}

📊 *RESULT*
${resultText}

📅 *ATTENDANCE*
${attendanceText}
`;

    delete userState[sender];

    return msg.reply(rep);
}


            // Teacher Attendance Flow

            if (state.step === 'T_SELECT_CLASS') {

                const choice = parseInt(body) - 1;

                const myClasses = (await tAssign.getRows()).filter(a => a.get('Teacher_Phone') === sender);

                if (myClasses[choice]) {

                    userState[sender].activeClass = myClasses[choice];

                    userState[sender].step = 'T_INPUT_TOTAL';

                    return msg.reply(`📍 *${myClasses[choice].get('Subject')}* selected.\nEnter Total Students in Class:`);

                }

            }

            if (state.step === 'T_INPUT_TOTAL') {

                userState[sender].total = body;

                userState[sender].step = 'T_INPUT_PRESENT';

                return msg.reply(`✅ Total: ${body}. Now enter *Present Students* count:`);

            }

            if (state.step === 'T_INPUT_PRESENT') {

                const cls = state.activeClass;

                await lLogs.addRow({

                    Date: new Date().toLocaleDateString(), Teacher_Phone: sender,

                    Subject: cls.get('Subject'), Dept: cls.get('Dept'), Semester: cls.get('Semester'),

                    Total_Students: state.total, Present_Count: body

                });

                delete userState[sender];

                return msg.reply(`🎉 Attendance Logged successfully for *${cls.get('Subject')}*!`);

            }



            // Result/Attendance View Flow (Admin/Student)

            if (state.step === 'VIEW_SEM') {

                userState[sender].sem = body;

                userState[sender].step = 'VIEW_TYPE';

                return msg.reply("Semester Selected. Type *MID* or *FINAL* to view marks:");

            }

            if (state.step === 'VIEW_TYPE') {

                const results = (await mPortal.getRows()).filter(r => r.get('Roll_No') === state.roll && r.get('Semester') === state.sem && r.get('Exam_Type').toUpperCase() === body);

                delete userState[sender];

                if (results.length === 0) return msg.reply("❌ No data found.");

                let report = `📊 *RESULT CARD (${body})*\nRoll: ${state.roll}\n━━━━━━━━━━━━━━\n`;

                results.forEach(r => report += `• ${r.get('Subject')}: ${r.get('Marks_Obtained')}/${r.get('Total_Marks')}\n`);

                return msg.reply(report);

            }



            // Global Broadcast (Admin Only)

            if (state.step === 'ADMIN_BC') {

                const list = [...(await sMaster.getRows()), ...(await tMaster.getRows())];

                msg.reply(`⏳ Sending Broadcast to ${list.length} users...`);

                for (let u of list) {
   try {
      const phone = u.get('Phone') || u.get('Teacher_Phone');

      if (phone) {
         await client.sendMessage(`${phone}@c.us`, `📢 *NOTICE:*\n\n${msg.body}`);
      }

   } catch(e){}
}

                delete userState[sender];

                return msg.reply("✅ Broadcast successful.");

            }

        }



        // ---------------------------------------------------------

        // B. ROLE-BASED DASHBOARDS (Full Menu Access)

        // ---------------------------------------------------------



        // 1. ADMIN - Super Access

        if (isAdmin) {

            if (['HI', 'MENU', 'ADMIN'].includes(body)) {

                return msg.reply(`👑 *ADMIN COMMAND CENTER*\n━━━━━━━━━━━━━━━━━━━━\n📊 *STATS* - Campus Summary\n👨‍🏫 *TEACHER STATS* - Staff Performance\n📑 *VIEW LOGS* - Today's Attendance\n📢 *BROADCAST* - Message All\n🛠️ *MAINTENANCE* - Lock System\n📁 *DOCS* - Access Library\n🔍 *[ROLL_NO]* - Student Full History`);

            }

            if (body === 'STATS') {

                const students = await sMaster.getRows();

                return msg.reply(`📈 *CAMPUS STATS*\nTotal Students: ${students.length}\nPaid: ${students.filter(s => s.get('Status') === 'Paid').length}`);

            }

            if (body === 'TEACHER STATS') {

                const logs = await lLogs.getRows();

                let rep = `👨‍🏫 *TEACHER ACTIVITY*\n━━━━━━━━━━━━\nTotal Lectures Today: ${logs.filter(l => l.get('Date') === new Date().toLocaleDateString()).length}`;

                return msg.reply(rep);

            }

            if (body === 'BROADCAST') {

                userState[sender] = { step: 'ADMIN_BC' };

                return msg.reply("💬 Type the message to Broadcast:");

            }
if (body === 'DOCS') {
    const dRows = await dLib.getRows();

    if (dRows.length === 0) {
        return msg.reply("❌ No documents found.");
    }

    let list = `📁 *DOCUMENTS LIBRARY*\n━━━━━━━━━━━━━━\n`;

    dRows.forEach((d, i) => {
        list += `${i+1}. ${d.get('Doc_Name')} (${d.get('Department')} - Sem ${d.get('Semester')})\n`;
    });

    list += `\n✏️ Reply with document name to get file`;

    return msg.reply(list);
}

            if (body === 'MAINTENANCE') {

                maintenanceMode = !maintenanceMode;

                return msg.reply(`🛠️ Maintenance Mode is now: *${maintenanceMode ? 'ENABLED 🔒' : 'DISABLED 🔓'}*`);

            }
            if (body === 'VIEW LOGS') {

    const chatLogs = doc.sheetsByTitle['Chat_Logs'];
    const logs = await chatLogs.getRows();

    if (logs.length === 0) {
        return msg.reply("❌ No chat logs found.");
    }

    let rep = `📋 *USER MESSAGE LOGS*\n━━━━━━━━━━━━━━\n`;

    logs.slice(-10).forEach(l => {   // last 10 messages
        rep += `📅 ${l.get('Date')} ${l.get('Time')}
👤 ${l.get('Number')}
💬 ${l.get('Message')}

`;
    });

    return msg.reply(rep);
}

            // Search Student by Roll No

const foundStd = (await sMaster.getRows()).find(
    s => s.get('Roll_No').toUpperCase() === body
);

if (foundStd) {
    userState[sender] = {
        step: 'ADMIN_GET_DEPT',
        roll: foundStd.get('Roll_No')
    };

    return msg.reply(`👤 Student Found: *${foundStd.get('Name')}*\nEnter Department:`);
}
} // ✅ CLOSE ADMIN BLOCK


        // 2. TEACHER - Academic Access

        if (isTeacher) {
if (['HI', 'MENU', 'TEACHER'].includes(body)) {
    const t = isTeacher;

    return msg.reply(`🌟 *FACULTY PORTAL*
━━━━━━━━━━━━━━━━━━━━
Welcome, *${t.get('Designation')} ${t.get('Teacher_Name')}*!

• *MARK* - Start Attendance
• *ENTRY* - Enter Marks
• *MYCLASSES* - View Assigned Classes
• *REPORT* - Attendance Report
• *HISTORY* - Lecture History`);
}
            }

// ✅ MY CLASSES
if (body === 'MYCLASSES') {

    const myClasses = (await tAssign.getRows())
        .filter(a => a.get('Teacher_Phone') === sender);

    if (myClasses.length === 0) {
        return msg.reply("❌ No classes assigned.");
    }

    let rep = `📚 *YOUR CLASSES*\n━━━━━━━━━━━━\n`;

    myClasses.forEach((c, i) => {
        rep += `${i+1}. ${c.get('Subject')} (${c.get('Dept')} - Sem ${c.get('Semester')})\n`;
    });

    return msg.reply(rep);
}


// ✅ START MARKS ENTRY
if (body === 'ENTRY') {

    userState[sender] = { step: 'MARKS_SUBJECT' };

    return msg.reply("📘 Enter Subject Name:");
}


// ✅ REPORT
if (body === 'REPORT') {

    const logs = (await lLogs.getRows())
        .filter(l => l.get('Teacher_Phone') === sender);

    if (logs.length === 0) {
        return msg.reply("❌ No attendance record.");
    }

    let rep = `📊 *ATTENDANCE REPORT*\n━━━━━━━━━━━━\n`;

    logs.slice(-5).forEach(l => {
        rep += `📅 ${l.get('Date')}
📘 ${l.get('Subject')}
👥 ${l.get('Present_Count')}/${l.get('Total_Students')}

`;
    });

    return msg.reply(rep);
}


// ✅ HISTORY
if (body === 'HISTORY') {

    const logs = (await lLogs.getRows())
        .filter(l => l.get('Teacher_Phone') === sender);

    if (logs.length === 0) {
        return msg.reply("❌ No lecture history.");
    }

    let rep = `📚 *LECTURE HISTORY*\n━━━━━━━━━━━━\n`;

    logs.slice(-10).forEach(l => {
        rep += `📅 ${l.get('Date')} - ${l.get('Subject')} (${l.get('Dept')})\n`;
    });

    return msg.reply(rep);
}

        }



        // 3. STUDENT - Personal Portal

        if (isStudent) {

            if (['HI', 'MENU'].includes(body)) {

                return msg.reply(`🎓 *STUDENT PORTAL*\n━━━━━━━━━━━━━━━━━━━━\n• *RESULT* - View Marks\n• *ATTENDANCE* - View Percentage\n• *CHALLAN* - Download Fee Slip`);

            }

            if (body === 'RESULT') {

                userState[sender] = { roll: isStudent.get('Roll_No'), step: 'VIEW_SEM' };

                return msg.reply("📝 Enter Semester Number (1-8):");

            }

            if (body === 'ATTENDANCE') {

                const myA = (await aPortal.getRows()).filter(r => r.get('Roll_No') === isStudent.get('Roll_No'));

                let rep = `📅 *ATTENDANCE STATUS*\n`;

                myA.forEach(a => rep += `• ${a.get('Subject')}: ${a.get('Percentage')}%\n`);

                return msg.reply(rep || "❌ Record not found.");

            }

        }



        // 4. UNIVERSAL DOCUMENT FETCHING

        const dRows = await dLib.getRows();

        const docReq = dRows.find(r => r.get('Doc_Name').toUpperCase() === body);

        if (docReq) {

            let fId = docReq.get('File_ID').trim().split('/d/').pop().split('/')[0].split('?')[0];

            const dUrl = `https://drive.google.com/uc?export=download&id=${fId}`;

            try {

                const res = await axios.get(dUrl, { responseType: 'arraybuffer' });

                const media = new MessageMedia('application/pdf', Buffer.from(res.data).toString('base64'), `${body}.pdf`);

                return await client.sendMessage(msg.from, media);

            } catch(e) { return msg.reply(`📄 Link: https://drive.google.com/file/d/${fId}/view`); }

        }



    } catch (e) { console.error("System Error:", e); }

});



client.initialize();