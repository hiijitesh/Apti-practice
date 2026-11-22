const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

describe('Mobile UI & Swipe Navigation Tests', () => {
  const htmlPath = path.join(__dirname, '../public/index.html');
  const cssPath = path.join(__dirname, '../public/style.css');
  const jsPath = path.join(__dirname, '../public/app.js');

  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const jsContent = fs.readFileSync(jsPath, 'utf8');

  test('HTML has clean uncluttered structure for mobile', () => {
    // 1. Row 2 container exists with ID practice-selectors-row and has hidden default
    assert.match(htmlContent, /id="practice-selectors-row"/);

    // 2. Subject dropdown is hidden on mobile (hidden sm:inline-block)
    assert.match(htmlContent, /id="practice-subject-dropdown"[^>]*class="[^"]*hidden sm:inline-block/);

    // 3. Chapter dropdown takes full width on mobile (flex-1)
    assert.match(htmlContent, /id="practice-chapter-dropdown"[^>]*class="[^"]*flex-1 min-w-0/);

    // 4. Duplicate Browse button is hidden on mobile (hidden sm:flex)
    assert.match(htmlContent, /app\.openChapterSelectModal\(\)"[^>]*class="[^"]*hidden sm:flex/);

    // 5. Palette button in header is hidden on mobile (hidden lg:flex)
    assert.match(htmlContent, /app\.togglePracticeDrawer\(\)"[^>]*class="[^"]*hidden lg:flex/);

    // 6. Test/Study toggle has compact sizing classes
    assert.match(htmlContent, /id="toggle-btn-test"[^>]*text-\[10px\]/);
    assert.match(htmlContent, /id="toggle-btn-study"[^>]*text-\[10px\]/);

    // 7. Submit Test button has compact sizing classes
    assert.match(htmlContent, /id="practice-btn-submit-header"[^>]*text-\[10px\]/);

    // 8. Chapter chevron exists for dynamic visibility in test vs study mode
    assert.match(htmlContent, /id="practice-chapter-chevron"/);
    assert.match(htmlContent, /id="practice-chapter-title-text"/);
  });

  test('CSS contains responsive rules for compact mobile buttons', () => {
    // Media query max-width: 639px defines small styles for toggle and submit buttons
    assert.match(cssContent, /@media\s*\(\s*max-width:\s*639px\s*\)/);
    assert.match(cssContent, /#toggle-btn-test/);
    assert.match(cssContent, /#toggle-btn-study/);
    assert.match(cssContent, /#practice-btn-submit-header/);
  });

  test('JS disables changing chapter or subject in test mode', () => {
    // 1. openChapterSelectModal blocks if in test mode
    assert.match(jsContent, /this\.practice\.modeType === 'test'[^}]*You cannot change chapter or subject/);

    // 2. switchPracticeChapter blocks if in test mode
    assert.match(jsContent, /switchPracticeChapter\(newChap\)\s*\{[\s\S]*?this\.practice\.modeType === 'test'/);

    // 3. filterPracticeChaptersBySubject blocks if in test mode
    assert.match(jsContent, /filterPracticeChaptersBySubject\(subjectValue\)\s*\{[\s\S]*?this\.practice\.modeType === 'test'/);

    // 4. handlePracticeChapterTitleClick blocks if in test mode
    assert.match(jsContent, /handlePracticeChapterTitleClick\(\)\s*\{[\s\S]*?this\.practice\.modeType === 'test'/);

    // 5. setPracticeModeType hides practice-selectors-row and chevron in test mode
    assert.match(jsContent, /row2\.classList\.add\('hidden'\)/);
    assert.match(jsContent, /chevronEl\.classList\.add\('hidden'\)/);
    assert.match(jsContent, /row2\.classList\.remove\('hidden'\)/);
    assert.match(jsContent, /chevronEl\.classList\.remove\('hidden'\)/);
  });

  test('JS includes swipe left and right navigation logic', () => {
    // 1. setupSwipeNavigation method exists
    assert.match(jsContent, /setupSwipeNavigation\(\)\s*\{/);

    // 2. swipe left (diffX < 0) calls nextPracticeQuestion / nextMockQuestion
    assert.match(jsContent, /diffX < 0[\s\S]*?nextPracticeQuestion/);
    assert.match(jsContent, /diffX < 0[\s\S]*?nextMockQuestion/);

    // 3. swipe right (diffX > 0) calls prevPracticeQuestion / prevMockQuestion
    assert.match(jsContent, /diffX > 0[\s\S]*?prevPracticeQuestion/);
    assert.match(jsContent, /diffX > 0[\s\S]*?prevMockQuestion/);

    // 4. setupSwipeNavigation is called in init()
    assert.match(jsContent, /this\.setupSwipeNavigation\(\)/);
  });

  test('Test page bottom bars include Previous, Next, Mark for Review, and Submit buttons', () => {
    // 1. Practice fixed bottom bar contains all 4 key buttons
    assert.match(htmlContent, /id="practice-fixed-bottom-bar"[\s\S]*?id="practice-btn-prev"/);
    assert.match(htmlContent, /id="practice-fixed-bottom-bar"[\s\S]*?id="practice-btn-review"/);
    assert.match(htmlContent, /id="practice-fixed-bottom-bar"[\s\S]*?id="practice-bottom-btn-submit"/);
    assert.match(htmlContent, /id="practice-fixed-bottom-bar"[\s\S]*?id="practice-btn-next"/);

    // 2. Mock mobile bottom bar contains all 4 key buttons
    assert.match(htmlContent, /id="mock-mobile-bottom-bar"[\s\S]*?id="mock-mobile-btn-prev"/);
    assert.match(htmlContent, /id="mock-mobile-bottom-bar"[\s\S]*?id="mock-mobile-btn-review"/);
    assert.match(htmlContent, /id="mock-mobile-bottom-bar"[\s\S]*?id="mock-mobile-btn-submit"/);
    assert.match(htmlContent, /id="mock-mobile-bottom-bar"[\s\S]*?id="mock-mobile-btn-next"/);

    // 3. JS implements togglePracticeReview
    assert.match(jsContent, /togglePracticeReview\(andNext = false\)\s*\{/);
    assert.match(jsContent, /this\.practice\.reviewFlags/);
  });
});
