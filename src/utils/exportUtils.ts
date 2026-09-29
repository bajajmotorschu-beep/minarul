/**
 * CSV and Print Export Utilities for ERP Tables
 */

export function exportToCSV(filename: string, rows: (string | number)[][], headers: string[]) {
  const escapeCell = (val: string | number | undefined | null) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function printSection(title: string, elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) {
    window.print();
    return;
  }
  const printWindow = window.open('', '', 'width=900,height=700');
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.document.write(`
    <html>
      <head>
        <title>${title} - MINARUL FASHION HOUSE</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #1c1917; }
          h1 { font-size: 20px; margin-bottom: 4px; font-weight: bold; }
          p.sub { font-size: 12px; color: #78716c; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th, td { border: 1px solid #e7e5e4; padding: 8px 10px; text-align: left; }
          th { background: #f5f5f4; font-weight: 600; }
          .money { font-family: monospace; font-weight: bold; }
          @media print {
            button { display: none !important; }
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p class="sub">MINARUL FASHION HOUSE ERP Report • Generated on ${new Date().toLocaleString('en-BD')}</p>
        ${el.innerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 350);
}
