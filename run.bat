@echo off
setlocal

cd /d "%~dp0"

echo Starting development server...

if not exist "node_modules" (
  echo node_modules not found. Installing dependencies first...
  call npm install
  if errorlevel 1 (
    echo Failed to install dependencies.
    exit /b 1
  )
)

node "node_modules\vite\bin\vite.js"
