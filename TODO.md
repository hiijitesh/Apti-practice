# TODO

## Google Sheets Full Attempt & Study Session Sync
- [ ] **Store full per-question `answers` (and `questionTimes`) in Google Sheets**
  - Update `syncToGoogleSheet()` in `public/app.js` (and `StorageService.submitAttempt()` in `public/js/services/storage.service.js`) to include serialized per-question `answers` (`questionId`, `userAnswer`, `isCorrect`) and `timeTakenSeconds` / `questionTimes`.
  - Update `scripts/google_apps_script.js` (`doPost` and `doGet`) to store and return the `Answers JSON` (and `Time Taken (s)`) columns so **Review →** works across devices / after clearing browser `localStorage` on GitHub Pages.
  - Remember to paste the updated `scripts/google_apps_script.js` into Google Sheets (**Extensions > Apps Script**) and create a new Web App deployment.
- [ ] **Sync Study Mode progress (`apti_study_*`) to Google Sheets (optional)**
  - Add an optional `syncStudySession` / `getStudySessions` action in `scripts/google_apps_script.js` (e.g., a dedicated `StudySessions` sheet tab) so in-progress Study Mode answers and per-question timers sync across devices.
