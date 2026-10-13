(function () {
    // =========================================================================
    // 1. CONFIGURATION & ENDPOINTS
    // =========================================================================
    const SPREADSHEET_ID = '1-1Kr3CgK_pBA9R5D4OLs3W77-S5QrudZ7fI4k4sJSh0';
    const API_KEY = 'AIzaSyAD_aNO81AEscbG0Ij-krW7neHe6FebBDE';
    const STATUS_SHEET_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/statusopen?alt=json&key=${API_KEY}`;
    const SETTINGS_SHEET_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/settingctpd?alt=json&key=${API_KEY}`;
    const REDIRECT_TARGET = 'index.html';

    const THAI_MONTHS = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
        'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
        'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    // =========================================================================
    // 2. HELPER FUNCTIONS: THAI DATE FORMATTING & DOM UPDATES
    // =========================================================================
    function formatThaiDate(rawDate) {
        if (!rawDate) return '';
        const trimmed = String(rawDate).trim();

        // Pattern 1: DD/MM/YYYY or D/M/YYYY
        const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (dmyMatch) {
            const day = parseInt(dmyMatch[1], 10);
            const month = parseInt(dmyMatch[2], 10);
            let year = parseInt(dmyMatch[3], 10);
            if (month >= 1 && month <= 12) {
                if (year < 2400) year += 543; // Convert CE (AD) to BE (พ.ศ.)
                return `${day} ${THAI_MONTHS[month - 1]} ${year}`;
            }
        }

        // Pattern 2: YYYY-MM-DD
        const ymdMatch = trimmed.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
        if (ymdMatch) {
            let year = parseInt(ymdMatch[1], 10);
            const month = parseInt(ymdMatch[2], 10);
            const day = parseInt(ymdMatch[3], 10);
            if (month >= 1 && month <= 12) {
                if (year < 2400) year += 543;
                return `${day} ${THAI_MONTHS[month - 1]} ${year}`;
            }
        }

        // If arbitrary text or already Thai text
        return trimmed;
    }

    function applySettingsToDOM(academicYear, deadlineRaw) {
        const formattedDeadline = formatThaiDate(deadlineRaw);

        // 1) Update Document Title
        if (academicYear && document.title) {
            document.title = document.title.replace(/ปีการศึกษา\s*\d{4}/g, `ปีการศึกษา ${academicYear}`);
        }

        // 2) Explicitly Targeted Elements
        if (academicYear) {
            const yearElements = document.querySelectorAll('[data-ctpd="academic-year"], .ctpd-academic-year, #dynamicAcademicYear');
            yearElements.forEach(el => {
                el.textContent = academicYear;
            });
        }

        if (formattedDeadline) {
            const deadlineElements = document.querySelectorAll('[data-ctpd="deadline"], .ctpd-deadline, #dynamicDeadline');
            deadlineElements.forEach(el => {
                el.textContent = formattedDeadline;
            });
        }

        // 3) Smart Text Content Scanner for Academic Year (supports all headers, pills, badges)
        if (academicYear) {
            const candidateElements = document.querySelectorAll('span, p, h1, h2, h3, h4, a, div');
            candidateElements.forEach(el => {
                if (el.children.length === 0 && el.textContent) {
                    if (el.textContent.includes('ปีการศึกษา')) {
                        el.textContent = el.textContent.replace(/(ปีการศึกษา\s*)\d{4}/g, `$1${academicYear}`);
                    }
                }
            });
        }

        // 4) Smart Scanner for Deadline sentence if present
        if (formattedDeadline) {
            const deadlineContainers = document.querySelectorAll('div, p, span');
            deadlineContainerContainersLoop:
            for (let el of deadlineContainers) {
                if (el.textContent && el.textContent.includes('กรุณากรอกข้อมูลภายในวันที่')) {
                    const spanChild = el.querySelector('span');
                    if (spanChild && !spanChild.hasAttribute('data-ctpd')) {
                        spanChild.textContent = formattedDeadline;
                        break deadlineContainerContainersLoop;
                    }
                }
            }
        }
    }

    // =========================================================================
    // 3. ZERO-FLICKER CACHING & DYNAMIC SETTINGS SYNC
    // =========================================================================
    function initDynamicSettings() {
        // Fast initial load from localStorage
        try {
            const cached = localStorage.getItem('ctpd_settings');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.academicYear || parsed.deadlineDate) {
                    applySettingsToDOM(parsed.academicYear, parsed.deadlineDate);
                }
            }
        } catch (e) {
            console.warn('Unable to read cached CTPD settings:', e);
        }

        // Background fetch for freshest settings from Google Sheet 'settingctpd'
        fetch(SETTINGS_SHEET_URL)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                if (!data || !data.values || data.values.length === 0) return;
                const rows = data.values;
                // B1: row 0 col 1, B2: row 1 col 1
                const academicYear = (rows[0] && rows[0][1]) ? String(rows[0][1]).trim() : '';
                const deadlineDate = (rows[1] && rows[1][1]) ? String(rows[1][1]).trim() : '';

                if (academicYear || deadlineDate) {
                    applySettingsToDOM(academicYear, deadlineDate);
                    try {
                        localStorage.setItem('ctpd_settings', JSON.stringify({
                            academicYear: academicYear,
                            deadlineDate: deadlineDate,
                            updatedAt: new Date().toISOString()
                        }));
                    } catch (err) {
                        // Ignore quota errors
                    }
                }
            })
            .catch(err => {
                console.warn('Background sync for CTPD settings failed, using cache:', err.message);
            });
    }

    // Run dynamic settings on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDynamicSettings);
    } else {
        initDynamicSettings();
    }

    // =========================================================================
    // 4. ACCESS CONTROL CHECK (ONLY FOR PAGES: 1.html, 2.html, 3.html)
    // =========================================================================
    const currentPagePath = window.location.pathname;
    let pageType = 0;

    if (currentPagePath.endsWith('1.html')) {
        pageType = 1;
    } else if (currentPagePath.endsWith('2.html')) {
        pageType = 2;
    } else if (currentPagePath.endsWith('3.html')) {
        pageType = 3;
    } else {
        // Safe exit: other pages (e.g. additionaldataform, index, CheckingtheEvaluation)
        // should NOT be redirected!
        return;
    }

    function denyAccessAndRedirect() {
        console.log(`Access denied for ${currentPagePath}. Redirecting to ${REDIRECT_TARGET}.`);
        window.location.href = REDIRECT_TARGET;
    }

    fetch(STATUS_SHEET_URL)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (!data || !data.values) {
                throw new Error('Invalid or empty data structure from Google Sheets API.');
            }

            const statusForPage1 = (data.values.length > 1 && data.values[1] && data.values[1].length > 1)
                ? String(data.values[1][1]).toLowerCase()
                : 'close';
            const statusForPage2 = (data.values.length > 2 && data.values[2] && data.values[2].length > 1)
                ? String(data.values[2][1]).toLowerCase()
                : 'close';
            const statusForPage3 = (data.values.length > 3 && data.values[3] && data.values[3].length > 1)
                ? String(data.values[3][1]).toLowerCase()
                : 'close';

            let canAccessPage = false;
            if (pageType === 1) {
                canAccessPage = (statusForPage1 === 'open');
            } else if (pageType === 2) {
                canAccessPage = (statusForPage2 === 'open');
            } else if (pageType === 3) {
                canAccessPage = (statusForPage3 === 'open');
            }

            if (canAccessPage) {
                console.log(`Access granted for ${currentPagePath}.`);
            } else {
                denyAccessAndRedirect();
            }
        })
        .catch(error => {
            console.error('Error during page access check:', error.message);
            denyAccessAndRedirect();
        });
})();