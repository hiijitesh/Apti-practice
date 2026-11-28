/**
 * Google Apps Script Backend for AptiPrep (with User Email Sessions)
 * -------------------------------------------------------------------
 * Setup Instructions:
 * 1. Create a new Google Sheet (e.g. "AptiPrep Attempts").
 * 2. In Google Sheets, click: Extensions > Apps Script.
 * 3. Delete any default code in Code.gs and paste this entire file.
 * 4. Click "Deploy" (top right) > "New deployment".
 * 5. Select type: "Web app".
 * 6. Set Description: "AptiPrep Backend API".
 * 7. Set "Execute as": "Me" (your Google account).
 * 8. Set "Who has access": "Anyone" (crucial for web app to post attempts).
 * 9. Click "Deploy", authorize permissions when prompted, and copy the Web App URL.
 * 10. Paste the Web App URL into AptiPrep (in public/config.js or via the Connect Sheet button).
 *
 * Job Alerts (written by the job-alert-tg bot, shown on jobs.html):
 * 11. Project Settings > Script Properties > add JOB_TOKEN = <random secret>.
 *     Set the same value as JOBS_SHEET_TOKEN in the bot's .env.
 * 12. After pasting a new version: Deploy > Manage deployments > Edit > Version: New version.
 *     (Keeps the same /exec URL.) The "Jobs" tab is created on the first post.
 *
 * Manually verified questions (the admin's "Mark verified" button, works on GitHub Pages):
 * 13. Nothing to configure: the "Verified" tab is created on the first mark. Each mark/undo appends a
 *     row; the latest row per question id wins. Only the admin email (checked by SHA-256) may write.
 */

function doPost(e) {
    var lock = LockService.getScriptLock();
    lock.tryLock(15000); // Wait up to 15s to prevent concurrent write collisions

    try {
        var payload = {};
        if (e && e.postData && e.postData.contents) {
            try {
                payload = JSON.parse(e.postData.contents);
            } catch (ignore) {}
        }
        if (payload.kind === 'job') return postJob(payload);
        if (payload.kind === 'verify') return postVerified(payload);

        var doc = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = doc.getSheets()[0]; // attempts tab (first tab); jobs live in their own tab

        // Setup headers on row 1 if sheet is blank
        if (sheet.getLastRow() === 0) {
            sheet.appendRow([
                'Attempt ID',
                'Timestamp',
                'User Email',
                'Mode',
                'Chapter',
                'Score',
                'Total Questions',
                'Accuracy (%)',
                'Time Taken',
                'Correct',
                'Incorrect',
                'Unattempted',
            ]);
            sheet
                .getRange(1, 1, 1, 12)
                .setFontWeight('bold')
                .setBackground('#f3f4f6');
            sheet.setFrozenRows(1);
        }

        var data = {};
        if (e && e.postData && e.postData.contents) {
            data = JSON.parse(e.postData.contents);
        } else if (e && e.parameter) {
            data = e.parameter;
        }

        var mins = Math.floor((data.timeTakenSeconds || 0) / 60);
        var secs = (data.timeTakenSeconds || 0) % 60;
        var timeTakenStr = mins > 0 ? mins + 'm ' + secs + 's' : secs + 's';

        sheet.appendRow([
            data.attemptId || Utilities.getUuid(),
            data.timestamp || new Date().toISOString(),
            (data.userEmail || 'guest@local').toLowerCase(),
            data.mode === 'mock'
                ? 'Mock Test'
                : data.mode === 'chapter_test'
                ? 'Chapter Test'
                : 'Practice',
            data.chapter || 'All Chapters',
            data.correctCount || 0,
            data.totalQuestions || 0,
            (data.scorePercentage !== undefined ? data.scorePercentage : 0) +
                '%',
            timeTakenStr,
            data.correctCount || 0,
            data.incorrectCount || 0,
            data.unattemptedCount || 0,
        ]);

        return ContentService.createTextOutput(
            JSON.stringify({ status: 'success', attemptId: data.attemptId })
        ).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService.createTextOutput(
            JSON.stringify({ status: 'error', error: err.toString() })
        ).setMimeType(ContentService.MimeType.JSON);
    } finally {
        lock.releaseLock();
    }
}

function doGet(e) {
    if (e && e.parameter && e.parameter.action === 'jobs') return getJobs(e);
    if (e && e.parameter && e.parameter.action === 'verified') return getVerified();
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
        var rows = sheet.getDataRange().getValues();

        if (rows.length <= 1) {
            return ContentService.createTextOutput(
                JSON.stringify({ attempts: [] })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        var filterEmail =
            e && e.parameter
                ? (
                      e.parameter.email ||
                      e.parameter.userEmail ||
                      ''
                  ).toLowerCase()
                : null;
        var attempts = [];

        for (var i = 1; i < rows.length; i++) {
            var r = rows[i];
            var userEmail = (r[2] || '').toString().toLowerCase();

            // If email filter requested, only return matching attempts
            if (filterEmail && userEmail !== filterEmail) {
                continue;
            }

            attempts.push({
                attemptId: r[0],
                timestamp: r[1],
                userEmail: userEmail,
                mode: r[3],
                chapter: r[4],
                correctCount: Number(r[5]) || 0,
                totalQuestions: Number(r[6]) || 0,
                scorePercentage: parseFloat(r[7]) || 0,
                timeTakenFormatted: r[8],
                incorrectCount: Number(r[10]) || 0,
                unattemptedCount: Number(r[11]) || 0,
            });
        }

        return ContentService.createTextOutput(
            JSON.stringify({ attempts: attempts })
        ).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService.createTextOutput(
            JSON.stringify({ error: err.toString(), attempts: [] })
        ).setMimeType(ContentService.MimeType.JSON);
    }
}

// ---------------- Job Alerts ----------------
var JOB_HEADERS = [
    'ID',
    'Posted At',
    'Type',
    'Company',
    'Role',
    'Deadline',
    'Vacancies',
    'Apply Link',
    'Telegram Link',
    'Source',
    'Added At',
];

function json_(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
        ContentService.MimeType.JSON
    );
}

function jobsSheet_() {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = doc.getSheetByName('Jobs');
    if (!sheet) {
        sheet = doc.insertSheet('Jobs');
        sheet.getRange('A:K').setNumberFormat('@'); // plain text: "10-Dec" must not become a date
        sheet.appendRow(JOB_HEADERS);
        sheet
            .getRange(1, 1, 1, JOB_HEADERS.length)
            .setFontWeight('bold')
            .setBackground('#f3f4f6');
        sheet.setFrozenRows(1);
    }
    return sheet;
}

// Called from doPost (already holding the script lock).
function postJob(d) {
    var expected =
        PropertiesService.getScriptProperties().getProperty('JOB_TOKEN');
    if (!expected || d.token !== expected)
        return json_({ status: 'error', error: 'bad token' });

    var sheet = jobsSheet_();
    var id = String(d.id || '');
    // Bot may retry a message; keep one row per Telegram message.
    if (
        id &&
        sheet.getLastRow() > 1 &&
        sheet
            .getRange(2, 1, sheet.getLastRow() - 1, 1)
            .createTextFinder(id)
            .matchEntireCell(true)
            .findNext()
    ) {
        return json_({ status: 'duplicate', id: id });
    }
    sheet.appendRow([
        id,
        d.posted_at || '',
        d.type || 'Job Alert',
        d.company || '',
        d.role || '',
        d.deadline || '',
        d.vacancies || '',
        d.apply_link || '',
        d.telegram_link || '',
        d.source || '',
        new Date().toISOString(),
    ]);
    return json_({ status: 'success', id: id });
}

function getJobs(e) {
    try {
        var sheet =
            SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Jobs');
        if (!sheet || sheet.getLastRow() <= 1) return json_({ jobs: [] });
        var limit = Math.min(Number(e.parameter.limit) || 300, 1000);
        var first = Math.max(2, sheet.getLastRow() - limit + 1);
        var rows = sheet
            .getRange(
                first,
                1,
                sheet.getLastRow() - first + 1,
                JOB_HEADERS.length
            )
            .getValues();
        var jobs = rows.reverse().map(function (r) {
            return {
                id: r[0],
                postedAt: r[1],
                type: r[2],
                company: r[3],
                role: r[4],
                deadline: r[5],
                vacancies: r[6],
                applyLink: r[7],
                telegramLink: r[8],
                source: r[9],
            };
        });
        return json_({ jobs: jobs });
    } catch (err) {
        return json_({ error: err.toString(), jobs: [] });
    }
}

// ---------------- Manually verified questions ----------------
// SHA-256 of the admin email (same value as ADMIN_EMAIL_SHA256 in src/config/index.js).
var ADMIN_EMAIL_SHA256 = '6f042462e112492d5aa71a6167b56ac2892b8a13487ea573bc01d941ad7fd057';

function verifiedSheet_() {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = doc.getSheetByName('Verified');
    if (!sheet) {
        sheet = doc.insertSheet('Verified');
        sheet.appendRow(['Question ID', 'Verified', 'Marked At']);
        sheet.setFrozenRows(1);
    }
    return sheet;
}

function sha256Hex_(text) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
        .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
        .join('');
}

function postVerified(d) {
    var email = String(d.email || '').trim().toLowerCase();
    if (sha256Hex_(email) !== ADMIN_EMAIL_SHA256) return json_({ error: 'forbidden' });
    var id = String(d.id || '');
    if (!/^[a-z0-9_]{3,120}$/.test(id)) return json_({ error: 'bad id' });
    verifiedSheet_().appendRow([id, d.verified === false ? 'no' : 'yes', new Date().toISOString()]);
    return json_({ ok: true, id: id, verified: d.verified !== false });
}

function getVerified() {
    var rows = verifiedSheet_().getDataRange().getValues();
    var latest = {};
    for (var i = 1; i < rows.length; i++) latest[rows[i][0]] = rows[i][1] === 'yes';   // later rows win
    var keys = Object.keys(latest).sort();
    return json_({
        verified: keys.filter(function (k) { return latest[k]; }),
        unverified: keys.filter(function (k) { return !latest[k]; })   // undone marks override the committed list
    });
}

