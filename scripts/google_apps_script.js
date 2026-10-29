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
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(15000); // Wait up to 15s to prevent concurrent write collisions

  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = doc.getActiveSheet();

    // Setup headers on row 1 if sheet is blank
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Attempt ID",
        "Timestamp",
        "User Email",
        "Mode",
        "Chapter",
        "Score",
        "Total Questions",
        "Accuracy (%)",
        "Time Taken",
        "Correct",
        "Incorrect",
        "Unattempted"
      ]);
      sheet.getRange(1, 1, 1, 12).setFontWeight("bold").setBackground("#f3f4f6");
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
    var timeTakenStr = mins > 0 ? (mins + "m " + secs + "s") : (secs + "s");

    sheet.appendRow([
      data.attemptId || Utilities.getUuid(),
      data.timestamp || new Date().toISOString(),
      (data.userEmail || "guest@local").toLowerCase(),
      data.mode === "mock" ? "Mock Test" : (data.mode === "chapter_test" ? "Chapter Test" : "Practice"),
      data.chapter || "All Chapters",
      data.correctCount || 0,
      data.totalQuestions || 0,
      (data.scorePercentage !== undefined ? data.scorePercentage : 0) + "%",
      timeTakenStr,
      data.correctCount || 0,
      data.incorrectCount || 0,
      data.unattemptedCount || 0
    ]);

    return ContentService.createTextOutput(JSON.stringify({ status: "success", attemptId: data.attemptId }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var rows = sheet.getDataRange().getValues();

    if (rows.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ attempts: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var filterEmail = e && e.parameter ? (e.parameter.email || e.parameter.userEmail || "").toLowerCase() : null;
    var attempts = [];

    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var userEmail = (r[2] || "").toString().toLowerCase();

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
        unattemptedCount: Number(r[11]) || 0
      });
    }

    return ContentService.createTextOutput(JSON.stringify({ attempts: attempts }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString(), attempts: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
