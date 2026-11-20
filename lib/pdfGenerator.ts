const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const RENDER_SCALE = 2;

async function loadPdfLibraries() {
  const [jspdfModule, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  return {
    jsPDF: jspdfModule.default,
    html2canvas: html2canvasModule.default,
  };
}

interface PdfDocumentLike {
  addImage: (imageData: string, format: string, x: number, y: number, width: number, height: number) => void;
  addPage: () => void;
}

function paintCanvasAcrossPages(
  pdf: PdfDocumentLike,
  imgData: string,
  pdfWidth: number,
  pdfHeight: number
) {
  let heightLeft = pdfHeight;
  let position = 0;

  pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
  heightLeft -= A4_HEIGHT_MM;

  while (heightLeft > 0.5) {
    position = heightLeft - pdfHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= A4_HEIGHT_MM;
  }
}

export async function exportElementToPdf(
  elementId: string,
  fileName: string = 'invoice.pdf'
): Promise<Blob> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Invoice preview element "${elementId}" was not found`);
  }

  try {
    const { jsPDF, html2canvas } = await loadPdfLibraries();
    const canvas = await html2canvas(element, {
      scale: RENDER_SCALE,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: Math.max(element.scrollWidth, 800),
    });

    if (!canvas.width || !canvas.height) {
      throw new Error('Invoice preview rendered with zero size');
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    paintCanvasAcrossPages(pdf, imgData, pdfWidth, pdfHeight);
    pdf.save(fileName);
    return pdf.output('blob');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate PDF';
    throw new Error(message);
  }
}

export async function generatePdfBlob(
  element: HTMLElement,
  _title: string = 'Invoice'
): Promise<Blob> {
  try {
    const { jsPDF, html2canvas } = await loadPdfLibraries();
    const canvas = await html2canvas(element, {
      scale: RENDER_SCALE,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: Math.max(element.scrollWidth, 800),
    });

    if (!canvas.width || !canvas.height) {
      throw new Error('Invoice preview rendered with zero size');
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    paintCanvasAcrossPages(pdf, imgData, pdfWidth, pdfHeight);
    return pdf.output('blob');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate PDF';
    throw new Error(message);
  }
}
