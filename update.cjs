const fs = require('fs');
let content = fs.readFileSync('src/components/DropZone.tsx', 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

// Import useEffect is already added, but let's make sure:
if (!content.includes('import { useState, useCallback, useEffect }')) {
  content = content.replace('import { useState, useCallback } from "react";', 'import { useState, useCallback, useEffect } from "react";');
}

const target1 = `  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/")
    );

    if (files.length === 0) {
      console.warn("No image files in drop");
      return;
    }

    // In Tauri, dropped files have a 'path' property with the full path
    const paths = files.map(file => {
      // @ts-ignore - Tauri adds path property to File objects
      const filePath = file.path;
      if (!filePath) {
        console.error("File has no path property:", file.name);
        return null;
      }
      return filePath;
    }).filter((p): p is string => p !== null);

    if (paths.length === 0) {
      console.error("No valid file paths found");
      return;
    }

    console.log("Importing dropped files:", paths);
    await importPaths(paths);
  }, []);`;

const replacement1 = `  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isMounted = true;

    async function setupDragDrop() {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const listener = await getCurrentWebviewWindow().onDragDropEvent((event) => {
          if (event.payload.type === 'enter') {
            setIsDragging(true);
          } else if (event.payload.type === 'leave') {
            setIsDragging(false);
          } else if (event.payload.type === 'drop') {
            setIsDragging(false);
            const paths = event.payload.paths.filter(p => isImageFile(p));
            if (paths.length > 0) {
              importPaths(paths);
            } else {
              console.warn("No valid image files in drop");
            }
          }
        });
        
        if (isMounted) {
          unlisten = listener;
        } else {
          listener(); // unlisten immediately if component unmounted
        }
      } catch (error) {
        console.error("Failed to setup Tauri drag drop event:", error);
      }
    }

    setupDragDrop();

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);`;

content = content.replace(target1, replacement1);

const target2 = `    <div
      className={\`flex-1 flex items-center justify-center p-8 \${
        isDragging ? "bg-primary/5" : ""
      }\`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >`;

const replacement2 = `    <div
      className={\`flex-1 flex items-center justify-center p-8 \${
        isDragging ? "bg-primary/5" : ""
      }\`}
    >`;

content = content.replace(target2, replacement2);

fs.writeFileSync('src/components/DropZone.tsx', content);
console.log('DropZone.tsx updated successfully');
