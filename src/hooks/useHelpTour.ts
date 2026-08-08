import { useCallback } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

/**
 * Resolve a tour target to the VISIBLE element.
 *
 * The durable nav renders the same item ids in the desktop sidebar, the
 * mobile bottom bar, and the mobile drawer. On mobile the sidebar is
 * display:none and on desktop the bottom bar is display:none — driver.js
 * must anchor to the element that is actually on screen.
 */
function pickVisibleElement(id: string): string | HTMLElement {
  const direct = document.getElementById(id);
  if (!direct) return id; // let driver.js report a missing element

  const candidates = [
    document.querySelector(`.app-sidebar #${id}`),
    document.querySelector(`.app-bottom-bar #${id}`),
    direct,
  ].filter(Boolean) as HTMLElement[];

  return candidates.find((el) => el.offsetParent !== null) ?? direct;
}

interface StepDef {
  element: string;
  popover: {
    title: string;
    description: string;
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
  };
}

const STEP_DEFS: StepDef[] = [
  {
    element: '#tab-editor',
    popover: {
      title: '1 · Design your template',
      description:
        'Start here: upload a PDF and drop fields (Text, Checkbox, Image, Signature) onto it with the visual editor.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#pdf-upload-input',
    popover: {
      title: 'Upload PDF',
      description: 'Upload a fillable PDF to use as your template base.',
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
    element: '#tab-scan',
    popover: {
      title: '2 · Scan with AI',
      description:
        'No Excel file handy? Use AI Scan to extract data straight from a student document — or Bulk Scan for many files at once.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '#tab-generate',
    popover: {
      title: '3 · Generate PDFs',
      description:
        'Map your template fields to an Excel file or AI scan, then generate hundreds of filled PDFs in seconds.',
      side: 'bottom',
      align: 'start',
    },
  },
];

export function useHelpTour() {
  const startTour = useCallback(() => {
    // Only include steps whose target actually exists in the current view
    // (editor-only targets are skipped when the tour starts elsewhere).
    const steps = STEP_DEFS.filter((step) => document.querySelector(step.element)).map((step) => ({
      ...step,
      element: pickVisibleElement(step.element.replace('#', '')),
    }));

    if (steps.length === 0) return;

    const driverObj = driver({
      showProgress: true,
      steps,
    });
    driverObj.drive();
  }, []);

  return { startTour };
}
