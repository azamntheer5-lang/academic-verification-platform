'use client'

// ── PDF Certificate Generator (Print-to-PDF) ────────────────────────────────
// Opens a new window with a print-optimized academic certificate layout and
// triggers the browser's print dialog. The user can save as PDF from there.
// This approach gives us pixel-perfect control over the certificate design
// (headers, tables, watermark seal) without bundling a heavy PDF library.

export interface CertificateItem {
  quote: string
  author: string
  status: string
  verifiedTitle: string | null
  verifiedAuthor: string | null
  verifiedPage: string | null
  fullApa: string | null
}

export interface CertificateData {
  totalChecked: number
  authenticatedCount: number
  suspiciousCount: number
  items: CertificateItem[]
}

const STATUS_LABEL: Record<string, string> = {
  VERIFIED_EXACT: 'موثّق حرفياً',
  VERIFIED_CORRECTED: 'موثّق مع تصحيح الصفحة',
  VERIFIED_SEMANTIC: 'موثّق دلالياً',
  ALTERNATIVE_FOUND: 'بديل عالمي معتمد',
  NOT_FOUND: 'غير موجود / مشبوه',
  HALLUCINATION: 'هلوسة أكاديمية',
  ERROR: 'خطأ',
}

export function generateCertificate(data: CertificateData) {
  const html = buildCertificateHtml(data)

  // Strategy 1: open a new window (preferred — gives the user a full tab to
  // review the certificate before printing).
  const win = window.open('', '_blank', 'width=900,height=1200')
  if (win && !win.closed) {
    win.document.write(html)
    win.document.close()
    return
  }

  // Strategy 2 (fallback): popup was blocked. Write the certificate into a
  // hidden iframe in the current document and trigger print from there. This
  // works even with strict popup blockers.
  const existing = document.getElementById('__cert_iframe__') as HTMLIFrameElement | null
  if (existing) existing.remove()
  const iframe = document.createElement('iframe')
  iframe.id = '__cert_iframe__'
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (doc) {
    doc.open()
    doc.write(html)
    doc.close()
    // Give the iframe a tick to render before printing.
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch {
        // last resort: open in same tab
        document.write(html)
      }
      setTimeout(() => iframe.remove(), 1000)
    }, 600)
  }
}

function buildCertificateHtml(data: CertificateData): string {

  const dateStr = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const rows = data.items
    .map(
      (item, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="quote">${escapeHtml(item.quote.slice(0, 120))}${item.quote.length > 120 ? '…' : ''}</td>
        <td>${escapeHtml(item.verifiedTitle || item.author || '—')}</td>
        <td>${escapeHtml(item.verifiedAuthor || item.author || '—')}</td>
        <td class="page">${item.verifiedPage ? 'صـ ' + escapeHtml(item.verifiedPage) : '—'}</td>
        <td>${escapeHtml(item.fullApa || '—')}</td>
        <td class="status ${statusClass(item.status)}">${STATUS_LABEL[item.status] || item.status}</td>
      </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>شهادة فحص الأمانة العلمية</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Cairo', 'Amiri', 'Times New Roman', serif;
    color: #1e293b;
    background: #fff;
    padding: 18mm 14mm;
    position: relative;
  }
  /* watermark seal */
  .watermark {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-28deg);
    font-size: 110px;
    font-weight: 900;
    color: rgba(16, 185, 129, 0.06);
    pointer-events: none;
    z-index: 0;
    white-space: nowrap;
    letter-spacing: 6px;
  }
  .content { position: relative; z-index: 1; }
  /* header */
  .header {
    text-align: center;
    border: 3px double #0f172a;
    border-bottom: none;
    padding: 22px 16px 18px;
    background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  }
  .header .seal {
    display: inline-block;
    width: 56px; height: 56px;
    border: 2.5px solid #ca8a04;
    border-radius: 50%;
    color: #ca8a04;
    font-size: 28px;
    line-height: 52px;
    margin-bottom: 8px;
    background: #fffbeb;
  }
  .header h1 {
    font-size: 24px;
    color: #0f172a;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .header .subtitle {
    font-size: 13px;
    color: #64748b;
  }
  .header .gold-line {
    height: 2px;
    background: #ca8a04;
    margin: 12px auto 0;
    width: 60%;
  }
  /* doc title */
  .doc-title {
    text-align: center;
    margin: 22px 0 6px;
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
  }
  .doc-meta {
    text-align: center;
    font-size: 12px;
    color: #64748b;
    margin-bottom: 18px;
  }
  /* stats */
  .stats {
    display: flex;
    justify-content: center;
    gap: 14px;
    margin: 18px 0 22px;
  }
  .stat {
    flex: 1;
    max-width: 180px;
    border: 1.5px solid #cbd5e1;
    border-radius: 10px;
    padding: 12px 8px;
    text-align: center;
    background: #f8fafc;
  }
  .stat .v { font-size: 26px; font-weight: 800; line-height: 1; }
  .stat .l { font-size: 11px; color: #475569; margin-top: 4px; }
  .stat.total .v { color: #0f172a; }
  .stat.auth .v { color: #059669; }
  .stat.susp .v { color: #dc2626; }
  /* table */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-top: 8px;
  }
  thead th {
    background: #0f172a;
    color: #fff;
    padding: 9px 6px;
    font-weight: 700;
    text-align: center;
    border: 1px solid #0f172a;
  }
  tbody td {
    padding: 8px 6px;
    border: 1px solid #cbd5e1;
    vertical-align: top;
    text-align: right;
  }
  td.num, td.page { text-align: center; white-space: nowrap; }
  td.status { text-align: center; font-weight: 700; white-space: nowrap; }
  td.status.ok { color: #059669; background: #ecfdf5; }
  td.status.bad { color: #dc2626; background: #fef2f2; }
  td.status.warn { color: #d97706; background: #fffbeb; }
  /* footer */
  .footer {
    margin-top: 26px;
    padding-top: 14px;
    border-top: 2px solid #ca8a04;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #475569;
  }
  .footer .signature {
    text-align: center;
  }
  .footer .signature .line {
    border-top: 1px solid #475569;
    width: 180px;
    margin-bottom: 4px;
  }
  .footer .qr {
    width: 54px; height: 54px;
    border: 1.5px solid #0f172a;
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; text-align: center;
    color: #0f172a;
    background: #fff;
  }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
  .print-btn {
    position: fixed; top: 10px; left: 10px;
    background: #0f172a; color: #fff; border: none;
    padding: 10px 18px; border-radius: 8px; font-size: 14px;
    cursor: pointer; z-index: 100;
    font-family: inherit;
  }
  .print-btn:hover { background: #1e293b; }
</style>
</head>
<body onload="setTimeout(function(){ window.print(); }, 400)">
  <div class="watermark">معتمد ✓ موثّق</div>
  <button class="print-btn no-print" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
  <div class="content">
    <div class="header">
      <div class="seal">✓</div>
      <h1>منصة التحقق الأكاديمي الشاملة</h1>
      <div class="subtitle">Academic Integrity Verification Platform · شهادة فحص موثّقة</div>
      <div class="gold-line"></div>
    </div>
    <div class="doc-title">شهادة فحص الأمانة العلمية</div>
    <div class="doc-meta">تاريخ الإصدار: ${dateStr} · رقم الشهادة: AVC-${Date.now().toString(36).toUpperCase()}</div>
    <div class="stats">
      <div class="stat total"><div class="v">${data.totalChecked}</div><div class="l">إجمالي المراجع المفحوصة</div></div>
      <div class="stat auth"><div class="v">${data.authenticatedCount}</div><div class="l">مراجع موثّقة</div></div>
      <div class="stat susp"><div class="v">${data.suspiciousCount}</div><div class="l">مراجع مشبوهة / هلوسة</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>النص المقتبس</th>
          <th>العنوان الموثّق</th>
          <th>المؤلف</th>
          <th>الصفحة</th>
          <th>التوثيق (APA 7)</th>
          <th>الحالة</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px">لا توجد بيانات</td></tr>'}
      </tbody>
    </table>
    <div class="footer">
      <div class="qr">ختم<br>إلكتروني</div>
      <div class="signature">
        <div class="line"></div>
        نظام التحقق الهجين · توقيع آلي معتمد<br>
        <span style="color:#ca8a04;font-weight:700">تطوير وإشراف: Azzam</span>
      </div>
      <div style="text-align:left">
        منصة التحقق الأكاديمي الشاملة<br>
        © ${new Date().getFullYear()}
      </div>
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function statusClass(status: string): string {
  if (['VERIFIED_EXACT', 'VERIFIED_CORRECTED', 'VERIFIED_SEMANTIC', 'ALTERNATIVE_FOUND'].includes(status)) return 'ok'
  if (['NOT_FOUND', 'HALLUCINATION'].includes(status)) return 'bad'
  return 'warn'
}
