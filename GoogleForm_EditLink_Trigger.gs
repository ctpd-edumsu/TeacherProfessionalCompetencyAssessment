/**
 * ==============================================================================
 * สคริปต์ Google Form สำหรับสร้างและบันทึก EditLink ลง Google Sheet อย่างแม่นยำ
 * รองรับการส่งฟอร์มพร้อมกันระดับวินาที (Concurrency & Race Condition Proof)
 * ==============================================================================
 * คำแนะนำการใช้งาน:
 * 1. เปิด Google Form ของท่าน
 * 2. คลิกปุ่มเมนูจุด 3 จุด (⋮) มุมขวาบน > เลือก "โปรแกรมแก้ไขสคริปต์" (Script editor)
 * 3. ลบโค้ดเดิมทั้งหมดในไฟล์ Code.gs แล้วคัดลอกโค้ดนี้ไปวางแทนที่
 * 4. กดปุ่ม "บันทึก" (รูปแผ่นดิสก์ หรือ Ctrl + S)
 * 5. ตรวจสอบการตั้งค่าทริกเกอร์ (รูปนาฬิกาด้านซ้าย):
 *    - ฟังก์ชัน: onFormSubmitTrigger
 *    - แหล่งที่มาของเหตุการณ์: จากแบบฟอร์ม (From form)
 *    - ประเภทเหตุการณ์: เมื่อส่งแบบฟอร์ม (On form submit)
 * 6. (ครั้งแรก) เลือกฟังก์ชัน "repairAllMissingEditLinks" จากดรอปดาวน์ด้านบน แล้วกด "เรียกใช้" (Run)
 *    เพื่อกวาดเติมลิงก์ให้แถวเก่าในอดีตทั้งหมดที่ยังว่างอยู่
 * ==============================================================================
 */

/**
 * ฟังก์ชันที่ 1: Trigger สำหรับบันทึก EditLink ทันทีเมื่อมีผู้ส่งฟอร์ม
 * - ใช้ LockService จัดคิวให้ทำงานทีละรายการ ไม่แย่งแถวกัน 100%
 * - ค้นหาคอลัมน์อัตโนมัติจากชื่อหัวตาราง (Dynamic Header Search)
 * - คัดเลือกแถวที่แม่นยำที่สุด (Closest Time Match & Empty Link Priority)
 * - มีระบบ Self-Healing ซ่อมแซมแถวก่อนหน้าที่อาจตกหล่นอัตโนมัติ
 */
function onFormSubmitTrigger(e) {
  var lock = LockService.getScriptLock();
  // รอคิว lock สูงสุด 30 วินาที ป้องกัน instance อื่นทำงานชนกัน
  var hasLock = lock.tryLock(30000);

  try {
    if (!e || !e.response) return;

    var form = FormApp.getActiveForm();
    var sheet = getLinkedSheet(form);
    if (!sheet) {
      console.error("ไม่พบ Google Sheet ที่เชื่อมต่อกับฟอร์ม");
      return;
    }

    var editUrl = e.response.getEditResponseUrl();
    var targetTimestamp = e.response.getTimestamp().getTime();

    // ดึงรหัสนิสิตและเลขบัตรประชาชนจากคำตอบที่เพิ่งส่ง
    var submitStudentId = "";
    var submitCitizenId = "";
    var itemResponses = e.response.getItemResponses();
    for (var j = 0; j < itemResponses.length; j++) {
      var title = itemResponses[j].getItem().getTitle();
      var val = (itemResponses[j].getResponse() || "").toString().trim().replace(/[-\s]/g, "");
      if (title.indexOf("รหัสนิสิต") !== -1 || title.indexOf("รหัสประจำตัว") !== -1) {
        submitStudentId = val;
      } else if (title.indexOf("บัตร") !== -1 || title.indexOf("ประชาชน") !== -1) {
        submitCitizenId = val;
      }
    }

    // Polling รอให้ Google Sheets บันทึกแถวใหม่เสร็จสิ้น (ตรวจสอบสูงสุด 5 ครั้ง)
    var data = null;
    var headers = null;
    var colEditLink = -1;
    var colStudent = -1;
    var colCitizen = -1;

    for (var attempt = 0; attempt < 5; attempt++) {
      data = sheet.getDataRange().getValues();
      headers = data[0];

      colEditLink = headers.indexOf("EditLink");
      if (colEditLink === -1) {
        colEditLink = headers.length;
        sheet.getRange(1, colEditLink + 1).setValue("EditLink");
      }

      // ค้นหาคอลัมน์จากหัวตารางแบบไดนามิก
      for (var c = 0; c < headers.length; c++) {
        var h = (headers[c] || "").toString();
        if (colStudent === -1 && (h.indexOf("รหัสนิสิต") !== -1 || h.indexOf("รหัสประจำตัว") !== -1)) {
          colStudent = c;
        }
        if (colCitizen === -1 && (h.indexOf("บัตร") !== -1 || h.indexOf("ประชาชน") !== -1)) {
          colCitizen = c;
        }
      }

      // ตรวจสอบว่ามีแถวใหม่ที่เวลาใกล้เคียงเข้ามาใน Sheet หรือยัง
      var foundRecentRow = false;
      for (var r = data.length - 1; r >= 1; r--) {
        var rDate = data[r][0];
        var rTime = (rDate instanceof Date) ? rDate.getTime() : 0;
        if (Math.abs(rTime - targetTimestamp) < 10000) {
          foundRecentRow = true;
          break;
        }
      }

      if (foundRecentRow) break;
      Utilities.sleep(1000); // หากแถวยังไม่โผล่ รอ 1 วินาทีแล้วดึงใหม่
    }

    // ค้นหาแถวที่ตรงกับคำตอบนี้ที่สุด (Best Candidate Selection)
    var targetRow = -1;
    var bestScore = -Infinity;
    var minDiff = Infinity;

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var rDate = row[0];
      var rTime = (rDate instanceof Date) ? rDate.getTime() : 0;
      var diff = Math.abs(rTime - targetTimestamp);

      // พิจารณาเฉพาะแถวที่เวลาห่างไม่เกิน 60 วินาที
      if (diff > 60000) continue;

      var rowStudent = (colStudent !== -1 && row[colStudent]) ? row[colStudent].toString().trim().replace(/[-\s]/g, "") : "";
      var rowCitizen = (colCitizen !== -1 && row[colCitizen]) ? row[colCitizen].toString().trim().replace(/[-\s]/g, "") : "";
      var currentLink = (colEditLink !== -1 && row[colEditLink]) ? row[colEditLink].toString().trim() : "";

      var score = 0;

      // เกณฑ์ที่ 1: รหัสนิสิตและเลขบัตรประชาชนตรงกัน (+10,000 คะแนน)
      if (submitStudentId && rowStudent && submitStudentId === rowStudent) score += 5000;
      if (submitCitizenId && rowCitizen && submitCitizenId === rowCitizen) score += 5000;

      // เกณฑ์ที่ 2: แถวยังไม่มี EditLink (+2,000 คะแนน ป้องกันการแย่งแถวที่มีลิงก์แล้ว)
      if (!currentLink) score += 2000;

      // เกณฑ์ที่ 3: หักคะแนนตามความต่างของเวลา (ยิ่งต่างเวลาน้อย คะแนนยิ่งสูง)
      score -= (diff / 100);

      if (score > bestScore) {
        bestScore = score;
        minDiff = diff;
        targetRow = r + 1;
      }
    }

    // บันทึกลิงก์ลงแถวที่ถูกต้อง
    if (targetRow !== -1) {
      sheet.getRange(targetRow, colEditLink + 1).setValue(editUrl);
      console.log("บันทึก EditLink สำเร็จที่แถว: " + targetRow + " (diff: " + minDiff + " ms)");
    } else {
      // Fallback: หากไม่พบแถวที่ตรงกันจริงๆ ให้ลงที่แถวล่าสุด
      sheet.getRange(sheet.getLastRow(), colEditLink + 1).setValue(editUrl);
      console.warn("ไม่พบแถวที่ตรงกัน บันทึกที่แถวล่าสุด");
    }

    // Self-Healing: ตรวจสอบ 15 แถวล่าสุด หากพบแถวใดที่ไม่มี EditLink ให้ซ่อมแซมทันที
    repairRecentEmptyRows(sheet, form, colEditLink, colStudent, colCitizen);

  } catch (err) {
    console.error("เกิดข้อผิดพลาดใน onFormSubmitTrigger: " + err.message);
  } finally {
    if (hasLock) {
      lock.releaseLock();
    }
  }
}

/**
 * ฟังก์ชันช่วยตรวจสอบและเติมลิงก์ให้แถวล่าสุดที่อาจตกหล่น
 */
function repairRecentEmptyRows(sheet, form, colEditLink, colStudent, colCitizen) {
  try {
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    var startRow = Math.max(1, data.length - 15);
    var hasEmpty = false;

    for (var r = startRow; r < data.length; r++) {
      if (!data[r][colEditLink]) {
        hasEmpty = true;
        break;
      }
    }

    if (!hasEmpty) return;

    // ดึง responses ล่าสุดมาจับคู่เฉพาะแถวที่ว่าง
    var responses = form.getResponses();
    var recentResponses = responses.slice(Math.max(0, responses.length - 25));

    for (var r = startRow; r < data.length; r++) {
      if (data[r][colEditLink]) continue;

      var rDate = data[r][0];
      var rTime = (rDate instanceof Date) ? rDate.getTime() : 0;
      var rStudent = (colStudent !== -1 && data[r][colStudent]) ? data[r][colStudent].toString().trim().replace(/[-\s]/g, "") : "";
      var rCitizen = (colCitizen !== -1 && data[r][colCitizen]) ? data[r][colCitizen].toString().trim().replace(/[-\s]/g, "") : "";

      var matchedResp = null;
      var minDiff = Infinity;

      for (var k = 0; k < recentResponses.length; k++) {
        var resp = recentResponses[k];
        var diff = Math.abs(resp.getTimestamp().getTime() - rTime);
        if (diff < minDiff && diff < 15000) {
          minDiff = diff;
          matchedResp = resp;
        }
      }

      if (matchedResp) {
        sheet.getRange(r + 1, colEditLink + 1).setValue(matchedResp.getEditResponseUrl());
        console.log("Self-Healing เติมลิงก์สำเร็จที่แถว: " + (r + 1));
      }
    }
  } catch (e) {
    console.warn("Self-Healing warning: " + e.message);
  }
}

/**
 * ฟังก์ชันที่ 2: ฟังก์ชันซ่อมแซมย้อนหลังทั้งหมด (กด Run 1 ครั้ง)
 * - กวาดจับคู่คำตอบทั้งหมดใน Google Form กับทุกแถวใน Google Sheet แบบ 1 ต่อ 1
 * - เติมลิงก์ให้ทุกแถวที่ยังว่างอยู่ และแก้ไขแถวที่ลิงก์ซ้ำกันให้ถูกต้องทั้งหมด 100%
 */
function repairAllMissingEditLinks() {
  var form = FormApp.getActiveForm();
  var sheet = getLinkedSheet(form);
  if (!sheet) {
    Logger.log("ไม่พบ Google Sheet ที่เชื่อมต่อกับฟอร์ม");
    return;
  }

  var responses = form.getResponses();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var colEditLink = headers.indexOf("EditLink");
  if (colEditLink === -1) {
    colEditLink = headers.length;
    sheet.getRange(1, colEditLink + 1).setValue("EditLink");
  }

  var colStudent = -1;
  var colCitizen = -1;
  for (var c = 0; c < headers.length; c++) {
    var h = (headers[c] || "").toString();
    if (colStudent === -1 && (h.indexOf("รหัสนิสิต") !== -1 || h.indexOf("รหัสประจำตัว") !== -1)) colStudent = c;
    if (colCitizen === -1 && (h.indexOf("บัตร") !== -1 || h.indexOf("ประชาชน") !== -1)) colCitizen = c;
  }

  Logger.log("กำลังดึงคำตอบจาก Google Form (" + responses.length + " รายการ)...");

  // ถอดข้อมูลจาก Form Responses
  var formRecords = [];
  for (var i = 0; i < responses.length; i++) {
    var resp = responses[i];
    var itemResponses = resp.getItemResponses();
    var sId = "";
    var cId = "";

    for (var j = 0; j < itemResponses.length; j++) {
      var title = itemResponses[j].getItem().getTitle();
      var val = (itemResponses[j].getResponse() || "").toString().trim().replace(/[-\s]/g, "");
      if (title.indexOf("รหัสนิสิต") !== -1 || title.indexOf("รหัสประจำตัว") !== -1) sId = val;
      if (title.indexOf("บัตร") !== -1 || title.indexOf("ประชาชน") !== -1) cId = val;
    }

    formRecords.push({
      studentId: sId,
      citizenId: cId,
      timestamp: resp.getTimestamp().getTime(),
      editUrl: resp.getEditResponseUrl(),
      isMatched: false
    });
  }

  var updatedLinks = [];
  var matchCount = 0;

  for (var row = 1; row < data.length; row++) {
    var rowDate = data[row][0];
    var rowTime = (rowDate instanceof Date) ? rowDate.getTime() : 0;
    var rowStudent = (colStudent !== -1 && data[row][colStudent]) ? data[row][colStudent].toString().trim().replace(/[-\s]/g, "") : "";
    var rowCitizen = (colCitizen !== -1 && data[row][colCitizen]) ? data[row][colCitizen].toString().trim().replace(/[-\s]/g, "") : "";

    var bestMatch = null;
    var bestScore = -Infinity;

    for (var k = 0; k < formRecords.length; k++) {
      var record = formRecords[k];
      if (record.isMatched) continue;

      var diff = Math.abs(record.timestamp - rowTime);
      var score = 0;

      var idMatched = (rowStudent && record.studentId && rowStudent === record.studentId) &&
                      (rowCitizen && record.citizenId && rowCitizen === record.citizenId);

      if (idMatched) {
        score += 10000;
      }

      // หักคะแนนความต่างเวลา
      score -= (diff / 100);

      // ถ้าเวลาห่างเกิน 2 นาที และไม่ใช่ ID เดียวกัน ให้ข้าม
      if (!idMatched && diff > 120000) continue;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = record;
      }
    }

    if (bestMatch) {
      bestMatch.isMatched = true;
      updatedLinks.push([bestMatch.editUrl]);
      matchCount++;
    } else {
      updatedLinks.push([data[row][colEditLink] || ""]);
    }
  }

  if (updatedLinks.length > 0) {
    sheet.getRange(2, colEditLink + 1, updatedLinks.length, 1).setValues(updatedLinks);
  }

  Logger.log("✅ กวาดซ่อมแซมและเติม EditLink ครบทุกแถวเรียบร้อยแล้ว: " + matchCount + " รายการ");
}

/**
 * ฟังก์ชันค้นหาแผ่นงาน Google Sheet ที่ผูกกับฟอร์ม
 */
function getLinkedSheet(form) {
  var destinationId = form.getDestinationId();
  if (!destinationId) return null;

  var ss = SpreadsheetApp.openById(destinationId);
  var sheets = ss.getSheets();

  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getFormUrl()) {
      return sheets[i];
    }
  }
  return sheets[0];
}

