# EndowFill

A collaborative PDF template editor and bulk generation tool built with React, TypeScript, and Vite.

## Features

### PDF Template Editor
- **Drag-and-drop field designer** - Upload PDF templates and place text, image, and signature fields visually
- **Real-time preview** - See exactly how filled PDFs will look before generation
- **Template versioning** - Automatic snapshots and change tracking

### Bulk PDF Generation
- **Excel/CSV import** - Upload data files to generate hundreds of filled PDFs
- **Field mapping** - Map Excel columns to template fields with intuitive UI
- **Validation rules** - Define validation constraints for data quality assurance
- **Conditional rules** - Dynamic field behavior based on data values
- **Custom filenames** - Pattern-based naming using your data fields
- **Progress tracking** - Real-time generation progress with pause/resume support

### Workspace Collaboration
- **Multi-user workspaces** - Organize templates into shared workspaces
- **Role-based access** - Owner (full access), Editor (edit), Viewer (read-only)
- **Invite system** - Email invites and join requests for workspace access
- **Template sharing** - Export/import templates in portable `.pdftemplate` format

### Technical Features
- **Offline support** - IndexedDB for local storage and caching
- **Auto-save** - Automatic template saving to Supabase
- **Dark/Light/System theme** - Adaptive theming with CSS variables
- **Responsive design** - Tailwind CSS styling

## Tech Stack

- **React 19** with TypeScript
- **Vite** for fast development/build
- **pdfme** for PDF editing and generation
- **Supabase** for authentication and database
- **Zustand** for state management
- **Tailwind CSS** for styling

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (free tier works)

### Installation

```bash
npm install
```

### Configuration

1. Copy `.env.example` to `.env.local`
2. Fill in your Supabase credentials:
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` - Your anon/public key

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Testing

```bash
npm run test
```

## Database Schema

The application requires the following Supabase tables:

- `profiles` - User profile information
- `workspaces` - Workspace metadata
- `workspace_members` - User membership (workspace_id, user_id, role)
- `templates` - PDF template data and schema
- `join_requests` - Workspace join requests
- `template_snapshots` - Template version history

## Project Structure

```
src/
├── components/
│   ├── editor/       # PDF editor UI (toolbar, sidebar, canvas)
│   ├── bulk/         # Bulk generation components
│   ├── workspace/    # Workspace UI components
│   ├── layout/       # Navbar, tabs, navigation
│   └── ui/           # Shared UI components
├── pages/
│   ├── WelcomePage.tsx    # Landing page
│   ├── AuthPage.tsx       # Authentication
│   ├── HomePage.tsx       # Workspace dashboard
│   ├── WorkspacePage.tsx  # Workspace detail
│   ├── EditorPage.tsx     # PDF editor
│   ├── BulkGeneratePage.tsx # Bulk generation
│   └── InvitePage.tsx     # Invite acceptance
├── services/        # Supabase queries and business logic
├── hooks/           # Custom React hooks
├── store/           # Zustand state management
└── utils/           # Helper functions
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build |
| `npm run test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |

## License

MIT