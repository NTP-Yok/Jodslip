# จดสลิป

แอพจดรายรับรายจ่ายจากสลิปโอนเงิน (กสิกร กรุงไทย SCB) ใช้ออฟไลน์ได้ ข้อมูลเก็บในเครื่องเท่านั้น

## วิธีเอาขึ้น GitHub Pages
1. เข้า github.com → New repository → ตั้งชื่อ เช่น `jodslip` → Public → Create
2. กด "uploading an existing file" → เลือกไฟล์ทั้งหมด 10 ไฟล์ → Commit changes
3. Settings → Pages → Branch: `main` / `(root)` → Save
4. รอ 1–2 นาที แล้วเปิด `https://<ชื่อผู้ใช้>.github.io/jodslip/`

โค้ดใน repo เป็นสาธารณะ แต่ข้อมูลรายรับรายจ่ายอยู่ในมือถือแต่ละเครื่อง ไม่ได้ขึ้น GitHub

## ไฟล์
- `index.html` หน้าตาแอพ · `app.js` การทำงาน · `parser.js` ตัวแยกข้อมูลสลิป
- `sw.js` ทำให้ใช้ออฟไลน์ได้ และเก็บตัวอ่านสลิป (Tesseract) ไว้ในเครื่อง
- `manifest.webmanifest` + ไอคอน (.png/.svg) ใช้ตอนติดตั้งลงหน้าจอ
