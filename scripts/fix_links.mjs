import fs from 'fs';
import path from 'path';

const DOCS_DIR = path.resolve('d:/dev/san/sanOmni/docs');

// Create a map of filename -> relative path from docs dir
// e.g., 'USAGE.md' -> 'guides/USAGE.md'
const fileMap = new Map();

function buildFileMap(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      buildFileMap(fullPath);
    } else if (file.endsWith('.md')) {
      const relPath = path.relative(DOCS_DIR, fullPath).replace(/\\/g, '/');
      fileMap.set(file, relPath);
    }
  }
}

buildFileMap(DOCS_DIR);

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const fileDir = path.dirname(filePath);
  const relFromDocsToHere = path.relative(DOCS_DIR, fileDir).replace(/\\/g, '/');
  
  // Regex to match markdown links: [text](./FILE.md) or [text](FILE.md) or [text](../FILE.md)
  // that point to another markdown file.
  const linkRegex = /\[([^\]]+)\]\((?:\.\/|\.\.\/)?([a-zA-Z0-9_-]+\.md)(#[a-zA-Z0-9_-]+)?\)/g;
  
  let changed = false;
  const newContent = content.replace(linkRegex, (match, text, filename, hash) => {
    // If we know this file
    if (fileMap.has(filename)) {
      const targetRelPath = fileMap.get(filename); // e.g., features/USAGE.md
      
      // Calculate relative path from current file's dir to target file's dir
      let newLinkPath = path.relative(fileDir, path.join(DOCS_DIR, targetRelPath)).replace(/\\/g, '/');
      
      if (!newLinkPath.startsWith('.')) {
        newLinkPath = './' + newLinkPath;
      }
      
      const hashStr = hash || '';
      changed = true;
      return `[${text}](${newLinkPath}${hashStr})`;
    }
    return match;
  });

  if (changed) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`Updated links in ${path.relative(DOCS_DIR, filePath)}`);
  }
}

function processAllFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processAllFiles(fullPath);
    } else if (file.endsWith('.md')) {
      processFile(fullPath);
    }
  }
}

processAllFiles(DOCS_DIR);
console.log('Done fixing links.');
