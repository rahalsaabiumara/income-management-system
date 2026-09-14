# Income Management System

Web-based application to manage and process management reports (Laporan Manajemen), sync with Google Drive/Sheets, detect target tables in PDF documents using Gemini Vision API, and generate Excel reports.

## Overview

The Income Management System (LM Manager) streamlines the workflow of retrieving PDF reports from Google Drive, extracting tabular data (such as PDPT, LR, NERACA, ARUS KAS) using AI (Gemini Vision API), and automatically converting them into structured Excel files and Google Sheets. It integrates with Supabase for data management and provides a comprehensive dashboard for processing files in batches.

## Features

- **Google Drive & Sheets Sync**: Automatically sync Master data from Google Sheets and download files from Drive.
- **PDF Lampiran Detection & Extraction**: Detect specific attachments within large PDF reports.
- **AI Table Extraction**: Uses Gemini Vision API to accurately extract tables from PDF pages.
- **Excel Generation**: Convert extracted data into structured Excel files based on predefined templates.
- **Batch Processing**: Process multiple files simultaneously, compress into ZIP, or upload directly back to Google Drive.
- **Data Management Dashboard**: Manage files, import CSVs, and trigger pipelines directly from the UI.

## Tech Stack

| Technology | Usage |
| ---------- | ----- |
| **React 19** | Frontend UI Library |
| **Vite** | Frontend Build Tool |
| **Tailwind CSS v4** | UI Styling |
| **TanStack Query** | Data Fetching & State Management |
| **Node.js & Express** | Backend Server |
| **Supabase** | Backend Database & Auth Client |
| **Google APIs** | Drive & Sheets Integration |
| **Gemini Vision API** | AI-based Table Extraction |
| **pdf-lib & pdfjs-dist** | PDF Processing |
| **xlsx & papaparse** | Excel and CSV Parsing/Writing |

## Project Structure

```text
project/
├── public/         # Public static assets
├── src/            # Frontend React source code
│   ├── assets/     # Images and template files
│   ├── components/ # Reusable UI components
│   ├── lib/        # API client utilities
│   ├── pages/      # React pages (Dashboard)
│   ├── index.css   # Tailwind and global styles
│   └── App.jsx     # Main application component
├── server/         # Backend Express server
│   ├── data/       # Cached Excel files and tabular data
│   ├── schemas/    # Validation schemas
│   ├── services/   # Business logic (Google API, Gemini, Supabase, PDF)
│   └── index.js    # Express server entry point
├── package.json    # Project dependencies and scripts
└── vite.config.js  # Vite configuration
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) installed
- Google Cloud Console Project with Drive API and Sheets API enabled
- `credentials.json` for Google Service Account/OAuth
- Gemini API Key
- Supabase Project (URL and Anon Key)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/rahalsaabiumara/income-management-system.git
   cd income-management-system
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Environment Variables

Create a `.env` file in the root directory based on `.env.example`:

```env
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_CREDENTIALS_PATH=./credentials.json
PORT=3001
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_TABULAR_SPREADSHEET_ID=your_tabular_spreadsheet_id

VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

SUPABASE_URL=your_supabase_url
SUPABASE_SECRET_KEY=your_supabase_secret_key
```

### Run the Project

To run both the frontend and backend simultaneously, you can run:

```bash
npm run dev
npm run dev:server
```
*(Run these commands in separate terminal tabs, or configure a concurrent script)*

### Build

To build the frontend for production:

```bash
npm run build
```

## Usage

1. Open the application in your browser (default `http://localhost:5173`).
2. Click **Sync Data** to retrieve the latest master data from Google Sheets.
3. Select a file from the Master Table and click **Convert to Excel** to extract data using Gemini AI.
4. Use the **Batch Upload** or **Download ZIP** actions to process multiple files.

## API / Integration

The backend provides several REST endpoints:
- `GET /api/master`: Fetch master data from Google Sheets.
- `POST /api/sync`: Trigger Drive to Master synchronization.
- `POST /api/process-report`: Orchestrate the PDF to Excel conversion pipeline.
- `GET /api/lampiran/:fileId`: Download extracted lampiran PDF.
- Google APIs: Uses Drive API for downloading/uploading reports and Sheets API for reading/writing tabular data.
- Gemini API: Analyzes PDF pages and returns structured JSON tables.

## Database

The project integrates with **Supabase** for potential frontend/backend database needs alongside Google Sheets which acts as the primary data master.

## Author

Rahalsa Abi Umara
