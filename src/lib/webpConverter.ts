import { remove, writeFile, exists } from '@/services/secureFs';
import { ipImageApi, imageApi } from '@/services/tauri';
import { useIpImageStore, useImageStore, useUIStore, type IpImageWithRelations, type ImageWithRelations } from '@/stores';
import { convertFileSrc } from '@tauri-apps/api/core';

export async function convertIpImageToWebp(image: IpImageWithRelations, quality: number = 0.9): Promise<IpImageWithRelations> {
  if (image.format?.toLowerCase() === 'webp') {
    return image;
  }

  // Fetch the image to get a Blob
  const src = convertFileSrc(image.absolute_path);
  const response = await fetch(src);
  const blob = await response.blob();
  
  // Convert blob to WebP using canvas
  const webpBlob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas to Blob failed'));
      }, 'image/webp', quality);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image for conversion'));
    };
    img.src = URL.createObjectURL(blob);
  });

  const buffer = await webpBlob.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);

  // Generate new paths
  const oldPath = image.absolute_path;
  let newAbsolutePath = oldPath.replace(/\.[^/.]+$/, '.webp');
  let newFilename = image.filename.replace(/\.[^/.]+$/, '.webp');
  let newRelativePath = image.relative_path.replace(/\.[^/.]+$/, '.webp');

  if (await exists(newAbsolutePath) && newAbsolutePath !== oldPath) {
    const { settings } = useUIStore.getState();
    const template = settings.ipNamingTemplate || "{ip}-{date}-{time}";
    
    const parts = image.relative_path.split(/[/\\]/);
    const ipName = parts.length > 1 ? parts[1] : 'unknown';
    
    const now = new Date();
    const dateStr = image.created_at ? image.created_at.substring(0, 10) : now.toISOString().substring(0, 10);
    const timeStr = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0') + now.getSeconds().toString().padStart(2, '0');
    
    let candidateStem = template
      .replace("{ip}", ipName)
      .replace("{date}", dateStr)
      .replace("{time}", timeStr)
      .replace("{index}", timeStr)
      .replace("{original}", image.original_filename || "");
      
    let counter = 1;
    let finalFilename = `${candidateStem}.webp`;
    let basePath = newAbsolutePath.substring(0, newAbsolutePath.length - newFilename.length);
    let finalPath = basePath + finalFilename;
    
    while (await exists(finalPath)) {
       finalFilename = `${candidateStem}_${counter}.webp`;
       finalPath = basePath + finalFilename;
       counter++;
    }
    
    newAbsolutePath = finalPath;
    newRelativePath = newRelativePath.substring(0, newRelativePath.length - newFilename.length) + finalFilename;
    newFilename = finalFilename;
  }

  // Delete the old file first if we are overwriting, to ensure the file is truncated
  if (await exists(newAbsolutePath)) {
    try {
      await remove(newAbsolutePath);
    } catch (e) {
      console.warn('Failed to remove existing file before overwrite:', e);
    }
  }

  // Write new file
  await writeFile(newAbsolutePath, uint8Array);

  try {
    // Update DB
    const updatedImage = await ipImageApi.updateFile({
      ip_image_id: image.id,
      new_filename: newFilename,
      new_absolute_path: newAbsolutePath,
      new_relative_path: newRelativePath,
      new_format: 'WEBP',
      new_file_size: uint8Array.length,
    });

    // Delete old file
    if (oldPath !== newAbsolutePath) {
      try {
        await remove(oldPath);
      } catch (e) {
        console.error('Failed to remove old file after conversion', e);
      }
    }

    // Update store
    useIpImageStore.getState().updateImage(image.id, updatedImage as any);

    return updatedImage as any;
  } catch (error) {
    // If DB update fails, clean up the new file
    if (oldPath !== newAbsolutePath) {
      try {
        await remove(newAbsolutePath);
      } catch (e) {
        console.error('Failed to cleanup webp file after DB error', e);
      }
    }
    throw error;
  }
}

export async function convertFileToWebp(file: File, quality: number = 0.9): Promise<File> {
  if (file.type === 'image/webp') {
    return file;
  }

  const webpBlob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas to Blob failed'));
      }, 'image/webp', quality);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for conversion'));
    };
    img.src = url;
  });

  const originalName = file.name;
  const lastDot = originalName.lastIndexOf('.');
  const newName = lastDot !== -1 
    ? originalName.substring(0, lastDot) + '.webp' 
    : originalName + '.webp';
    
  return new File([webpBlob], newName, {
    type: 'image/webp',
    lastModified: Date.now(),
  });
}

export async function convertIpImageToPng(image: IpImageWithRelations): Promise<IpImageWithRelations> {
  if (image.format?.toLowerCase() === 'png') {
    return image;
  }

  // Fetch the image to get a Blob
  const src = convertFileSrc(image.absolute_path);
  const response = await fetch(src);
  const blob = await response.blob();
  
  // Convert blob to PNG using canvas
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas to Blob failed'));
      }, 'image/png');
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image for conversion'));
    };
    img.src = URL.createObjectURL(blob);
  });

  const buffer = await pngBlob.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);

  // Generate new paths
  const oldPath = image.absolute_path;
  let newAbsolutePath = oldPath.replace(/\.[^/.]+$/, '.png');
  let newFilename = image.filename.replace(/\.[^/.]+$/, '.png');
  let newRelativePath = image.relative_path.replace(/\.[^/.]+$/, '.png');

  if (await exists(newAbsolutePath) && newAbsolutePath !== oldPath) {
    const { settings } = useUIStore.getState();
    const template = settings.ipNamingTemplate || "{ip}-{date}-{time}";
    
    const parts = image.relative_path.split(/[/\\]/);
    const ipName = parts.length > 1 ? parts[1] : 'unknown';
    
    const now = new Date();
    const dateStr = image.created_at ? image.created_at.substring(0, 10) : now.toISOString().substring(0, 10);
    const timeStr = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0') + now.getSeconds().toString().padStart(2, '0');
    
    let candidateStem = template
      .replace("{ip}", ipName)
      .replace("{date}", dateStr)
      .replace("{time}", timeStr)
      .replace("{index}", timeStr)
      .replace("{original}", image.original_filename || "");
      
    let counter = 1;
    let finalFilename = `${candidateStem}.png`;
    let basePath = newAbsolutePath.substring(0, newAbsolutePath.length - newFilename.length);
    let finalPath = basePath + finalFilename;
    
    while (await exists(finalPath)) {
       finalFilename = `${candidateStem}_${counter}.png`;
       finalPath = basePath + finalFilename;
       counter++;
    }
    
    newAbsolutePath = finalPath;
    newRelativePath = newRelativePath.substring(0, newRelativePath.length - newFilename.length) + finalFilename;
    newFilename = finalFilename;
  }

  // Delete the old file first if we are overwriting, to ensure the file is truncated
  if (await exists(newAbsolutePath)) {
    try {
      await remove(newAbsolutePath);
    } catch (e) {
      console.warn('Failed to remove existing file before overwrite:', e);
    }
  }

  // Write new file
  await writeFile(newAbsolutePath, uint8Array);

  try {
    // Update DB
    const updatedImage = await ipImageApi.updateFile({
      ip_image_id: image.id,
      new_filename: newFilename,
      new_absolute_path: newAbsolutePath,
      new_relative_path: newRelativePath,
      new_format: 'PNG',
      new_file_size: uint8Array.length,
    });

    // Delete old file
    if (oldPath !== newAbsolutePath) {
      try {
        await remove(oldPath);
      } catch (e) {
        console.error('Failed to remove old file after conversion', e);
      }
    }

    // Update store
    useIpImageStore.getState().updateImage(image.id, updatedImage as any);

    return updatedImage as any;
  } catch (error) {
    // If DB update fails, clean up the new file
    if (oldPath !== newAbsolutePath) {
      try {
        await remove(newAbsolutePath);
      } catch (e) {
        console.error('Failed to cleanup png file after DB error', e);
      }
    }
    throw error;
  }
}

export async function convertFileToPng(file: File): Promise<File> {
  if (file.type === 'image/png') {
    return file;
  }

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas to Blob failed'));
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for conversion'));
    };
    img.src = url;
  });

  const originalName = file.name;
  const lastDot = originalName.lastIndexOf('.');
  const newName = lastDot !== -1 
    ? originalName.substring(0, lastDot) + '.png' 
    : originalName + '.png';
    
  return new File([pngBlob], newName, {
    type: 'image/png',
    lastModified: Date.now(),
  });
}


export async function convertImageToWebp(image: ImageWithRelations, quality: number = 0.9): Promise<ImageWithRelations> {
  if (image.format?.toLowerCase() === 'webp') {
    return image;
  }

  // Fetch the image to get a Blob
  const src = convertFileSrc(image.absolute_path);
  const response = await fetch(src);
  const blob = await response.blob();
  
  // Convert blob to WebP using canvas
  const webpBlob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas to Blob failed'));
      }, 'image/webp', quality);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image for conversion'));
    };
    img.src = URL.createObjectURL(blob);
  });

  const buffer = await webpBlob.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);

  // Generate new paths
  const oldPath = image.absolute_path;
  let newAbsolutePath = oldPath.replace(/\.[^/.]+$/, '.webp');
  let newFilename = image.filename.replace(/\.[^/.]+$/, '.webp');
  let newRelativePath = image.relative_path.replace(/\.[^/.]+$/, '.webp');

  if (await exists(newAbsolutePath) && newAbsolutePath !== oldPath) {
    const { settings } = useUIStore.getState();
    const template = settings.ipNamingTemplate || "{ip}-{date}-{time}";
    
    const parts = image.relative_path.split(/[\\/]/);
    const ipName = parts.length > 1 ? parts[1] : 'unknown';
    
    const now = new Date();
    const dateStr = image.created_at ? image.created_at.substring(0, 10) : now.toISOString().substring(0, 10);
    const timeStr = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0') + now.getSeconds().toString().padStart(2, '0');
    
    let candidateStem = template
      .replace("{ip}", ipName)
      .replace("{date}", dateStr)
      .replace("{time}", timeStr)
      .replace("{index}", timeStr)
      .replace("{original}", image.original_filename || "");
      
    let counter = 1;
    let finalFilename = `${candidateStem}.webp`;
    let basePath = newAbsolutePath.substring(0, newAbsolutePath.length - newFilename.length);
    let finalPath = basePath + finalFilename;
    
    while (await exists(finalPath)) {
       finalFilename = `${candidateStem}_${counter}.webp`;
       finalPath = basePath + finalFilename;
       counter++;
    }
    
    newAbsolutePath = finalPath;
    newRelativePath = newRelativePath.substring(0, newRelativePath.length - newFilename.length) + finalFilename;
    newFilename = finalFilename;
  }

  // Delete the old file first if we are overwriting, to ensure the file is truncated
  if (await exists(newAbsolutePath)) {
    try {
      await remove(newAbsolutePath);
    } catch (e) {
      console.warn('Failed to remove existing file before overwrite:', e);
    }
  }

  // Write new file
  await writeFile(newAbsolutePath, uint8Array);

  try {
    // Update DB
    const updatedImage = await imageApi.updateFile({
      image_id: image.id,
      new_filename: newFilename,
      new_absolute_path: newAbsolutePath,
      new_relative_path: newRelativePath,
      new_format: 'WEBP',
      new_file_size: uint8Array.length,
    });

    // Delete old file
    if (oldPath !== newAbsolutePath) {
      try {
        await remove(oldPath);
      } catch (e) {
        console.error('Failed to remove old file after conversion', e);
      }
    }

    // Update store
    useImageStore.getState().updateImage(image.id, updatedImage as any);

    return updatedImage as any;
  } catch (error) {
    // If DB update fails, clean up the new file
    if (oldPath !== newAbsolutePath) {
      try {
        await remove(newAbsolutePath);
      } catch (e) {
        console.error('Failed to cleanup webp file after DB error', e);
      }
    }
    throw error;
  }
}

export async function convertImageToPng(image: ImageWithRelations): Promise<ImageWithRelations> {
  if (image.format?.toLowerCase() === 'png') {
    return image;
  }

  // Fetch the image to get a Blob
  const src = convertFileSrc(image.absolute_path);
  const response = await fetch(src);
  const blob = await response.blob();
  
  // Convert blob to PNG using canvas
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas to Blob failed'));
      }, 'image/png');
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image for conversion'));
    };
    img.src = URL.createObjectURL(blob);
  });

  const buffer = await pngBlob.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);

  // Generate new paths
  const oldPath = image.absolute_path;
  let newAbsolutePath = oldPath.replace(/\.[^/.]+$/, '.png');
  let newFilename = image.filename.replace(/\.[^/.]+$/, '.png');
  let newRelativePath = image.relative_path.replace(/\.[^/.]+$/, '.png');

  if (await exists(newAbsolutePath) && newAbsolutePath !== oldPath) {
    const { settings } = useUIStore.getState();
    const template = settings.ipNamingTemplate || "{ip}-{date}-{time}";
    
    const parts = image.relative_path.split(/[\\/]/);
    const ipName = parts.length > 1 ? parts[1] : 'unknown';
    
    const now = new Date();
    const dateStr = image.created_at ? image.created_at.substring(0, 10) : now.toISOString().substring(0, 10);
    const timeStr = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0') + now.getSeconds().toString().padStart(2, '0');
    
    let candidateStem = template
      .replace("{ip}", ipName)
      .replace("{date}", dateStr)
      .replace("{time}", timeStr)
      .replace("{index}", timeStr)
      .replace("{original}", image.original_filename || "");
      
    let counter = 1;
    let finalFilename = `${candidateStem}.png`;
    let basePath = newAbsolutePath.substring(0, newAbsolutePath.length - newFilename.length);
    let finalPath = basePath + finalFilename;
    
    while (await exists(finalPath)) {
       finalFilename = `${candidateStem}_${counter}.png`;
       finalPath = basePath + finalFilename;
       counter++;
    }
    
    newAbsolutePath = finalPath;
    newRelativePath = newRelativePath.substring(0, newRelativePath.length - newFilename.length) + finalFilename;
    newFilename = finalFilename;
  }

  // Delete the old file first if we are overwriting, to ensure the file is truncated
  if (await exists(newAbsolutePath)) {
    try {
      await remove(newAbsolutePath);
    } catch (e) {
      console.warn('Failed to remove existing file before overwrite:', e);
    }
  }

  // Write new file
  await writeFile(newAbsolutePath, uint8Array);

  try {
    // Update DB
    const updatedImage = await imageApi.updateFile({
      image_id: image.id,
      new_filename: newFilename,
      new_absolute_path: newAbsolutePath,
      new_relative_path: newRelativePath,
      new_format: 'PNG',
      new_file_size: uint8Array.length,
    });

    // Delete old file
    if (oldPath !== newAbsolutePath) {
      try {
        await remove(oldPath);
      } catch (e) {
        console.error('Failed to remove old file after conversion', e);
      }
    }

    // Update store
    useImageStore.getState().updateImage(image.id, updatedImage as any);

    return updatedImage as any;
  } catch (error) {
    // If DB update fails, clean up the new file
    if (oldPath !== newAbsolutePath) {
      try {
        await remove(newAbsolutePath);
      } catch (e) {
        console.error('Failed to cleanup png file after DB error', e);
      }
    }
    throw error;
  }
}
