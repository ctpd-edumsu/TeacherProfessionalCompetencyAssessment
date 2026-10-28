/**
 * ==============================================================================
 * ระบบ Backend สำหรับตรวจสอบสิทธิ์ 2 ค่า (รหัสนิสิต + เลขบัตรประชาชน)
 * เพื่อค้นหาลิงก์ EditLink (คอลัมน์ AE) ของ Google Form รอบล่าสุด
 * ==============================================================================
 * คำแนะนำการติดตั้ง:
 * 1. เปิด Google Sheet ที่เก็บคำตอบของฟอร์ม
 * 2. ไปที่เมนู "ส่วนขยาย" (Extensions) > "Apps Script"
 * 3. คัดลอกโค้ดนี้ทั้งหมดไปวางแทนที่ในไฟล์ Code.gs
 * 4. กดปุ่ม "บันทึก" (รูปแผ่นดิสก์)
 * 5. กดปุ่ม "การทำให้ใช้งานได้" (Deploy) มุมขวาบน > เลือก "การทำให้ใช้งานได้รายการใหม่" (New deployment)
 * 6. เลือกประเภท: "เว็บแอป" (Web app)
 *    - คำอธิบาย: ระบบตรวจสอบสิทธิ์แก้ไขฟอร์ม
 *    - ดำเนินการในฐานะ (Execute as): "ฉัน" (Me)
 *    - ผู้ที่มีสิทธิ์เข้าถึง (Who has access): "ทุกคน" (Anyone)
 * 7. กดปุ่ม "ทำให้ใช้งานได้" (Deploy) แล้วคัดลอก "URL ของเว็บแอป" (Web App URL)
 * 8. นำ URL นั้นไปวางในไฟล์ editResponse.html ตรงตัวแปร WEB_APP_URL
 * ==============================================================================
 */

function doGet(e) {
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    if (!e || !e.parameter) {
      return output.setContent(JSON.stringify({
        success: false,
        message: "ไม่พบพารามิเตอร์ที่ส่งเข้ามา กรุณาระบุ studentId และ citizenId"
      }));
    }

    // 1. รับค่าและทำความสะอาด (ตัดช่องว่างและขีดออก)
    var studentId = (e.parameter.studentId || "").toString().trim().replace(/[-\s]/g, "");
    var citizenId = (e.parameter.citizenId || "").toString().trim().replace(/[-\s]/g, "");

    if (!studentId || !citizenId) {
      return output.setContent(JSON.stringify({
        success: false,
        message: "กรุณาระบุรหัสนิสิตและเลขประจำตัวประชาชนให้ครบถ้วน"
      }));
    }

    // 2. ดึงข้อมูลจาก Google Sheet
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getResponsesSheet(ss);
    
    if (!sheet) {
      return output.setContent(JSON.stringify({
        success: false,
        message: "ไม่พบแผ่นงานข้อมูลในระบบ กรุณาตรวจสอบการตั้งค่า Sheet"
      }));
    }

    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return output.setContent(JSON.stringify({
        success: false,
        message: "ยังไม่มีข้อมูลคำตอบในระบบ"
      }));
    }

    // 3. กำหนดตำแหน่งคอลัมน์ (0-indexed)
    // คอลัมน์ E = Index 4, คอลัมน์ F = Index 5, คอลัมน์ AE = Index 30
    var colStudent = 4;
    var colCitizen = 5;
    var colEditLink = 30;

    // ตรวจสอบจากหัวตาราง (Headers) เผื่อคอลัมน์ขยับ
    var headers = data[0];
    var editHeaderIndex = headers.indexOf("EditLink");
    if (editHeaderIndex !== -1) {
      colEditLink = editHeaderIndex;
    }

    var foundUrl = null;
    var foundTimestamp = null;

    // 4. วนลูปค้นหาจาก "แถวล่างสุดขึ้นบน" เพื่อให้ได้คำตอบรอบล่าสุดเสมอ (Latest Submission)
    for (var i = data.length - 1; i >= 1; i--) {
      var row = data[i];
      var rowStudent = (row[colStudent] || "").toString().trim().replace(/[-\s]/g, "");
      var rowCitizen = (row[colCitizen] || "").toString().trim().replace(/[-\s]/g, "");

      if (rowStudent === studentId && rowCitizen === citizenId) {
        var rawUrl = (row[colEditLink] || "").toString().trim();
        if (rawUrl && rawUrl.indexOf("http") !== -1) {
          foundUrl = rawUrl;
          foundTimestamp = row[0]; // คอลัมน์แรกปกติเป็น Timestamp
          break; // เจออันล่าสุดแล้ว หยุดค้นหาทันที
        }
      }
    }

    // 5. ส่งผลลัพธ์กลับ
    if (foundUrl) {
      return output.setContent(JSON.stringify({
        success: true,
        editUrl: foundUrl,
        studentId: studentId,
        timestamp: foundTimestamp ? foundTimestamp.toString() : ""
      }));
    } else {
      return output.setContent(JSON.stringify({
        success: false,
        message: "ไม่พบข้อมูลที่ตรงกับรหัสนิสิตและเลขประจำตัวประชาชนนี้ หรือยังไม่มีลิงก์แก้ไขสำหรับรายการนี้"
      }));
    }

  } catch (err) {
    return output.setContent(JSON.stringify({
      success: false,
      message: "เกิดข้อผิดพลาดในการประมวลผล: " + err.message
    }));
  }
}

/**
 * ฟังก์ชันช่วยค้นหาแผ่นงานคำตอบ
 */
function getResponsesSheet(ss) {
  var sheets = ss.getSheets();
  // หาแผ่นงานที่มีการผูก Form URL
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getFormUrl()) {
      return sheets[i];
    }
  }
  // ถ้าไม่พบ ให้ใช้แผ่นงานแรก
  return sheets[0];
}

