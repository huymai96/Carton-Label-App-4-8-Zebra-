# Setup Guide for Carton Label App

## Initial Setup (First Time)

### 1. Clone the Repository

**Option A: Using Cursor's Built-in Git**
1. Open Cursor
2. Go to **File → Clone Repository** (or press `Ctrl+Shift+P` and type "Git: Clone")
3. Enter the repository URL: `https://github.com/huymai96/Carton-Label-App-4-8-Zebra-.git`
4. Choose a folder to save the project
5. Click "Open" when prompted

**Option B: Using Terminal**
```bash
# Navigate to where you want the project
cd C:\YourProjectsFolder

# Clone the repository
git clone https://github.com/huymai96/Carton-Label-App-4-8-Zebra-.git

# Open the folder in Cursor
cd Carton-Label-App-4-8-Zebra-
```

### 2. Open Project in Cursor

1. **File → Open Folder**
2. Navigate to the cloned `Carton-Label-App-4-8-Zebra-` folder
3. Click "Select Folder"

### 3. Install Dependencies

Open the integrated terminal in Cursor (`Ctrl+`` or **Terminal → New Terminal**) and run:

```bash
npm install
```

This will install all required packages (React, PapaParse, jsPDF, JsBarcode, etc.)

### 4. Verify Setup

Check that these files exist:
- `package.json` - Project configuration
- `src/App.jsx` - Main application
- `src/config/targetConfig.js` - Target mode configuration
- `src/utils/targetPacking.js` - Target mode logic
- `vite.config.js` - Build configuration

---

## Daily Workflow (Adding New Features)

### 1. Pull Latest Changes

**Before starting work**, always pull the latest changes:

```bash
# Make sure you're on the main branch
git checkout main

# Pull latest changes from GitHub
git pull origin main
```

### 2. Create a Feature Branch (Recommended)

```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name

# Example:
git checkout -b feature/add-new-packing-mode
```

### 3. Make Your Changes

- Edit files in Cursor
- Test your changes locally
- Use the terminal to run tests if needed

### 4. Test Locally

```bash
# Start development server (if you have one configured)
npm run dev

# Or run tests
node test-target-mode.js
```

### 5. Commit Your Changes

```bash
# Check what files changed
git status

# Add files you want to commit
git add src/App.jsx
# Or add all changes: git add .

# Commit with a descriptive message
git commit -m "Add new feature: description of what you did"
```

### 6. Push to GitHub

```bash
# Push your feature branch
git push origin feature/your-feature-name

# Or if working directly on main (not recommended for team projects)
git push origin main
```

### 7. Vercel Auto-Deployment

- Vercel automatically deploys when you push to `main` branch
- Check deployment status at: https://vercel.com/dashboard

---

## Quick Reference Commands

### Git Basics

```bash
# Check current status
git status

# See what branch you're on
git branch

# Switch branches
git checkout main
git checkout feature/your-branch

# View commit history
git log --oneline

# Discard local changes (be careful!)
git restore filename.js
```

### Common Workflows

**Scenario 1: Starting fresh work**
```bash
git checkout main
git pull origin main
git checkout -b feature/new-feature
# Make changes, commit, push
```

**Scenario 2: Updating existing feature**
```bash
git checkout feature/your-feature
git pull origin main  # Get latest from main
# Make changes, commit, push
```

**Scenario 3: Quick fix on main**
```bash
git checkout main
git pull origin main
# Make changes
git add .
git commit -m "Fix: description"
git push origin main
```

---

## Project Structure

```
Carton-Label-App-4-8-Zebra-/
├── src/
│   ├── App.jsx              # Main application component
│   ├── config/
│   │   └── targetConfig.js  # Target mode configuration
│   └── utils/
│       └── targetPacking.js # Target mode packing logic
├── index.html               # HTML entry point
├── package.json             # Dependencies
├── vite.config.js          # Vite build config
└── test-target-mode.js     # Test script
```

---

## Troubleshooting

### "Repository not found" error
- Make sure you're authenticated with GitHub
- Check that you have access to the repository

### "Branch is behind" error
```bash
git pull origin main
# Resolve any conflicts if they occur
```

### "Uncommitted changes" error
```bash
# Save your work first
git add .
git commit -m "WIP: saving progress"

# Then pull
git pull origin main
```

### Reset to match remote exactly
```bash
# WARNING: This discards all local changes!
git fetch origin
git reset --hard origin/main
```

---

## Tips for Cursor

1. **Use the Command Palette**: `Ctrl+Shift+P` (Windows) or `Cmd+Shift+P` (Mac)
   - Type "Git" to see all Git commands
   - Type "Terminal" for terminal options

2. **Source Control Panel**: 
   - Click the Git icon in the left sidebar
   - See all changes, stage files, commit directly from UI

3. **Integrated Terminal**:
   - `Ctrl+`` to toggle terminal
   - Right-click terminal for more options

4. **File Explorer**:
   - Right-click files for Git options (commit, diff, etc.)

---

## Next Steps After Setup

1. ✅ Clone repository
2. ✅ Install dependencies (`npm install`)
3. ✅ Open in Cursor
4. ✅ Pull latest changes (`git pull origin main`)
5. ✅ Create feature branch (`git checkout -b feature/name`)
6. ✅ Start coding!

---

## Need Help?

- Check Git status: `git status`
- View recent commits: `git log --oneline -10`
- See remote repository: `git remote -v`

