// หมายเหตุ: กรุณาแทนที่ 'xxx123' ด้วย Google Sheet ID จริงของคุณสำหรับเก็บข้อมูลการล็อกอิน
const LOGIN_SPREADSHEET_ID = '12qEq1C3nFrxO3qeePkiZaNyzLmQFqJj_C4hNoJsxlPg'; // ID ของ Google Sheet ที่เก็บข้อมูลล็อกอิน
const LOGIN_SHEET_NAME = 'login'; // ชื่อชีทที่เก็บข้อมูลล็อกอิน

// --- เพิ่มค่าคงที่สำหรับฟังก์ชันใหม่ ---
const STATUS_SPREADSHEET_ID = '1-1Kr3CgK_pBA9R5D4OLs3W77-S5QrudZ7fI4k4sJSh0'; // ID ของ Google Sheet ที่เก็บสถานะการเปิด/ปิด
const STATUS_SHEET_NAME = 'statusopen'; // ชื่อชีทที่เก็บสถานะ
const FORM_ID = '1Ao5rRx31PaP2jmRH8WL-nsbXR8iTqToCS-ZGv3lc0P8'; // ID ของ Google Form
const DROPDOWN_ITEM_ID = 571870979; // ID ของคำถาม Dropdown ใน Form

// Mapping ครั้งที่ กับข้อความใน Form และ cell ใน status sheet
const PERIOD_CONFIG = {
  '1': { cell: 'B2', choiceText: 'ครั้งที่ ๑ : สัปดาห์ที่ 3 - 5 ของภาคเรียน' },
  '2': { cell: 'B3', choiceText: 'ครั้งที่ ๒ : สัปดาห์ที่ 7 - 9 ของภาคเรียน' },
  '3': { cell: 'B4', choiceText: 'ครั้งที่ ๓ : สัปดาห์ที่ 11 - 14 ของภาคเรียน' }
};

// ค่าคงที่สำหรับชีทการตั้งค่าระบบ (settingctpd)
const SETTING_SHEET_NAME = 'settingctpd'; // ชื่อชีทที่เก็บการตั้งค่าระบบ
const SETTING_CONFIG = {
  academicYear: { cell: 'B1' },
  deadlineDate: { cell: 'B2' }
};
// --- สิ้นสุดการเพิ่มค่าคงที่ ---

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ระบบจัดการข้อมูลการประเมิน CTPD MSU')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function generateToken() {
  return 'simple-auth-token-ctpdmsu';
}

function checkLogin(username, password) {
  try {
    const ss = SpreadsheetApp.openById(LOGIN_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(LOGIN_SHEET_NAME);

    if (!sheet) {
      console.error(`ไม่พบชีท "${LOGIN_SHEET_NAME}" ใน spreadsheet ID "${LOGIN_SPREADSHEET_ID}".`);
      return { success: false, error: `ไม่พบชีทสำหรับล็อกอิน "${LOGIN_SHEET_NAME}"` };
    }
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const storedUsername = String(data[i][0]).trim();
      const storedPassword = String(data[i][1]);
      const department = String(data[i][2]).trim();

      if (username === storedUsername && password === storedPassword) {
        if (!department) {
          console.warn(`ผู้ใช้ ${username} ล็อกอินสำเร็จ แต่ไม่พบข้อมูลสาขาวิชาในชีท`);
          return { success: false, error: 'ล็อกอินสำเร็จ แต่ข้อมูลสาขาวิชาไม่สมบูรณ์' };
        }
        console.log(`ผู้ใช้: ${username} ล็อกอินสำเร็จ, สาขาวิชา/สิทธิ์: ${department}`);
        return { success: true, token: generateToken(), department: department };
      }
    }
    console.log(`การล็อกอินสำหรับชื่อผู้ใช้: ${username} ไม่สำเร็จ`);
    return { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  } catch (e) {
    console.error('เกิดข้อผิดพลาดในฟังก์ชัน checkLogin: ' + e.toString());
    Logger.log('เกิดข้อผิดพลาดในฟังก์ชัน checkLogin: ' + e.toString());
    return { success: false, error: 'เกิดข้อผิดพลาดในระบบล็อกอิน กรุณาตรวจสอบ Log ของเซิร์ฟเวอร์' };
  }
}

function validateToken(token) {
  return token === 'simple-auth-token-ctpdmsu';
}

function getSheetData(token, department) {
  if (!validateToken(token)) {
    console.error('getSheetData: Token ไม่ถูกต้องหรือไม่พบ Token');
    return { error: "การยืนยันตัวตนล้มเหลว Token ไม่ถูกต้อง" };
  }
  if (!department || typeof department !== 'string' || department.trim() === '') {
    console.error('getSheetData: ไม่ได้ระบุสาขาวิชาหรือรูปแบบไม่ถูกต้อง');
    return { error: "จำเป็นต้องระบุสาขาวิชา (หรือสิทธิ์ 'all') เพื่อดึงข้อมูล" };
  }

  const userDepartmentAccess = department.trim().toLowerCase();

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Form Responses 1');
    if (!sheet) {
      console.error('ไม่พบชีท "Form Responses 1"');
      return { error: 'ไม่พบชีทข้อมูล "Form Responses 1"' };
    }

    const allDataWithHeader = sheet.getDataRange().getDisplayValues();
    if (allDataWithHeader.length <= 1) {
      return [];
    }

    const dataRowsWithOriginalSheetRow = allDataWithHeader.slice(1).map((row, index) => {
      return {
        rowData: row,
        originalSheetRow: index + 2
      };
    });

    if (userDepartmentAccess === 'all') {
      console.log(`getSheetData: ผู้ใช้มีสิทธิ์ "all" คืนค่าข้อมูลทั้งหมด ${dataRowsWithOriginalSheetRow.length} แถว`);
      return dataRowsWithOriginalSheetRow;
    } else {
      const filteredData = dataRowsWithOriginalSheetRow.filter(item => {
        const rowContent = item.rowData;
        return rowContent.length > 6 && String(rowContent[6]).trim().toLowerCase() === userDepartmentAccess;
      });
      console.log(`getSheetData: คืนค่าข้อมูล ${filteredData.length} แถว สำหรับสาขาวิชา "${department}"`);
      return filteredData;
    }
  } catch (e) {
    console.error('เกิดข้อผิดพลาดในฟังก์ชัน getSheetData: ' + e.toString());
    Logger.log('เกิดข้อผิดพลาดในฟังก์ชัน getSheetData: ' + e.toString());
    return { error: 'เกิดข้อผิดพลาดในการดึงข้อมูล กรุณาตรวจสอบ Log ของเซิร์ฟเวอร์' };
  }
}

function updateSheetData(sheetRowNumber, rowDataArray) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Form Responses 1');
    if (!sheet) {
      return { success: false, error: 'ไม่พบชีท "Form Responses 1"' };
    }
    if (!Array.isArray(rowDataArray) || rowDataArray.length === 0) {
        return { success: false, error: 'ไม่มีข้อมูลสำหรับอัปเดต' };
    }
    sheet.getRange(sheetRowNumber, 1, 1, rowDataArray.length).setValues([rowDataArray]);
    return { success: true, message: `แถวที่ ${sheetRowNumber} ได้รับการอัปเดตแล้ว` };
  } catch (e) {
    console.error(`เกิดข้อผิดพลาดใน updateSheetData แถว ${sheetRowNumber}: ${e.toString()}`);
    Logger.log(`เกิดข้อผิดพลาดใน updateSheetData แถว ${sheetRowNumber}: ${e.toString()}`);
    return { success: false, error: `เกิดข้อผิดพลาดในการอัปเดตแถวที่ ${sheetRowNumber}` };
  }
}

function deleteInvalidRows() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Form Responses 1');
    if (!sheet) {
        return { success: false, error: 'ไม่พบชีท "Form Responses 1"' };
    }
    const data = sheet.getDataRange().getDisplayValues();
    const rowsToDelete = [];

    for (let i = 1; i < data.length; i++) {
      if (data[i].length > 1 && data[i][1] === 'ไม่เอา') {
        rowsToDelete.push(i + 1);
      }
    }

    if (rowsToDelete.length > 0) {
      rowsToDelete.sort((a, b) => b - a).forEach(rowNum => {
        sheet.deleteRow(rowNum);
      });
    }
    console.log(`ลบข้อมูล ${rowsToDelete.length} แถว ที่คอลัมน์ B เป็น "ไม่เอา"`);
    return { success: true, deletedCount: rowsToDelete.length };
  } catch (e) {
    console.error('เกิดข้อผิดพลาดในฟังก์ชัน deleteInvalidRows: ' + e.toString());
    Logger.log('เกิดข้อผิดพลาดในฟังก์ชัน deleteInvalidRows: ' + e.toString());
    return { success: false, error: 'เกิดข้อผิดพลาดในการลบแถว กรุณาตรวจสอบ Log ของเซิร์ฟเวอร์' };
  }
}

// --- ฟังก์ชันใหม่สำหรับการจัดการสถานะการเปิด/ปิดฟอร์ม ---

/**
 * ดึงสถานะการเปิด/ปิดของแต่ละครั้งการประเมินจากชีท 'statusopen'
 * @return {object} ออบเจ็กต์ที่มีสถานะ เช่น { period1: 'open', period2: 'close', period3: 'open' }
 */
function getEvaluationStatuses() {
  try {
    const ss = SpreadsheetApp.openById(STATUS_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(STATUS_SHEET_NAME);
    if (!sheet) {
      Logger.log(`ไม่พบชีท "${STATUS_SHEET_NAME}" ใน Spreadsheet ID "${STATUS_SPREADSHEET_ID}"`);
      return { error: `ไม่พบชีทสถานะ "${STATUS_SHEET_NAME}"` };
    }
    const statuses = {
      period1: sheet.getRange(PERIOD_CONFIG['1'].cell).getValue().toString().toLowerCase(),
      period2: sheet.getRange(PERIOD_CONFIG['2'].cell).getValue().toString().toLowerCase(),
      period3: sheet.getRange(PERIOD_CONFIG['3'].cell).getValue().toString().toLowerCase()
    };
    Logger.log("Statuses fetched: " + JSON.stringify(statuses));
    return statuses;
  } catch (e) {
    Logger.log('เกิดข้อผิดพลาดใน getEvaluationStatuses: ' + e.toString());
    return { error: 'เกิดข้อผิดพลาดในการดึงสถานะการประเมิน: ' + e.message };
  }
}

/**
 * อัปเดตสถานะการเปิด/ปิดของครั้งการประเมินที่ระบุ และอัปเดต Google Form
 * @param {string} periodNumber หมายเลขครั้งที่ (1, 2, หรือ 3)
 * @param {string} newStatus สถานะใหม่ ('open' หรือ 'close')
 * @param {string} userDepartment สิทธิ์ของผู้ใช้ที่ร้องขอการเปลี่ยนแปลง
 * @return {object} ผลลัพธ์การทำงาน
 */
function updateEvaluationStatus(periodNumber, newStatus, userDepartment) {
  // ตรวจสอบสิทธิ์ (ถึงแม้ UI จะกรองแล้วก็ตาม เพื่อความปลอดภัย)
  if (userDepartment !== 'all') {
    Logger.log(`User with department "${userDepartment}" attempted to change evaluation status. Denied.`);
    return { success: false, error: "คุณไม่มีสิทธิ์ในการเปลี่ยนแปลงสถานะการประเมิน" };
  }

  if (!PERIOD_CONFIG[periodNumber]) {
    Logger.log(`Invalid periodNumber: ${periodNumber}`);
    return { success: false, error: "ครั้งที่การประเมินไม่ถูกต้อง" };
  }
  const cellToUpdate = PERIOD_CONFIG[periodNumber].cell;
  const validStatus = newStatus.toLowerCase() === 'open' ? 'open' : 'close';

  try {
    const ss = SpreadsheetApp.openById(STATUS_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(STATUS_SHEET_NAME);
    if (!sheet) {
      Logger.log(`ไม่พบชีท "${STATUS_SHEET_NAME}" ใน Spreadsheet ID "${STATUS_SPREADSHEET_ID}"`);
      return { success: false, error: `ไม่พบชีทสถานะ "${STATUS_SHEET_NAME}"` };
    }
    sheet.getRange(cellToUpdate).setValue(validStatus);
    Logger.log(`Period ${periodNumber} (${cellToUpdate}) status updated to: ${validStatus}`);

    // หลังจากอัปเดตชีทแล้ว ให้อัปเดต Google Form
    const formUpdateResult = updateGoogleFormBasedOnStatuses();
    if (formUpdateResult.success) {
      return { success: true, message: `สถานะครั้งที่ ${periodNumber} ถูกเปลี่ยนเป็น ${validStatus} และฟอร์มได้รับการอัปเดต` };
    } else {
      // แม้ว่าชีทจะอัปเดตแล้ว แต่ถ้าฟอร์มมีปัญหา ก็ควรแจ้งผู้ใช้
      return { success: false, error: `อัปเดตสถานะในชีทสำเร็จ แต่เกิดปัญหาในการอัปเดต Google Form: ${formUpdateResult.error}` };
    }
  } catch (e) {
    Logger.log(`เกิดข้อผิดพลาดใน updateEvaluationStatus (Period: ${periodNumber}, Status: ${validStatus}): ${e.toString()}`);
    return { success: false, error: `เกิดข้อผิดพลาดในการอัปเดตสถานะครั้งที่ ${periodNumber}: ${e.message}` };
  }
}

/**
 * อัปเดต Google Form ตามสถานะการเปิด/ปิดล่าสุด
 * - ตั้งค่าการยอมรับคำตอบของฟอร์ม
 * - อัปเดตตัวเลือกใน Dropdown ของครั้งที่การประเมิน
 * @return {object} ผลลัพธ์การทำงาน
 */
function updateGoogleFormBasedOnStatuses() {
  try {
    const statuses = getEvaluationStatuses();
    if (statuses.error) {
        Logger.log("Error getting statuses for form update: " + statuses.error);
        return { success: false, error: "ไม่สามารถดึงสถานะปัจจุบันเพื่ออัปเดตฟอร์มได้: " + statuses.error };
    }

    const form = FormApp.openById(FORM_ID);
    Logger.log("Google Form opened: " + FORM_ID);

    // 3.1 & 3.2: ตั้งค่าการยอมรับคำตอบของฟอร์ม
    if (statuses.period1 === 'close' && statuses.period2 === 'close' && statuses.period3 === 'close') {
      form.setAcceptingResponses(false);
      Logger.log("Form set to NOT accepting responses.");
    } else {
      form.setAcceptingResponses(true);
      Logger.log("Form set to accepting responses.");
    }

    // 3.3 - 3.8: อัปเดตตัวเลือกใน Dropdown
    const item = form.getItemById(DROPDOWN_ITEM_ID);
    if (!item) {
        Logger.log(`ไม่พบ Item ID: ${DROPDOWN_ITEM_ID} ในฟอร์ม`);
        return { success: false, error: `ไม่พบคำถาม Dropdown ID ${DROPDOWN_ITEM_ID} ในฟอร์ม`};
    }
    const listItem = item.asListItem();
    
    // --- ส่วนที่ปรับปรุงตรรกะการสร้าง Choices ---
    let newChoiceObjects = []; // จะเก็บ Choice objects สำหรับ setChoices
    const existingChoiceObjects = listItem.getChoices(); // ดึง Choice objects ที่มีอยู่เดิม

    // ข้อความของตัวเลือกที่เราจะจัดการแบบไดนามิก
    const dynamicChoiceTexts = [
      PERIOD_CONFIG['1'].choiceText,
      PERIOD_CONFIG['2'].choiceText,
      PERIOD_CONFIG['3'].choiceText
    ];

    // 1. เพิ่มตัวเลือกเดิมที่ไม่ใช่ dynamic choices เข้าไปใน newChoiceObjects ก่อน
    existingChoiceObjects.forEach(choice => {
      if (!dynamicChoiceTexts.includes(choice.getValue())) {
        newChoiceObjects.push(choice); // เก็บ Choice object เดิมไว้
      }
    });
    Logger.log(`Preserved ${newChoiceObjects.length} non-dynamic choices.`);

    // 2. เพิ่ม dynamic choices ตามสถานะ 'open'
    // การทำเช่นนี้จะทำให้ dynamic choices ไปต่อท้าย non-dynamic choices
    // หากต้องการลำดับที่ซับซ้อนกว่านี้ อาจต้องปรับ logic การ sort หรือการ insert
    if (statuses.period1 === 'open') {
      // ตรวจสอบว่ายังไม่มี choice นี้ใน newChoiceObjects (เผื่อกรณีมาจาก existingChoices ที่เป็น dynamic แต่ไม่ควร)
      if (!newChoiceObjects.some(c => c.getValue() === PERIOD_CONFIG['1'].choiceText)) {
        newChoiceObjects.push(listItem.createChoice(PERIOD_CONFIG['1'].choiceText));
        Logger.log("Added choice for Period 1: " + PERIOD_CONFIG['1'].choiceText);
      }
    }
    if (statuses.period2 === 'open') {
      if (!newChoiceObjects.some(c => c.getValue() === PERIOD_CONFIG['2'].choiceText)) {
        newChoiceObjects.push(listItem.createChoice(PERIOD_CONFIG['2'].choiceText));
        Logger.log("Added choice for Period 2: " + PERIOD_CONFIG['2'].choiceText);
      }
    }
    if (statuses.period3 === 'open') {
      if (!newChoiceObjects.some(c => c.getValue() === PERIOD_CONFIG['3'].choiceText)) {
        newChoiceObjects.push(listItem.createChoice(PERIOD_CONFIG['3'].choiceText));
        Logger.log("Added choice for Period 3: " + PERIOD_CONFIG['3'].choiceText);
      }
    }
    
    // (Optional) ถ้า newChoiceObjects ว่างเปล่า (ไม่มีทั้ง fixed และ dynamic ที่ open)
    // อาจจะเพิ่ม default choice เช่น "ยังไม่มีการประเมินที่เปิดใช้งาน"
    // if (newChoiceObjects.length === 0) {
    //   newChoiceObjects.push(listItem.createChoice("ยังไม่มีการประเมินที่เปิดใช้งาน"));
    //   Logger.log("Dropdown was empty, added default placeholder.");
    // }

    listItem.setChoices(newChoiceObjects);
    Logger.log("Dropdown choices updated. Total final choices: " + newChoiceObjects.length);
    // --- สิ้นสุดส่วนที่ปรับปรุง ---
    
    return { success: true, message: "Google Form updated successfully." };

  } catch (e) {
    Logger.log('เกิดข้อผิดพลาดใน updateGoogleFormBasedOnStatuses: ' + e.toString() + " Stack: " + e.stack);
    let errorMessage = e.message;
    if (e.message.includes("Access denied: FormApp")) {
        errorMessage = "สคริปต์ไม่มีสิทธิ์ในการเข้าถึงหรือแก้ไข Google Form กรุณาตรวจสอบสิทธิ์";
    } else if (e.message.includes("No item with ID")) {
        errorMessage = `ไม่พบคำถาม (Item ID: ${DROPDOWN_ITEM_ID}) ใน Google Form ที่ระบุ`;
    }
    return { success: false, error: 'เกิดข้อผิดพลาดในการอัปเดต Google Form: ' + errorMessage };
  }
}

// --- ฟังก์ชันสำหรับการจัดการการตั้งค่าระบบทั่วไป (ปีการศึกษา & กำหนดส่งข้อมูล) ---

/**
 * ดึงการตั้งค่าทั่วไป (ปีการศึกษา และ กำหนดส่งข้อมูลเพิ่มเติม) จากชีท 'settingctpd'
 * @return {object} { success: boolean, academicYear: string, deadlineDate: string }
 */
function getCtpdSettings() {
  try {
    const ss = SpreadsheetApp.openById(STATUS_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SETTING_SHEET_NAME);
    if (!sheet) {
      Logger.log(`ไม่พบชีท "${SETTING_SHEET_NAME}" ใน Spreadsheet ID "${STATUS_SPREADSHEET_ID}"`);
      return { success: false, error: `ไม่พบชีทการตั้งค่า "${SETTING_SHEET_NAME}"` };
    }
    const academicYear = sheet.getRange(SETTING_CONFIG.academicYear.cell).getDisplayValue() || '2569';
    const deadlineDate = sheet.getRange(SETTING_CONFIG.deadlineDate.cell).getDisplayValue() || '30/10/2026';
    Logger.log(`CTPD Settings fetched: ปีการศึกษา ${academicYear}, กำหนดส่ง ${deadlineDate}`);
    return { success: true, academicYear: academicYear, deadlineDate: deadlineDate };
  } catch (e) {
    Logger.log('เกิดข้อผิดพลาดใน getCtpdSettings: ' + e.toString());
    return { success: false, error: 'เกิดข้อผิดพลาดในการดึงการตั้งค่า: ' + e.message };
  }
}

/**
 * อัปเดตการตั้งค่าทั่วไป (ปีการศึกษา และ กำหนดส่งข้อมูลเพิ่มเติม) ในชีท 'settingctpd'
 * @param {string} academicYear ปีการศึกษา เช่น '2569'
 * @param {string} deadlineDate วันที่กำหนดส่ง เช่น '30/10/2026'
 * @param {string} userDepartment สิทธิ์ของผู้ใช้ (ต้องเป็น 'all' เท่านั้น)
 * @return {object} ผลลัพธ์การทำงาน { success: boolean, message/error: string }
 */
function updateCtpdSettings(academicYear, deadlineDate, userDepartment) {
  if (userDepartment !== 'all') {
    Logger.log(`User "${userDepartment}" attempted to change CTPD settings. Denied.`);
    return { success: false, error: "คุณไม่มีสิทธิ์ในการแก้ไขการตั้งค่าระบบ" };
  }
  try {
    const ss = SpreadsheetApp.openById(STATUS_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SETTING_SHEET_NAME);
    if (!sheet) {
      Logger.log(`ไม่พบชีท "${SETTING_SHEET_NAME}"`);
      return { success: false, error: `ไม่พบชีทการตั้งค่า "${SETTING_SHEET_NAME}"` };
    }
    if (academicYear) {
      sheet.getRange(SETTING_CONFIG.academicYear.cell).setValue(String(academicYear).trim());
    }
    if (deadlineDate) {
      sheet.getRange(SETTING_CONFIG.deadlineDate.cell).setValue(String(deadlineDate).trim());
    }
    Logger.log(`อัปเดตการตั้งค่า CTPD สำเร็จ: ปีการศึกษา ${academicYear}, กำหนดส่ง ${deadlineDate}`);
    return { success: true, message: "บันทึกการตั้งค่าระบบเรียบร้อยแล้ว" };
  } catch (e) {
    Logger.log('เกิดข้อผิดพลาดใน updateCtpdSettings: ' + e.toString());
    return { success: false, error: 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า: ' + e.message };
  }
}

// --- สิ้นสุดฟังก์ชันใหม่ ---

// --- ฟังก์ชันจัดการฐานข้อมูลรายชื่อนิสิต (Student Roster CRUD & Import) ---
// Google Sheet สำหรับเก็บรายชื่อนิสิต
const STUDENT_ROSTER_SPREADSHEET_ID = '1Avnehuep6Cjhj084ExCSXK6O5zv_aMg3O2XKQoTAgvs';
const STUDENT_ROSTER_SHEET_NAME = 'Sheet1';

/**
 * ดึงข้อมูลรายชื่อนิสิตจาก Sheet1 พร้อมนับจำนวนการประเมินจาก Form Responses 1
 * @param {string} token - Session Token
 * @param {string} department - สาขาวิชาของผู้ใช้
 * @return {object} { success, students[], allDepartments[] }
 */
function getStudentRoster(token, department) {
  if (!validateToken(token)) {
    return { success: false, error: "การยืนยันตัวตนล้มเหลว Token ไม่ถูกต้อง" };
  }
  if (!department || typeof department !== 'string') {
    return { success: false, error: "ไม่พบข้อมูลสิทธิ์สาขาวิชา" };
  }

  const userDeptAccess = department.trim().toLowerCase();

  try {
    const ss = SpreadsheetApp.openById(STUDENT_ROSTER_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(STUDENT_ROSTER_SHEET_NAME);
    if (!sheet) {
      return { success: false, error: 'ไม่พบชีท "' + STUDENT_ROSTER_SHEET_NAME + '"' };
    }

    const allData = sheet.getDataRange().getDisplayValues();
    if (allData.length <= 1) {
      return { success: true, students: [], allDepartments: [] };
    }

    // นับจำนวนการประเมินจาก Form Responses 1
    var evalCountMap = {};
    try {
      var activeSS = SpreadsheetApp.getActiveSpreadsheet();
      var formSheet = activeSS.getSheetByName('Form Responses 1');
      if (formSheet) {
        var formData = formSheet.getDataRange().getDisplayValues();
        for (var fi = 1; fi < formData.length; fi++) {
          var fRow = formData[fi];
          if (fRow.length >= 6) {
            var evalKey = (fRow[4] || '').trim().toLowerCase() + '|' + (fRow[5] || '').trim().toLowerCase();
            if (evalKey !== '|') {
              evalCountMap[evalKey] = (evalCountMap[evalKey] || 0) + 1;
            }
          }
        }
      }
    } catch (evalErr) {
      Logger.log('Warning: ไม่สามารถนับจำนวนการประเมินได้: ' + evalErr.toString());
    }

    var deptSet = {};
    var students = [];

    for (var i = 1; i < allData.length; i++) {
      var row = allData[i];
      var prefix = (row[0] || '').trim();
      var firstName = (row[1] || '').trim();
      var lastName = (row[2] || '').trim();
      // row[3] = D = ARRAYFORMULA (คำนำหน้าชื่อ-นามสกุล) - ข้ามไป
      var major = (row[4] || '').trim(); // E = สาขาวิชา

      // ข้ามแถวว่าง
      if (!firstName && !lastName) continue;

      if (major) {
        deptSet[major] = true;
      }

      // กรองตามสาขาวิชา
      if (userDeptAccess !== 'all' && major.toLowerCase() !== userDeptAccess) {
        continue;
      }

      var evalKey = firstName.toLowerCase() + '|' + lastName.toLowerCase();
      var evalCount = evalCountMap[evalKey] || 0;

      students.push({
        sheetRow: i + 1,
        prefix: prefix,
        firstName: firstName,
        lastName: lastName,
        fullName: (row[3] || '').trim(),
        major: major,
        evalCount: evalCount
      });
    }

    var allDepartments = Object.keys(deptSet).sort(function(a, b) {
      return a.localeCompare(b, 'th');
    });

    Logger.log('getStudentRoster: คืนค่า ' + students.length + ' รายชื่อ, ' + allDepartments.length + ' สาขาวิชา');
    return { success: true, students: students, allDepartments: allDepartments };
  } catch (e) {
    console.error('เกิดข้อผิดพลาดใน getStudentRoster: ' + e.toString());
    return { success: false, error: 'เกิดข้อผิดพลาดในการดึงข้อมูลรายชื่อนิสิต: ' + e.message };
  }
}

/**
 * เพิ่มหรือแก้ไขข้อมูลนิสิตรายคนใน Sheet1
 * @param {string} token - Session Token
 * @param {string} department - สาขาวิชาของผู้ใช้
 * @param {object} studentData - { rowNumber (optional), prefix, firstName, lastName, major }
 * @return {object} { success, message, student }
 */
function saveStudentData(token, department, studentData) {
  if (!validateToken(token)) {
    return { success: false, error: "การยืนยันตัวตนล้มเหลว Token ไม่ถูกต้อง" };
  }
  if (!department || typeof department !== 'string') {
    return { success: false, error: "ไม่พบข้อมูลสิทธิ์สาขาวิชา" };
  }
  if (!studentData || !studentData.firstName || !studentData.lastName) {
    return { success: false, error: "กรุณาระบุชื่อและนามสกุลของนิสิต" };
  }

  var userDeptAccess = department.trim().toLowerCase();

  try {
    var ss = SpreadsheetApp.openById(STUDENT_ROSTER_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(STUDENT_ROSTER_SHEET_NAME);
    if (!sheet) {
      return { success: false, error: 'ไม่พบชีท "' + STUDENT_ROSTER_SHEET_NAME + '"' };
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);

    var prefix = String(studentData.prefix || '').trim();
    var firstName = String(studentData.firstName).trim();
    var lastName = String(studentData.lastName).trim();
    var major = String(studentData.major || '').trim();

    // บังคับสาขาวิชาของผู้ใช้ (หากไม่ใช่ admin)
    if (userDeptAccess !== 'all' && major.toLowerCase() !== userDeptAccess) {
      major = department.trim(); // บังคับใช้สาขาวิชาของตนเอง
    }

    var rowNum = studentData.rowNumber ? parseInt(studentData.rowNumber, 10) : null;

    if (rowNum && rowNum >= 2) {
      // แก้ไขข้อมูลเดิม
      var maxRow = sheet.getLastRow();
      if (rowNum > maxRow) {
        lock.releaseLock();
        return { success: false, error: 'แถวที่ ' + rowNum + ' ไม่มีอยู่ในชีท' };
      }

      // ตรวจสอบสิทธิ์ระดับสาขา
      if (userDeptAccess !== 'all') {
        var existingMajor = String(sheet.getRange(rowNum, 5).getValue()).trim().toLowerCase();
        if (existingMajor !== userDeptAccess) {
          lock.releaseLock();
          return { success: false, error: 'คุณไม่มีสิทธิ์แก้ไขนิสิตในสาขาวิชานี้' };
        }
      }

      sheet.getRange(rowNum, 1).setValue(prefix);   // A = คำนำหน้า
      sheet.getRange(rowNum, 2).setValue(firstName); // B = ชื่อ
      sheet.getRange(rowNum, 3).setValue(lastName);  // C = นามสกุล
      // D ข้ามไป (ARRAYFORMULA)
      sheet.getRange(rowNum, 5).setValue(major);     // E = สาขาวิชา

      lock.releaseLock();
      Logger.log('saveStudentData: แก้ไขข้อมูลแถวที่ ' + rowNum + ' สำเร็จ');
      return {
        success: true,
        message: 'แก้ไขข้อมูลนิสิต "' + firstName + ' ' + lastName + '" สำเร็จ',
        student: { sheetRow: rowNum, prefix: prefix, firstName: firstName, lastName: lastName, major: major }
      };
    } else {
      // เพิ่มข้อมูลใหม่ - หาแถวว่างถัดไปโดยดูคอลัมน์ A, B, C
      var lastRow = sheet.getLastRow();
      var newRow = lastRow + 1;

      // หาแถวว่างที่อาจอยู่ระหว่างกลาง (เซลล์ A ว่าง)
      if (lastRow >= 2) {
        var colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (var idx = 0; idx < colA.length; idx++) {
          if (!colA[idx][0] || String(colA[idx][0]).trim() === '') {
            newRow = idx + 2;
            break;
          }
        }
      }

      sheet.getRange(newRow, 1).setValue(prefix);   // A
      sheet.getRange(newRow, 2).setValue(firstName); // B
      sheet.getRange(newRow, 3).setValue(lastName);  // C
      // D ข้ามไป (ARRAYFORMULA)
      sheet.getRange(newRow, 5).setValue(major);     // E

      lock.releaseLock();
      Logger.log('saveStudentData: เพิ่มนิสิตใหม่ที่แถว ' + newRow + ' สำเร็จ');
      return {
        success: true,
        message: 'เพิ่มนิสิต "' + firstName + ' ' + lastName + '" สำเร็จ',
        student: { sheetRow: newRow, prefix: prefix, firstName: firstName, lastName: lastName, major: major }
      };
    }
  } catch (e) {
    console.error('เกิดข้อผิดพลาดใน saveStudentData: ' + e.toString());
    return { success: false, error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลนิสิต: ' + e.message };
  }
}

/**
 * ลบข้อมูลนิสิตเฉพาะเซลล์ A, B, C, E แล้วเลื่อนขึ้น (ไม่ลบทั้งแถว เพื่อรักษา ARRAYFORMULA)
 * @param {string} token - Session Token
 * @param {string} department - สาขาวิชาของผู้ใช้
 * @param {number} rowNumber - หมายเลขแถวที่ต้องการลบ
 * @return {object} { success, message }
 */
function deleteStudentCells(token, department, rowNumber) {
  if (!validateToken(token)) {
    return { success: false, error: "การยืนยันตัวตนล้มเหลว Token ไม่ถูกต้อง" };
  }
  if (!department || typeof department !== 'string') {
    return { success: false, error: "ไม่พบข้อมูลสิทธิ์สาขาวิชา" };
  }

  var userDeptAccess = department.trim().toLowerCase();
  var r = parseInt(rowNumber, 10);
  if (isNaN(r) || r < 2) {
    return { success: false, error: "หมายเลขแถวไม่ถูกต้อง" };
  }

  try {
    var ss = SpreadsheetApp.openById(STUDENT_ROSTER_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(STUDENT_ROSTER_SHEET_NAME);
    if (!sheet) {
      return { success: false, error: 'ไม่พบชีท "' + STUDENT_ROSTER_SHEET_NAME + '"' };
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);

    var maxRow = sheet.getLastRow();
    if (r > maxRow) {
      lock.releaseLock();
      return { success: false, error: 'แถวที่ ' + r + ' ไม่มีอยู่ในชีท' };
    }

    // ตรวจสอบสิทธิ์สาขาวิชา
    if (userDeptAccess !== 'all') {
      var existingMajor = String(sheet.getRange(r, 5).getValue()).trim().toLowerCase();
      if (existingMajor !== userDeptAccess) {
        lock.releaseLock();
        return { success: false, error: 'คุณไม่มีสิทธิ์ลบนิสิตในสาขาวิชานี้' };
      }
    }

    var deletedName = String(sheet.getRange(r, 2).getValue()).trim() + ' ' + String(sheet.getRange(r, 3).getValue()).trim();

    // ลบเฉพาะเซลล์ A, B, C (คอลัมน์ 1-3) แล้วเลื่อนขึ้น
    sheet.getRange(r, 1, 1, 3).deleteCells(SpreadsheetApp.Dimension.ROWS);
    // ลบเฉพาะเซลล์ E (คอลัมน์ 5) แล้วเลื่อนขึ้น
    // หลังจากลบ A,B,C ไปแล้ว ตำแหน่งของ E ยังอยู่ที่คอลัมน์ 5 แถวเดิม (เพราะ deleteCells ทำที่ A,B,C เลื่อนเฉพาะ 3 คอลัมน์นั้น)
    sheet.getRange(r, 5, 1, 1).deleteCells(SpreadsheetApp.Dimension.ROWS);

    lock.releaseLock();
    Logger.log('deleteStudentCells: ลบข้อมูลนิสิต "' + deletedName + '" ที่แถว ' + r + ' สำเร็จ (เฉพาะ A,B,C,E shift up)');
    return {
      success: true,
      message: 'ลบข้อมูลนิสิต "' + deletedName.trim() + '" สำเร็จ'
    };
  } catch (e) {
    console.error('เกิดข้อผิดพลาดใน deleteStudentCells: ' + e.toString());
    return { success: false, error: 'เกิดข้อผิดพลาดในการลบข้อมูลนิสิต: ' + e.message };
  }
}

/**
 * นำเข้ารายชื่อนิสิตจำนวนมาก (Batch Import) ลงใน Sheet1
 * @param {string} token - Session Token
 * @param {string} department - สาขาวิชาของผู้ใช้
 * @param {Array} studentsList - [{prefix, firstName, lastName, major}]
 * @param {string} duplicateMode - 'skip' | 'overwrite' | 'append'
 * @return {object} { success, importedCount, skippedCount, updatedCount, message }
 */
function batchImportStudents(token, department, studentsList, duplicateMode) {
  if (!validateToken(token)) {
    return { success: false, error: "การยืนยันตัวตนล้มเหลว Token ไม่ถูกต้อง" };
  }
  if (!department || typeof department !== 'string') {
    return { success: false, error: "ไม่พบข้อมูลสิทธิ์สาขาวิชา" };
  }
  if (!Array.isArray(studentsList) || studentsList.length === 0) {
    return { success: false, error: "ไม่มีรายชื่อนิสิตสำหรับนำเข้า" };
  }

  var userDeptAccess = department.trim().toLowerCase();
  var mode = (duplicateMode || 'skip').toLowerCase();

  try {
    var ss = SpreadsheetApp.openById(STUDENT_ROSTER_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(STUDENT_ROSTER_SHEET_NAME);
    if (!sheet) {
      return { success: false, error: 'ไม่พบชีท "' + STUDENT_ROSTER_SHEET_NAME + '"' };
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);

    // อ่านข้อมูลปัจจุบันทั้งหมดเพื่อตรวจสอบชื่อซ้ำ
    var existingData = sheet.getDataRange().getDisplayValues();
    var existingMap = {};
    for (var i = 1; i < existingData.length; i++) {
      var eRow = existingData[i];
      var eFirst = (eRow[1] || '').trim().toLowerCase();
      var eLast = (eRow[2] || '').trim().toLowerCase();
      if (eFirst || eLast) {
        existingMap[eFirst + '|' + eLast] = i + 1; // เก็บ row number
      }
    }

    var importedCount = 0;
    var skippedCount = 0;
    var updatedCount = 0;
    var newRows = [];

    for (var j = 0; j < studentsList.length; j++) {
      var st = studentsList[j];
      var prefix = String(st.prefix || '').trim();
      var firstName = String(st.firstName || '').trim();
      var lastName = String(st.lastName || '').trim();
      var major = String(st.major || '').trim();

      if (!firstName && !lastName) {
        skippedCount++;
        continue;
      }

      // บังคับสาขาวิชาของผู้ใช้ (หากไม่ใช่ admin)
      if (userDeptAccess !== 'all' && major) {
        if (major.toLowerCase() !== userDeptAccess) {
          major = department.trim();
        }
      } else if (userDeptAccess !== 'all' && !major) {
        major = department.trim();
      }

      var dupKey = firstName.toLowerCase() + '|' + lastName.toLowerCase();
      var existingRow = existingMap[dupKey];

      if (existingRow) {
        if (mode === 'skip') {
          skippedCount++;
          continue;
        } else if (mode === 'overwrite') {
          // อัปเดตแถวเดิม
          sheet.getRange(existingRow, 1).setValue(prefix);
          sheet.getRange(existingRow, 2).setValue(firstName);
          sheet.getRange(existingRow, 3).setValue(lastName);
          sheet.getRange(existingRow, 5).setValue(major);
          updatedCount++;
          continue;
        }
        // mode === 'append' → ไม่ต้องเช็คซ้ำ ใส่ต่อท้ายเลย
      }

      newRows.push({
        prefix: prefix,
        firstName: firstName,
        lastName: lastName,
        major: major
      });
      importedCount++;
    }

    // เขียนข้อมูลใหม่ทั้งหมดแบบ Batch (2 API calls แทนการวนลูปทีละเซลล์)
    if (newRows.length > 0) {
      // หาแถวว่างเริ่มต้น
      var lastRow = sheet.getLastRow();
      var startRow = lastRow + 1;

      // หาแถวว่างที่อาจอยู่ระหว่างกลาง (เซลล์ A ว่าง)
      if (lastRow >= 2) {
        var colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (var idx = 0; idx < colA.length; idx++) {
          if (!colA[idx][0] || String(colA[idx][0]).trim() === '') {
            startRow = idx + 2;
            break;
          }
        }
      }

      var batchABC = [];
      var batchE = [];
      for (var k = 0; k < newRows.length; k++) {
        batchABC.push([newRows[k].prefix, newRows[k].firstName, newRows[k].lastName]);
        batchE.push([newRows[k].major]);
      }

      // เขียน A:C (คำนำหน้า, ชื่อ, นามสกุล) - ข้ามคอลัมน์ D (ARRAYFORMULA)
      sheet.getRange(startRow, 1, batchABC.length, 3).setValues(batchABC);
      // เขียน E (สาขาวิชา)
      sheet.getRange(startRow, 5, batchE.length, 1).setValues(batchE);
    }

    lock.releaseLock();
    var msg = 'นำเข้าสำเร็จ ' + importedCount + ' รายการ';
    if (updatedCount > 0) msg += ', อัปเดตทับ ' + updatedCount + ' รายการ';
    if (skippedCount > 0) msg += ', ข้าม ' + skippedCount + ' รายการ';

    Logger.log('batchImportStudents: ' + msg);
    return {
      success: true,
      importedCount: importedCount,
      skippedCount: skippedCount,
      updatedCount: updatedCount,
      message: msg
    };
  } catch (e) {
    console.error('เกิดข้อผิดพลาดใน batchImportStudents: ' + e.toString());
    return { success: false, error: 'เกิดข้อผิดพลาดในการนำเข้ารายชื่อนิสิต: ' + e.message };
  }
}

// --- ฟังก์ชันสำหรับการค้นหาและแก้ไขชื่อ-นามสกุลนิสิต (Batch Student Name Editor) ---

/**
 * อัปเดตคำนำหน้า ชื่อ หรือนามสกุลของนิสิตในหลายแถวพร้อมกันใน Google Sheet
 * @param {string} token - Session Token สำหรับยืนยันสิทธิ์
 * @param {string} department - สาขาวิชาของผู้ใช้
 * @param {Array<number>} sheetRowNumbers - รายการหมายเลขแถวในชีทที่ต้องการอัปเดต
 * @param {string} newPrefix - คำนำหน้าใหม่ (หากไม่ต้องการเปลี่ยนให้ส่งค่าว่าง)
 * @param {string} newName - ชื่อใหม่ (หากไม่ต้องการเปลี่ยนให้ส่งค่าว่าง)
 * @param {string} newSurname - นามสกุลใหม่ (หากไม่ต้องการเปลี่ยนให้ส่งค่าว่าง)
 * @return {object} { success: boolean, updatedCount: number, message/error: string }
 */
function batchUpdateStudentNames(token, department, sheetRowNumbers, newPrefix, newName, newSurname) {
  if (!validateToken(token)) {
    return { success: false, error: "การยืนยันตัวตนล้มเหลว Token ไม่ถูกต้อง" };
  }

  if (!department || typeof department !== 'string') {
    return { success: false, error: "ไม่พบข้อมูลสิทธิ์สาขาวิชาของผู้ใช้งาน" };
  }

  if (!Array.isArray(sheetRowNumbers) || sheetRowNumbers.length === 0) {
    return { success: false, error: "ไม่มีรายการแถวที่ต้องการอัปเดต" };
  }

  const userDepartmentAccess = department.trim().toLowerCase();

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Form Responses 1');
    if (!sheet) {
      return { success: false, error: 'ไม่พบชีทข้อมูล "Form Responses 1"' };
    }

    const lock = LockService.getScriptLock();
    // รอ Lock สูงสุด 15 วินาที เพื่อความปลอดภัยเมื่อมีการบันทึกพร้อมกัน
    lock.waitLock(15000);

    let updatedCount = 0;
    const maxRow = sheet.getLastRow();

    sheetRowNumbers.forEach(function(rowNum) {
      const r = parseInt(rowNum, 10);
      if (isNaN(r) || r < 2 || r > maxRow) return;

      // ตรวจสอบสิทธิ์ระดับสาขาวิชา
      if (userDepartmentAccess !== 'all') {
        const majorVal = sheet.getRange(r, 7).getValue();
        if (String(majorVal).trim().toLowerCase() !== userDepartmentAccess) {
          return; // ข้ามแถวที่ไม่อยู่ในสาขาวิชาที่ผู้ใช้มีสิทธิ์
        }
      }

      // คอลัมน์ 4 (D) = คำนำหน้า
      if (newPrefix && String(newPrefix).trim() !== '') {
        sheet.getRange(r, 4).setValue(String(newPrefix).trim());
      }
      // คอลัมน์ 5 (E) = ชื่อ
      if (newName && String(newName).trim() !== '') {
        sheet.getRange(r, 5).setValue(String(newName).trim());
      }
      // คอลัมน์ 6 (F) = นามสกุล
      if (newSurname && String(newSurname).trim() !== '') {
        sheet.getRange(r, 6).setValue(String(newSurname).trim());
      }

      updatedCount++;
    });

    lock.releaseLock();
    Logger.log(`batchUpdateStudentNames: อัปเดตข้อมูลนิสิตสำเร็จ ${updatedCount} แถว`);
    return {
      success: true,
      updatedCount: updatedCount,
      message: `อัปเดตข้อมูลชื่อ-นามสกุลนิสิตสำเร็จ ${updatedCount} รายการ`
    };
  } catch (e) {
    console.error("เกิดข้อผิดพลาดใน batchUpdateStudentNames: " + e.toString());
    return { success: false, error: "เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + e.message };
  }
}
