   (function() {
        // IIFE to avoid polluting global scope and execute immediately

        const currentPagePath = window.location.pathname;
        const googleSheetUrl = 'https://sheets.googleapis.com/v4/spreadsheets/1-1Kr3CgK_pBA9R5D4OLs3W77-S5QrudZ7fI4k4sJSh0/values/statusopen?alt=json&key=AIzaSyAD_aNO81AEscbG0Ij-krW7neHe6FebBDE';
        // Assuming index.html is in the same directory or is the root page.
        // Adjust if index.html is elsewhere, e.g., '/index.html' or '../index.html'
        const redirectToPage = 'index.html'; 

        let pageType = 0; // 1 for *.1.html, 2 for *.2.html, 3 for *.3.html

        if (currentPagePath.endsWith('1.html')) {
            pageType = 1;
        } else if (currentPagePath.endsWith('2.html')) {
            pageType = 2;
        } else if (currentPagePath.endsWith('3.html')) {
            pageType = 3;
        } else {
            // This script is designed for pages ending with 1.html, 2.html, or 3.html.
            // If it's on another page by mistake, it will do nothing here.
            // For production, you might want to log this or handle it differently.
            console.warn('Access control script running on an unexpected page:', currentPagePath);
            return; // Exit if not one of the target page types
        }

        // Function to redirect the user
        function denyAccessAndRedirect() {
            console.log(`Access denied for ${currentPagePath} or error occurred. Redirecting to ${redirectToPage}.`); // For debugging
            window.location.href = redirectToPage;
        }

        fetch(googleSheetUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                if (!data || !data.values) {
                    // This means the sheet data is not in the expected format or is empty
                    throw new Error('Invalid or empty data structure from Google Sheets API.');
                }

                // Retrieve statuses, defaulting to 'close' if data is missing or malformed
                // Cell B2 (for pageType 1) is expected at data.values[1][1] (0-indexed)
                const statusForPage1 = (data.values.length > 1 && data.values[1] && data.values[1].length > 1) 
                                       ? String(data.values[1][1]).toLowerCase() 
                                       : 'close';
                // Cell B3 (for pageType 2) is expected at data.values[2][1]
                const statusForPage2 = (data.values.length > 2 && data.values[2] && data.values[2].length > 1) 
                                       ? String(data.values[2][1]).toLowerCase() 
                                       : 'close';
                // Cell B4 (for pageType 3) is expected at data.values[3][1]
                const statusForPage3 = (data.values.length > 3 && data.values[3] && data.values[3].length > 1) 
                                       ? String(data.values[3][1]).toLowerCase() 
                                       : 'close';

                let canAccessPage = false;

                if (pageType === 1) {
                    if (statusForPage1 === 'open') {
                        canAccessPage = true;
                    }
                } else if (pageType === 2) {
                    if (statusForPage2 === 'open') {
                        canAccessPage = true;
                    }
                } else if (pageType === 3) {
                    if (statusForPage3 === 'open') {
                        canAccessPage = true;
                    }
                }

                if (canAccessPage) {
                    console.log(`Access granted for ${currentPagePath}.`); // For debugging
                    // Allow page to load normally
                } else {
                    denyAccessAndRedirect();
                }
            })
            .catch(error => {
                // This catch block handles network errors or errors from the .then() blocks
                console.error('Error during page access check:', error.message);
                denyAccessAndRedirect(); // Deny access on any error
            });
    })();