import { useCallback } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export function useHelpTour() {
  const startTour = useCallback(() => {
    const driverObj = driver({
      showProgress: true,
      steps: [
        {
          element: '#pdf-upload-input', // or upload btn
          popover: {
            title: 'Upload PDF',
            description: 'Start by uploading a fillable PDF to use as your template base.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '.pdfme-designer-container',
          popover: {
            title: 'Design Template',
            description: 'Drag and drop fields like Text, Checkbox, Image, or Signature onto your PDF.',
            side: 'left',
            align: 'start',
          },
        },
        {
          element: '#field-search-input',
          popover: {
            title: 'Manage Fields',
            description: 'View all your added fields here. You can group them logically or delete unused ones.',
            side: 'right',
            align: 'start',
          },
        },
        {
          element: 'button:has(svg.lucide-file-spreadsheet)',
          popover: {
            title: 'Bulk Generation',
            description: 'Switch to the Generate tab to map your fields to an Excel file and generate thousands of PDFs.',
            side: 'bottom',
            align: 'start',
          },
        },
      ],
    });
    driverObj.drive();
  }, []);

  return { startTour };
}
